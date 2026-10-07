import { describe, expect, it, vi } from 'vitest';
import { askPaneQuestion, closeTabsMessage, readingTabsMessage, refuseWhileReading, showPaneNotice } from '../../src/ui/reading-guard';

describe('readingTabsMessage', () => {
  it('names the tabs and says what to do — the player, not the tab, is what has to close', () => {
    const message = readingTabsMessage(['Deep learning', 'Another paper']);
    expect(message).toContain('This change affects the reading in 2 tabs');
    expect(message).toContain('  • Deep learning');
    expect(message).toContain('  • Another paper');
    expect(message.split('\n').pop()).toBe('Close the player in those tabs, then try again.');
  });

  it('speaks of one tab in the singular', () => {
    const message = readingTabsMessage(['Deep learning']);
    expect(message).toBe('This change affects the reading in a tab:\n  • Deep learning\n\nClose the player in that tab, then try again.');
  });
});

describe('closeTabsMessage', () => {
  // The cost is said before the press (issue #160): the player closes, the
  // tab and its place stay
  it('names the tabs, and says that closing the player there lets the change through and keeps the tabs', () => {
    const message = closeTabsMessage(['Deep learning', 'Another paper']);
    expect(message).toBe(
      'This change affects the reading in 2 tabs:\n  • Deep learning\n  • Another paper\n\nClosing the players there lets the change through. The tabs stay open and keep their place.',
    );
  });

  it('speaks of one tab in the singular', () => {
    expect(closeTabsMessage(['Deep learning'])).toBe(
      'This change affects the reading in a tab:\n  • Deep learning\n\nClosing the player there lets the change through. The tab stays open and keeps its place.',
    );
  });
});

/** Tabs as the pane hands them over: a title, and the close of that tab's player, which takes it off the affected list. */
function tabs(titles: string[], options: { stuck?: string[] } = {}) {
  const open = new Set(titles);
  const closed: string[] = [];
  const affected = () =>
    [...open].map((title) => ({
      title,
      close: vi.fn(() => {
        closed.push(title);
        if (!options.stuck?.includes(title)) open.delete(title);
      }),
    }));
  return { open, closed, affectedPlayers: vi.fn((_changes: Record<string, unknown>) => affected()) };
}

describe('refuseWhileReading', () => {
  it('is silent and lets the change through while it affects no tab', async () => {
    const warn = vi.fn();
    const askToClose = vi.fn(async () => true);
    const t = tabs([]);
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, readingTabs: () => ['Unrelated'], warn, askToClose }, { 'local.enabled': false })).toBe(false);
    expect(t.affectedPlayers).toHaveBeenCalledWith({ 'local.enabled': false });
    expect(warn).not.toHaveBeenCalled();
    expect(askToClose).not.toHaveBeenCalled();
  });

  it('asks about exactly the affected tabs, and refuses on Cancel without closing a player', async () => {
    const warn = vi.fn();
    const askToClose = vi.fn(async (_message: string) => false);
    const t = tabs(['Deep learning']);
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, warn, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(askToClose).toHaveBeenCalledWith(closeTabsMessage(['Deep learning']));
    expect(t.closed).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  // One press does both: the listed players close, and the caller's write follows
  it('closes the listed players on Close and continue and lets the change through, with nothing else said', async () => {
    const warn = vi.fn();
    const askToClose = vi.fn(async (_message: string) => true);
    const t = tabs(['Deep learning', 'Attention']);
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, warn, askToClose }, { 'azure.enabled': false })).toBe(false);
    expect(askToClose).toHaveBeenCalledWith(closeTabsMessage(['Deep learning', 'Attention']));
    expect(t.closed).toEqual(['Deep learning', 'Attention']);
    expect(warn).not.toHaveBeenCalled();
  });

  // Exactly the tabs the question listed: one that became affected while it
  // was up is not closed unasked, and the re-check keeps the change waiting
  it('does not close a tab that became affected while the question was up, and refuses naming it', async () => {
    const warn = vi.fn();
    const t = tabs(['Deep learning']);
    const askToClose = vi.fn(async (_message: string) => {
      t.open.add('Started meanwhile');
      return true;
    });
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, warn, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(t.closed).toEqual(['Deep learning']);
    expect(warn).toHaveBeenCalledWith(readingTabsMessage(['Started meanwhile']));
  });

  // The invariant over the convenience: a player that would not close
  // (a reader gone dead mid-close) keeps the change waiting
  it('still refuses, naming what is left, when a player would not close or its close throws', async () => {
    const warn = vi.fn();
    const t = tabs(['Deep learning', 'Attention'], { stuck: ['Attention'] });
    const askToClose = vi.fn(async (_message: string) => true);
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, warn, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(t.closed).toEqual(['Deep learning', 'Attention']);
    expect(warn).toHaveBeenCalledWith(readingTabsMessage(['Attention']));

    const thrower = vi.fn();
    const affectedPlayers = () => [{ title: 'Dead', close: () => { throw new Error("can't access dead object"); } }];
    expect(await refuseWhileReading({ affectedPlayers, warn: thrower, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(thrower).toHaveBeenCalledWith(readingTabsMessage(['Dead']));
  });

  // Without a way to close the players there is nothing to ask: the plain refusal
  it('only refuses, naming the tabs, when it cannot close them', async () => {
    const warn = vi.fn();
    const askToClose = vi.fn(async () => true);
    const titlesOnly = { affectedTabs: (changes: Record<string, unknown>) => (changes['azure.enabled'] === false ? ['Paper'] : []), warn, askToClose };
    expect(await refuseWhileReading(titlesOnly, { 'local.enabled': false })).toBe(false);
    expect(await refuseWhileReading(titlesOnly, { 'azure.enabled': false })).toBe(true);
    expect(warn).toHaveBeenLastCalledWith(readingTabsMessage(['Paper']));
    const t = tabs(['Paper']);
    expect(await refuseWhileReading({ affectedPlayers: t.affectedPlayers, warn }, { 'azure.enabled': false })).toBe(true);
    expect(await refuseWhileReading({ affectedPlayers: () => [{ title: 'Paper' }], warn, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(askToClose).not.toHaveBeenCalled();
    expect(t.closed).toEqual([]);
  });

  // A row built without the impact check: every open player counts, refusal only
  it('falls back to every open player, refusal only, without an impact check', async () => {
    const warn = vi.fn();
    const askToClose = vi.fn(async () => true);
    expect(await refuseWhileReading({ readingTabs: () => ['Deep learning'], warn, askToClose }, { 'azure.enabled': false })).toBe(true);
    expect(warn).toHaveBeenCalledWith(readingTabsMessage(['Deep learning']));
    expect(askToClose).not.toHaveBeenCalled();
    expect(await refuseWhileReading({ readingTabs: () => [], warn }, { 'azure.enabled': false })).toBe(false);
    expect(await refuseWhileReading({}, { 'azure.enabled': false })).toBe(false);
  });
});

/** The pane document in miniature: elements that can hold children, and a dialog that can be shown modal. */
class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  children: FakeElement[] = [];
  textContent = '';
  parent: FakeElement | null = null;
  modal = false;
  focused = false;
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  focus() {
    this.focused = true;
  }
  showModal() {
    this.modal = true;
  }
  close() {
    this.modal = false;
    this.fire('close');
  }
}
function fakeDoc(dark = false, dialogTag = 'dialog') {
  const body = new FakeElement('body');
  return {
    body,
    createElementNS: (_ns: string, tag: string) => {
      const el = new FakeElement(tag);
      // A document whose dialog cannot be shown modal (an older toolkit) lacks the method
      if (tag === 'dialog' && dialogTag !== 'dialog') (el as any).showModal = undefined;
      return el;
    },
    defaultView: { matchMedia: (q: string) => ({ matches: dark && q.includes('dark') }) },
  };
}

describe('showPaneNotice', () => {
  // Drawn like an alert window: a title strip, the warning sign beside the
  // text with its first line in bold, OK bottom right, a dimmed backdrop
  it('shows the message as a modal alert of the pane, painted for its theme, and removes it on close', () => {
    const doc = fakeDoc(true);
    const fallback = vi.fn();
    showPaneNotice(doc, 'This change affects the reading in a tab:\n  • Paper\n\nClose it.', fallback);
    const dialog = doc.body.children[0];
    expect(dialog.tag).toBe('dialog');
    expect(dialog.modal).toBe(true);
    expect(dialog.attrs.get('style')).toContain('color-scheme: dark');
    expect(dialog.attrs.get('style')).toContain('background: #202020');
    const [style, title, body, buttons] = dialog.children;
    expect(style.tag).toBe('style');
    expect(style.textContent).toContain('#ztts-notice::backdrop');
    expect(title.textContent).toBe('OpenReader');
    expect(body.children[0].textContent).toBe('⚠️');
    expect(body.children[1].children[0].textContent).toBe('This change affects the reading in a tab:');
    expect(body.children[1].children[0].attrs.get('style')).toContain('font-weight: 600');
    expect(body.children[1].children[1].textContent).toBe('  • Paper\n\nClose it.');
    expect(buttons.children).toHaveLength(1);
    const ok = buttons.children[0];
    expect(ok.textContent).toBe('OK');
    expect(ok.focused).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
    ok.fire('click');
    expect(dialog.modal).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  it('paints light colors under a light theme, and takes another title', () => {
    const doc = fakeDoc(false);
    showPaneNotice(doc, 'x', vi.fn(), 'Elsewhere');
    const dialog = doc.body.children[0];
    expect(dialog.attrs.get('style')).toContain('color-scheme: light');
    expect(dialog.attrs.get('style')).toContain('background: #f3f3f3');
    expect(dialog.children[1].textContent).toBe('Elsewhere');
    expect(dialog.children[2].children[1].children).toHaveLength(1);
  });

  it('falls back to the OS prompt where the dialog cannot be shown modal', () => {
    const doc = fakeDoc(false, 'no-modal');
    const fallback = vi.fn();
    showPaneNotice(doc, 'x', fallback);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });

  it('falls back, and leaves nothing behind, when showModal refuses', () => {
    const doc = fakeDoc(false);
    const create = doc.createElementNS;
    doc.createElementNS = (ns: string, tag: string) => {
      const el = create(ns, tag);
      if (tag === 'dialog') {
        el.showModal = () => {
          throw new Error('not connected');
        };
      }
      return el;
    };
    const fallback = vi.fn();
    showPaneNotice(doc, 'x', fallback);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });
});

describe('askPaneQuestion', () => {
  const LABELS = { confirm: 'Close and continue', cancel: 'Cancel' };

  // The same alert with two buttons; Cancel holds the focus, so Enter is
  // never the press that closes a tab's reading
  it('shows the question with Close and Cancel, Cancel focused, and resolves true on Close', async () => {
    const doc = fakeDoc(true);
    const fallback = vi.fn(() => false);
    const answer = askPaneQuestion(doc, 'This change affects the reading in a tab:\n  • Paper\n\nClose it?', LABELS, fallback);
    const dialog = doc.body.children[0];
    expect(dialog.modal).toBe(true);
    expect(dialog.attrs.get('id')).toBe('ztts-notice');
    const [, title, body, buttons] = dialog.children;
    expect(title.textContent).toBe('OpenReader');
    expect(body.children[1].children[0].textContent).toBe('This change affects the reading in a tab:');
    expect(body.children[1].children[1].textContent).toBe('  • Paper\n\nClose it?');
    expect(buttons.children.map((b) => b.textContent)).toEqual(['Close and continue', 'Cancel']);
    const [stop, cancel] = buttons.children;
    expect(cancel.focused).toBe(true);
    expect(stop.focused).toBe(false);
    stop.fire('click');
    expect(await answer).toBe(true);
    expect(dialog.modal).toBe(false);
    expect(doc.body.children).toEqual([]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('resolves false on Cancel', async () => {
    const doc = fakeDoc(false);
    const answer = askPaneQuestion(doc, 'x', LABELS, vi.fn(() => true));
    const dialog = doc.body.children[0];
    dialog.children[3].children[1].fire('click');
    expect(await answer).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  // Escape closes an html dialog without a click: that is a Cancel too
  it('resolves false when the dialog closes any other way', async () => {
    const doc = fakeDoc(false);
    const answer = askPaneQuestion(doc, 'x', LABELS, vi.fn(() => true));
    doc.body.children[0].close();
    expect(await answer).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  it('falls back to the OS prompt, and takes its answer, where the dialog cannot be shown modal', async () => {
    const doc = fakeDoc(false, 'no-modal');
    const fallback = vi.fn((_message: string) => true);
    expect(await askPaneQuestion(doc, 'x', LABELS, fallback)).toBe(true);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });

  it('falls back, and leaves nothing behind, when showModal refuses', async () => {
    const doc = fakeDoc(false);
    const create = doc.createElementNS;
    doc.createElementNS = (ns: string, tag: string) => {
      const el = create(ns, tag);
      if (tag === 'dialog') {
        el.showModal = () => {
          throw new Error('not connected');
        };
      }
      return el;
    };
    const fallback = vi.fn((_message: string) => false);
    expect(await askPaneQuestion(doc, 'x', LABELS, fallback)).toBe(false);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });
});

// Zotero's own sheet caps every button of the preferences window at 25 px
// on macOS — `@media (-moz-platform: macos) { button { max-height: 25px;
// margin: 0 -2px -1px } }` in `chrome://zotero/skin/preferences.css`, a
// type selector with no `@namespace`, so it reaches these html:buttons as
// surely as Zotero's XUL ones. A button that asks for more is not
// re-centered: Gecko lays a button's content out from the top of its
// content box and leaves it there when it overflows, so the cap takes its
// 6 px off *below* the label, and the label reads as low (issue #80,
// measured 2026-09-09: 6.67 px of air above the label against 2.33
// below). So the buttons state a box that fits — at the pane's 13 px font
// a 17.34 px line box and the UA's 2 px border a side leave 1.33 px a
// side for the padding — and they center the label in it, which is what
// holds at a larger Zotero UI font, where the cap bites again.
describe("the dialogs' buttons", () => {
  /** `resource://gre-resources/forms.css`: `border: 2px outset buttonborder`, per side. */
  const UA_BORDER = 2;
  /** The pane's own font, measured live: `13px / 17.3333px system-ui`. */
  const LINE_BOX = 17.34;
  /** Zotero's cap on every button of the preferences window, macOS only. */
  const ZOTERO_CAP = 25;

  it("ask for a box that stays inside Zotero's macOS cap, and center the label in it", () => {
    const doc = fakeDoc(true);
    void askPaneQuestion(doc, 'x', { confirm: 'Close and continue', cancel: 'Cancel' }, vi.fn(() => true));
    const buttons = doc.body.children[0].children[3].children;
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      const style = button.attrs.get('style') ?? '';
      const padding = Number(/padding:\s*([\d.]+)px/.exec(style)?.[1]);
      expect(padding).toBeGreaterThanOrEqual(0);
      expect(2 * padding + 2 * UA_BORDER + LINE_BOX).toBeLessThanOrEqual(ZOTERO_CAP);
      expect(style).toContain('box-sizing: border-box');
      expect(style).toContain('align-items: center');
    }
  });
});
