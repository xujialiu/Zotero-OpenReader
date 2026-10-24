import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, PREF_PREFIX, SWITCH_IDS, type PrefsBackend, type ZoteroTier } from '../../src/core/settings';
import { flattenSettings } from '../../src/core/settings-backup';
import { createZoteroRefusals } from '../../src/read-aloud/zotero-refusals';
import { onPaneLoad } from '../../src/ui/prefs-pane';
import { providerRowIds } from '../../src/ui/provider-rows';
import { FISH_SOURCE_IDS } from '../../src/ui/fish-voice-sources';
import { FISH_MODEL_MENU_ID, FISH_MODEL_PREF } from '../../src/ui/fish-model-rows';

class Element {
  disabled = false;
  checked = false;
  hidden = false;
  value = '';
  textContent = '';
  attrs = new Map<string, string>();
  listeners = new Map<string, Set<() => unknown>>();
  fields: Element[] = [];
  entries: Array<{ label: string; value: string }> = [];
  appendItem(label: string, value: string) { this.entries.push({ label, value }); }
  removeAllItems() { this.entries.length = 0; }
  setAttribute(name: string, value: string) { this.attrs.set(name, String(value)); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  removeAttribute(name: string) { this.attrs.delete(name); }
  querySelectorAll() { return this.fields; }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => unknown) { this.listeners.get(type)?.delete(fn); }
  fire(type = 'command') { return Promise.all([...this.listeners.get(type) ?? []].map(fn => fn())); }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
  // Finish the pane's non-blocking catalog loads before removing its globals.
  await new Promise<void>(resolve => setImmediate(resolve));
  vi.unstubAllGlobals();
});

/** Real pane wiring, with synchronous Zotero pref notifications and no external network. */
function pane(initial: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(flattenSettings(DEFAULTS)).map(([key, value]) => [PREF_PREFIX + key, value as unknown]));
  for (const id of SWITCH_IDS) store.set(`${PREF_PREFIX}${id}.enabled`, false);
  for (const [key, value] of Object.entries(initial)) store.set(PREF_PREFIX + key, value);
  const observers = new Map<number, { key: string; changed: () => void }>();
  let token = 0;
  const prefs: PrefsBackend = {
    get: key => store.get(key),
    set: (key, value) => {
      if (store.get(key) === value) return;
      store.set(key, value);
      for (const observer of [...observers.values()]) if (observer.key === key) observer.changed();
    },
  };
  const accountObservers = new Map<number, { notify(): void }>();
  const errors: unknown[] = [];
  vi.stubGlobal('Zotero', {
    isMac: false, isWin: false, locale: 'en-US',
    Prefs: {
      ...prefs,
      prefHasUserValue: (key: string) => store.has(key),
      registerObserver: (key: string, changed: () => void) => {
        observers.set(++token, { key: 'extensions.zotero.' + key, changed });
        return token;
      },
      unregisterObserver: (id: number) => observers.delete(id),
    },
    Notifier: {
      registerObserver: (observer: { notify(): void }) => { accountObservers.set(++token, observer); return token; },
      unregisterObserver: (id: number) => accountObservers.delete(id),
    },
    Sync: { Runner: { enabled: false } }, Reader: { _readers: [] },
    debug: () => {}, logError: (error: unknown) => errors.push(error),
  });
  const started = deferred();
  const finish = deferred();
  let holdSynthesis = false;
  const reached: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    reached.push(url);
    if (url.endsWith('/v1/audio/speech')) {
      started.resolve();
      if (holdSynthesis) await finish.promise;
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), { headers: { 'content-type': 'audio/mpeg' } });
    }
    if (url.endsWith('/v1/models')) return Response.json({ data: [{ id: 'tts-1' }] });
    return Response.json({ models: [], data: [], voices: [] });
  });
  vi.stubGlobal('fetch', fetch);
  const elements = new Map<string, Element>();
  for (const id of ['compatible', 'fish', 'zotero-standard', 'zotero-premium'] as const) {
    for (const key of Object.values(providerRowIds(id))) elements.set(key, new Element());
  }
  const baseURL = new Element();
  elements.get(providerRowIds('compatible').section)!.fields = [baseURL];
  for (const id of [...Object.values(FISH_SOURCE_IDS), FISH_MODEL_MENU_ID]) elements.set(id, new Element());
  elements.get(providerRowIds('fish').section)!.fields = [FISH_SOURCE_IDS.official, FISH_SOURCE_IDS.own, FISH_SOURCE_IDS.manual, FISH_SOURCE_IDS.modelIds, FISH_MODEL_MENU_ID].map(id => elements.get(id)!);
  const win = new Element();
  const doc = {
    defaultView: win,
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {},
  } as unknown as Document;
  onPaneLoad(doc);
  cleanups.push(() => win.fire('unload'));
  const row = (id: 'compatible' | 'fish' | 'zotero-standard' | 'zotero-premium') => {
    const ids = providerRowIds(id);
    return { toggle: elements.get(ids.toggle)!, test: elements.get(ids.test)!, result: elements.get(ids.result)! };
  };
  return {
    prefs, store, observers, errors, win, row, baseURL, elements, reached,
    hold: () => { holdSynthesis = true; }, started: started.promise, finish: finish.resolve,
    accountChanged: () => { for (const observer of accountObservers.values()) observer.notify(); },
    typeURL: (value: string) => { if (!baseURL.disabled) prefs.set(PREF_PREFIX + 'compatible.baseURL', value); },
  };
}

const URL_PREF = PREF_PREFIX + 'compatible.baseURL';
const ENABLED_PREF = PREF_PREFIX + 'compatible.enabled';
const compatible = { 'compatible.baseURL': 'https://good.example', 'compatible.voices': 'alloy' };

describe('checked settings in the real pane (#214)', () => {
  it('holds the input during a real synthesis check and enables only the checked address', async () => {
    const p = pane(compatible);
    p.hold();
    const checking = p.row('compatible').toggle.fire();
    await p.started;
    p.typeURL('https://typo.example');
    p.finish();
    await checking;
    expect(p.store.get(ENABLED_PREF)).toBe(true);
    expect(p.store.get(URL_PREF)).toBe('https://good.example');
    expect(p.reached).toContain('https://good.example/v1/audio/speech');
    expect(p.reached.some(url => url.startsWith('https://typo.example'))).toBe(false);
  });

  it.each(['toggle', 'test'] as const)('discards an old %s result when settings change outside the input', async action => {
    const p = pane(compatible);
    p.hold();
    const checking = p.row('compatible')[action].fire();
    await p.started;
    p.prefs.set(URL_PREF, 'https://typo.example');
    p.finish();
    await checking;
    expect(p.store.get(ENABLED_PREF)).toBe(false);
    expect(p.row('compatible').result.textContent).toMatch(/settings changed.*check again/i);
    expect(p.baseURL.disabled).toBe(false);
  });

  it('does not enable from an answer that arrives after the pane closes', async () => {
    const p = pane(compatible);
    p.hold();
    const checking = p.row('compatible').toggle.fire();
    await p.started;
    await p.win.fire('unload');
    p.finish();
    await checking;
    expect(p.store.get(ENABLED_PREF)).toBe(false);
  });
});

describe('external tier changes in the real pane (#215)', () => {
  it.each([
    ['standard', 'quota-exceeded'], ['premium', 'quota-exceeded'],
    ['standard', 'daily-limit-exceeded'], ['premium', 'daily-limit-exceeded'],
  ] as const)('shows Enable after a %s %s refusal switches the tier off', async (tier, code) => {
    const key = `zotero-${tier}.enabled`;
    const p = pane({ [key]: true });
    expect(p.row(`zotero-${tier}`).toggle.getAttribute('label')).toBe('Disable');
    const refusals = createZoteroRefusals<unknown>({
      readers: () => [], usesTier: () => false, close: () => {},
      isOn: (t: ZoteroTier) => p.prefs.get(`${PREF_PREFIX}zotero-${t}.enabled`) === true,
      switchOff: (t: ZoteroTier) => p.prefs.set(`${PREF_PREFIX}zotero-${t}.enabled`, false),
      credits: async () => 0, remind: () => {}, label: () => 'Zotero voices', log: error => { throw error; },
    });
    await refusals.refused({}, { code, tier, minutes: 0 });
    expect(p.prefs.get(PREF_PREFIX + key)).toBe(false);
    expect(p.row(`zotero-${tier}`).toggle.getAttribute('label')).toBe('Enable');
  });

  it('removes the provider observers when the pane unloads', async () => {
    const p = pane();
    expect([...p.observers.values()].some(o => o.key === PREF_PREFIX + 'zotero-premium.enabled')).toBe(true);
    await p.win.fire('unload');
    expect(p.observers.size).toBe(0);
  });
});

describe('Fish source restrictions across pane refreshes (#216)', () => {
  it('owns Model and source choices through the same Provider settings group (#230)', async () => {
    const p = pane({ 'fish.includeManual': false });
    const model = p.elements.get(FISH_MODEL_MENU_ID)!;
    const manual = p.elements.get(FISH_SOURCE_IDS.manual)!;
    const ids = p.elements.get(FISH_SOURCE_IDS.modelIds)!;
    expect(model.entries.map(entry => entry.value)).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro']);
    expect(ids.disabled).toBe(true);
    model.value = 's2-pro';
    await model.fire();
    expect(p.prefs.get(FISH_MODEL_PREF)).toBe('s2-pro');
    manual.checked = true;
    await manual.fire();
    expect(p.prefs.get(PREF_PREFIX + 'fish.includeManual')).toBe(true);
    expect(ids.disabled).toBe(false);
    p.prefs.set(PREF_PREFIX + 'fish.enabled', true);
    expect([model.disabled, manual.disabled, ids.disabled]).toEqual([true, true, true]);
    model.value = 'drama-3';
    await model.fire();
    expect(p.prefs.get(FISH_MODEL_PREF)).toBe('s2-pro');
    expect(model.value).toBe('s2-pro');
    p.prefs.set(PREF_PREFIX + 'fish.enabled', false);
    p.prefs.set(PREF_PREFIX + 'fish.includeManual', false);
    p.accountChanged();
    expect([model.disabled, manual.disabled, ids.disabled]).toEqual([false, false, true]);
    await p.win.fire('unload');
    p.prefs.set(FISH_MODEL_PREF, 'drama-3');
    expect(model.value).toBe('s2-pro');
    expect(p.observers.size).toBe(0);
  });

  it.each(['test', 'failed enable', 'account change'] as const)('retains the Manual voices restriction after %s', async action => {
    const p = pane({ 'fish.includeManual': false, 'fish.voices': 'saved-reference' });
    const ids = p.elements.get(FISH_SOURCE_IDS.modelIds)!;
    expect(ids.disabled).toBe(true);
    if (action === 'account change') p.accountChanged();
    else await p.row('fish')[action === 'test' ? 'test' : 'toggle'].fire();
    expect(ids.disabled).toBe(true);
    expect(p.prefs.get(PREF_PREFIX + 'fish.voices')).toBe('saved-reference');
  });
});
