import { afterEach, describe, expect, it } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { DEFAULT_FISH_MODEL, type FishModelList } from '../../src/core/providers/fish';
import { initProviderRows, providerRowIds, type CheckOutcome } from '../../src/ui/provider-rows';
import { FISH_SOURCE_IDS, FISH_SOURCE_PREFS } from '../../src/ui/fish-voice-sources';
import { FISH_MODEL_MENU_ID, FISH_MODEL_PREF } from '../../src/ui/fish-model-rows';

class Element {
  disabled = false;
  checked = false;
  value = '';
  textContent = '';
  attrs = new Map<string, string>();
  listeners = new Map<string, () => unknown>();
  fields: Element[] = [];
  entries: Array<{ label: string; value: string }> = [];
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  querySelectorAll() { return this.fields; }
  addEventListener(type: string, fn: () => unknown) { this.listeners.set(type, fn); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  fire() { return this.listeners.get('command')?.(); }
  appendItem(label: string, value: string) { this.entries.push({ label, value }); }
  removeAllItems() { this.entries.length = 0; }
}

const cleanups: Array<() => void> = [];
afterEach(() => { for (const clean of cleanups.splice(0)) clean(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** The pane's Provider settings module, with only document, pref and network stand-ins. */
function setup(manual: boolean, options: { modelList?: Promise<FishModelList>; storedModel?: string } = {}) {
  const ids = providerRowIds('fish');
  const elements = new Map<string, Element>();
  for (const id of [...Object.values(ids), ...Object.values(FISH_SOURCE_IDS), FISH_MODEL_MENU_ID]) elements.set(id, new Element());
  const fieldIds = [FISH_SOURCE_IDS.official, FISH_SOURCE_IDS.own, FISH_SOURCE_IDS.manual, FISH_SOURCE_IDS.modelIds, FISH_MODEL_MENU_ID];
  elements.get(ids.section)!.fields = fieldIds.map(id => elements.get(id)!);
  const doc = { getElementById: (id: string) => elements.get(id) ?? null };
  const store: Record<string, unknown> = {
    [PREF_PREFIX + 'fish.enabled']: false,
    [PREF_PREFIX + 'fish.includeManual']: manual,
    [PREF_PREFIX + 'fish.voices']: 'saved-reference',
    [FISH_MODEL_PREF]: options.storedModel ?? DEFAULT_FISH_MODEL,
  };
  const observers = new Map<string, Set<() => void>>();
  const prefs: PrefsBackend = {
    get: key => store[key],
    set: (key, value) => {
      if (store[key] === value) return;
      store[key] = value;
      for (const changed of observers.get(key) ?? []) changed();
    },
  };
  const watch = (name: string, changed: () => void) => {
    const key = 'extensions.zotero.' + name;
    const listeners = observers.get(key) ?? new Set<() => void>();
    listeners.add(changed);
    observers.set(key, listeners);
    return () => {
      listeners.delete(changed);
      if (!listeners.size) observers.delete(key);
    };
  };
  const check = deferred<CheckOutcome>();
  let checks = 0;
  const modelList: Promise<FishModelList> = options.modelList ?? Promise.resolve({ ok: false, reason: 'Not needed' });
  const rows = initProviderRows(doc, {
    prefs, check: () => { checks++; return check.promise; }, readingTabs: () => [], warn: () => {}, watch,
    onVoicesChanged: () => {},
    loadFishModels: () => modelList,
  });
  cleanups.push(() => rows.dispose());
  return { ids, prefs, rows, observers, finish: check.resolve, checks: () => checks, el: (id: string) => elements.get(id)!, fields: () => fieldIds.map(id => elements.get(id)!.disabled) };
}

describe('Fish controls share the provider check lock (#214, #216)', () => {
  it.each(['official', 'own', 'manual'] as const)('edits the %s source only while Fish Audio is off, retaining saved IDs', async source => {
    const f = setup(true);
    const box = f.el(FISH_SOURCE_IDS[source]);
    expect(box.checked).toBe(true);
    box.checked = false;
    await box.fire();
    expect(f.prefs.get(PREF_PREFIX + FISH_SOURCE_PREFS[source])).toBe(false);
    expect(f.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(source === 'manual');
    f.prefs.set(PREF_PREFIX + 'fish.enabled', true);
    expect(f.fields()).toEqual([true, true, true, true, true]);
    box.checked = true;
    await box.fire();
    expect(f.prefs.get(PREF_PREFIX + FISH_SOURCE_PREFS[source])).toBe(false);
    expect(box.checked).toBe(false);
    expect(f.prefs.get(PREF_PREFIX + 'fish.voices')).toBe('saved-reference');
    expect(f.checks()).toBe(0);
  });

  it.each(['toggle', 'test'] as const)('keeps every field locked during %s even after a source observer repaint', async action => {
    const f = setup(true);
    const checking = f.el(f.ids[action]).fire();
    expect(f.fields()).toEqual([true, true, true, true, true]);
    f.prefs.set(PREF_PREFIX + 'fish.includeManual', false);
    expect(f.fields()).toEqual([true, true, true, true, true]);
    f.finish({ ok: true, message: 'Connected.' });
    await checking;
    // The changed source invalidates the check, and its own restriction survives the unlock.
    expect(f.prefs.get(PREF_PREFIX + 'fish.enabled')).toBe(false);
    expect(f.fields()).toEqual([false, false, false, true, false]);
    expect(f.prefs.get(PREF_PREFIX + 'fish.voices')).toBe('saved-reference');
  });

  it('rejects synthetic source and model commands while checking, then permits edits after failure', async () => {
    const f = setup(false);
    const checking = f.el(f.ids.toggle).fire();
    const manual = f.el(FISH_SOURCE_IDS.manual);
    const model = f.el(FISH_MODEL_MENU_ID);
    manual.checked = true;
    await manual.fire();
    model.value = 's2-pro';
    await model.fire();
    expect(f.prefs.get(PREF_PREFIX + 'fish.includeManual')).toBe(false);
    expect(f.prefs.get(FISH_MODEL_PREF)).toBe(DEFAULT_FISH_MODEL);
    f.finish({ ok: false, message: 'Connection failed.' });
    await checking;
    manual.checked = true;
    await manual.fire();
    model.value = 's2-pro';
    await model.fire();
    expect(f.prefs.get(PREF_PREFIX + 'fish.includeManual')).toBe(true);
    expect(f.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(false);
    expect(f.prefs.get(FISH_MODEL_PREF)).toBe('s2-pro');
  });

  it.each(['refresh', 'test', 'failed enable', 'restore verification'] as const)('retains Manual voices restrictions after %s without caller repainting', async action => {
    const f = setup(false);
    expect(f.fields()).toEqual([false, false, false, true, false]);
    if (action === 'refresh') f.rows.refresh();
    else {
      if (action === 'restore verification') f.prefs.set(PREF_PREFIX + 'fish.enabled', true);
      const checking = action === 'restore verification' ? f.rows.verifyEnabled() : f.el(f.ids[action === 'test' ? 'test' : 'toggle']).fire();
      expect(f.fields()).toEqual([true, true, true, true, true]);
      f.finish({ ok: false, message: 'Connection failed.' });
      await checking;
    }
    expect(f.fields()).toEqual([false, false, false, true, false]);
    expect(f.prefs.get(PREF_PREFIX + 'fish.voices')).toBe('saved-reference');
  });

  it('refreshes Model and source choices from external prefs without another connection check', () => {
    const f = setup(false);
    f.prefs.set(FISH_MODEL_PREF, 'drama-3');
    f.prefs.set(PREF_PREFIX + 'fish.includeManual', true);
    expect(f.el(FISH_MODEL_MENU_ID).value).toBe('drama-3');
    expect(f.el(FISH_SOURCE_IDS.manual).checked).toBe(true);
    expect(f.fields()).toEqual([false, false, false, false, false]);
    f.prefs.set(PREF_PREFIX + 'fish.enabled', true);
    expect(f.fields()).toEqual([true, true, true, true, true]);
    f.prefs.set(PREF_PREFIX + 'fish.enabled', false);
    f.prefs.set(PREF_PREFIX + 'fish.includeManual', false);
    f.rows.refresh();
    expect(f.fields()).toEqual([false, false, false, true, false]);
    expect(f.el(FISH_MODEL_MENU_ID).value).toBe('drama-3');
    expect(f.el(FISH_SOURCE_IDS.manual).checked).toBe(false);
    expect(f.checks()).toBe(0);
  });

  it.each([DEFAULT_FISH_MODEL, 'drama-3', 'unlisted-model'])('adds a late Model list during a check without unlocking or replacing %s', async storedModel => {
    const list = deferred<FishModelList>();
    const f = setup(false, { modelList: list.promise, storedModel });
    const model = f.el(FISH_MODEL_MENU_ID);
    const unlisted = storedModel === 'unlisted-model' ? ['unlisted-model'] : [];
    expect(model.entries.map(entry => entry.value)).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro', ...unlisted]);
    expect(model.value).toBe(storedModel);
    const checking = f.el(f.ids.toggle).fire();
    list.resolve({ ok: true, models: new Map([['s1', { free: false }]]) });
    await list.promise;
    expect(model.entries.map(entry => entry.value)).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro', 's1', ...unlisted]);
    expect(model.value).toBe(storedModel);
    expect(f.fields()).toEqual([true, true, true, true, true]);
    f.rows.refresh();
    expect(f.fields()).toEqual([true, true, true, true, true]);
    f.finish({ ok: false, message: 'Connection failed.' });
    await checking;
    expect(f.fields()).toEqual([false, false, false, true, false]);
    expect(f.checks()).toBe(1);
  });

  it('disposes the whole group, ignoring late check/list results and later edits', async () => {
    const list = deferred<FishModelList>();
    const f = setup(false, { modelList: list.promise });
    const checking = f.el(f.ids.toggle).fire();
    const model = f.el(FISH_MODEL_MENU_ID);
    const entries = [...model.entries];
    expect(f.observers.size).toBeGreaterThan(0);
    f.rows.dispose();
    expect(f.observers.size).toBe(0);
    f.prefs.set(FISH_MODEL_PREF, 'drama-3');
    f.prefs.set(PREF_PREFIX + 'fish.includeOfficial', false);
    f.el(FISH_SOURCE_IDS.manual).checked = true;
    await f.el(FISH_SOURCE_IDS.manual).fire();
    model.value = 's2-pro';
    await model.fire();
    list.resolve({ ok: true, models: new Map([['s1', { free: false }]]) });
    await list.promise;
    f.finish({ ok: true, message: 'Connected.' });
    await checking;
    f.rows.refresh();
    expect(model.entries).toEqual(entries);
    expect(f.el(FISH_SOURCE_IDS.official).checked).toBe(true);
    expect(f.prefs.get(FISH_MODEL_PREF)).toBe('drama-3');
    expect(f.prefs.get(PREF_PREFIX + 'fish.includeManual')).toBe(false);
    expect(f.prefs.get(PREF_PREFIX + 'fish.enabled')).toBe(false);
    expect(f.el(f.ids.result).textContent).not.toBe('Connected.');
  });
});
