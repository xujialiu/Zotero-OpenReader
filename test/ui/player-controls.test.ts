import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The Player's own page (addon/content/player.js + player-controls.js) runs
 * in an iframe that the host stretches to 460 px while a menu is open
 * (zttsResizePreview). Only its own document hears a click on it. A click in
 * the reader's view, a sibling document, reaches it as a lost focus (the
 * focused element's focusout, then the window's blur); a click on the
 * reader's toolbar or sidebar reaches it not at all, and the host closes the
 * menu through zttsClosePopover instead (issue #213).
 */
class El {
  children: El[] = [];
  parent: El | null = null;
  className = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  scrollTop = 0;
  offsetWidth = 305;
  onclick: unknown;
  constructor(public tag: string, className = '', public focusTarget?: { active: El | null }) {
    this.className = className;
  }
  classList = {
    add: (...names: string[]) => {
      this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' ');
    },
    contains: (name: string) => this.className.split(' ').includes(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.contains(name);
      this.className = this.className.split(' ').filter((n) => n && n !== name).concat(on ? [name] : []).join(' ');
    },
  };
  setAttribute(name: string, value: unknown) {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  append(...nodes: El[]) {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: El[]) {
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  contains(node: El | null): boolean {
    return !!node && (node === this || this.children.some((child) => child.contains(node)));
  }
  all(): El[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  querySelector(selector: string): El | null {
    return this.all().find((el) => el.is(selector)) ?? null;
  }
  querySelectorAll(selector: string): El[] {
    return this.all().filter((el) => el.is(selector));
  }
  is(selector: string) {
    return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tag === selector;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 34, width: 100, height: 34 };
  }
  focus() {
    if (this.focusTarget) this.focusTarget.active = this;
  }
}

/** The real Player page scripts over a minimal DOM; only the host's resize callback is a stand-in. */
function loadPlayer(layout: 'top' | 'A') {
  const focus = { active: null as El | null };
  const make = (tag: string, className = '') => new El(tag, className, focus);
  const body = make('body');
  const fixed = new Map<string, El>();
  const fixedEl = (selector: string, tag = 'div', className = '') => {
    const el = make(tag, className);
    fixed.set(selector, el);
    return el;
  };
  for (const selector of ['#player-root', '.play', '.options-toggle', '.mode', '.layout-menu', '.status-button', '.player', '.remaining-time', '.voice-group']) fixedEl(selector);
  const pickers = ['provider', 'locale', 'voice'].map((key) => {
    const button = fixedEl(`[data-pick="${key}"]`, 'button');
    button.dataset.pick = key;
    button.append(make('span', 'value'), make('span', 'time-left'));
    return button;
  });
  for (const key of ['speed', 'volume']) fixedEl(`[data-adjust="${key}"]`, 'button').append(make('span', 'adjust-value'));
  const groups: Record<string, El[]> = {
    '[data-pick]': pickers,
    '[data-adjust]': [fixed.get('[data-adjust="speed"]')!, fixed.get('[data-adjust="volume"]')!],
    '[data-navigate]': [],
  };

  const listeners = { document: new Map<string, Array<(event: any) => void>>(), window: new Map<string, Array<(event: any) => void>>() };
  const listen = (where: 'document' | 'window') => (type: string, fn: (event: any) => void) => {
    listeners[where].set(type, [...(listeners[where].get(type) ?? []), fn]);
  };
  const document = {
    body,
    get activeElement() {
      return focus.active;
    },
    createElement: (tag: string) => make(tag),
    querySelector: (selector: string) => fixed.get(selector) ?? body.querySelector(selector),
    querySelectorAll: (selector: string) => groups[selector] ?? body.querySelectorAll(selector),
    addEventListener: listen('document'),
  };
  const heights: number[] = [];
  const sandbox: Record<string, unknown> = {
    document,
    location: { search: `?embedded=1&variant=${layout}` },
    URLSearchParams,
    innerWidth: 1200,
    innerHeight: 460,
    addEventListener: listen('window'),
    zttsResizePreview: (height: number) => heights.push(height),
  };
  sandbox.window = sandbox;
  const context = createContext(sandbox);
  for (const file of ['player.js', 'player-controls.js']) runInContext(readFileSync(new URL(`../../addon/content/${file}`, import.meta.url), 'utf8'), context);

  const fire = (where: 'document' | 'window', type: string, event: Record<string, unknown> = {}) => {
    for (const fn of listeners[where].get(type) ?? []) fn({ type, ...event });
  };
  const update = (state: Record<string, unknown>) => (sandbox.zttsUpdate as (json: string) => void)(JSON.stringify(state));
  update({
    provider: 'p', locale: 'en', voice: 'v1', speed: 1, volume: 100, automatic: true, playing: false, active: true,
    providers: [{ value: 'p', label: 'P' }], locales: [{ value: 'en', label: 'English' }],
    voices: [{ value: 'v1', label: 'Voice 1' }, { value: 'v2', label: 'Voice 2' }], favorites: [],
  });
  const openVoiceList = () => (pickers[2].onclick as () => void)();
  /** What a click in the reader's view sends the Player: its focused element's focusout, then its window's blur, and no pointerdown. */
  const clickInTheView = () => {
    const focused = focus.active;
    focus.active = null;
    fire('document', 'focusout', { target: focused, relatedTarget: null });
    fire('window', 'blur');
  };
  const popover = () => body.querySelector('.popover');
  /** A click on the option labelled `label` in the open menu. */
  const pick = (label: string) => {
    const option = body.querySelectorAll('.option').find((el) => (el as unknown as { title: string }).title === label);
    if (!option) throw new Error(`no option ${label}`);
    (option.onclick as () => void)();
  };
  const openPicker = (key: 'provider' | 'locale' | 'voice') => (pickers[['provider', 'locale', 'voice'].indexOf(key)].onclick as () => void)();
  return { sandbox, body, heights, fire, update, pick, openPicker, play: fixed.get('.play')!, openVoiceList, clickInTheView,
    isOpen: () => !!popover(), menu: () => popover()?.getAttribute('aria-label') ?? null };
}

describe('an open Player menu and a click outside the Player (#213)', () => {
  for (const layout of ['top', 'A'] as const) {
    describe(`the ${layout === 'top' ? 'Top bar' : 'Bottom bar'}`, () => {
      it("opens, asks the host for 460 px, and a click on the Player's own page closes it", () => {
        const player = loadPlayer(layout);
        player.openVoiceList();
        expect(player.isOpen()).toBe(true);
        expect(player.heights.at(-1)).toBe(460);
        player.fire('document', 'pointerdown', { target: player.body });
        expect(player.isOpen()).toBe(false);
        expect(player.heights.at(-1)).toBe(34);
      });

      it('closes when the document is clicked, and gives the 460 px back', () => {
        const player = loadPlayer(layout);
        player.openVoiceList();
        player.clickInTheView();
        expect(player.isOpen(), 'the voice list is still open over the page').toBe(false);
        expect(player.heights.at(-1), 'the host frame is still 460 px tall').toBe(34);
      });

      it("closes when the host says the reader's own page was clicked, and gives the 460 px back", () => {
        const player = loadPlayer(layout);
        player.openVoiceList();
        (player.sandbox.zttsClosePopover as () => void)();
        expect(player.isOpen()).toBe(false);
        expect(player.heights.at(-1)).toBe(34);
      });

      it('asks the host for nothing when no menu is open', () => {
        const player = loadPlayer(layout);
        const asked = player.heights.length;
        player.clickInTheView();
        (player.sandbox.zttsClosePopover as () => void)();
        expect(player.heights).toHaveLength(asked);
      });
    });
  }
});

describe('a pick that leaves the Player without a voice (issue #224)', () => {
  const STATE = {
    provider: 'p', locale: 'en', voice: 'v1', speed: 1, volume: 100, automatic: true, playing: true, active: true, chooseVoice: false,
    providers: [{ value: 'p', label: 'P' }, { value: 'q', label: 'Q' }], locales: [{ value: 'en', label: 'English' }, { value: 'fr', label: 'French' }],
    voices: [{ value: 'v1', label: 'Voice 1' }, { value: 'v2', label: 'Voice 2' }], favorites: [],
  };

  it('grays Play out while no voice is chosen', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    expect((player.play as unknown as { disabled: boolean }).disabled).toBe(false);
    player.update({ ...STATE, playing: false, voice: '', chooseVoice: true });
    expect((player.play as unknown as { disabled: boolean }).disabled).toBe(true);
  });

  it('opens the voice list after an entry pick that kept the language', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    player.openPicker('provider');
    player.pick('Q');
    expect(player.isOpen()).toBe(false);
    player.update({ ...STATE, provider: 'q', playing: false, voice: '', chooseVoice: true });
    expect(player.menu()).toBe('Voice');
  });

  it('opens the language list when the entry has not the language', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    player.openPicker('provider');
    player.pick('Q');
    player.update({ ...STATE, provider: 'q', locale: '', voices: [], playing: false, voice: '', chooseVoice: true });
    expect(player.menu()).toBe('Locale');
  });

  it('opens the voice list after a language pick', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    player.openPicker('locale');
    player.pick('French');
    player.update({ ...STATE, locale: 'fr', playing: false, voice: '', chooseVoice: true });
    expect(player.menu()).toBe('Voice');
  });

  it('opens nothing after a pick of what is shown, nor later when the voice empties for another reason', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    player.openPicker('provider');
    player.pick('P');
    player.update({ ...STATE, speed: 1.1 });
    player.update({ ...STATE, voice: '', chooseVoice: true });
    expect(player.isOpen()).toBe(false);
  });

  it('opens nothing for a voice pick', () => {
    const player = loadPlayer('top');
    player.update(STATE);
    player.openVoiceList();
    player.pick('Voice 2');
    player.update({ ...STATE, voice: 'v2' });
    expect(player.isOpen()).toBe(false);
  });
});
