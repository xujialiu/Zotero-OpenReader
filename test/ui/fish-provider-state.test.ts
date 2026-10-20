import { describe, expect, it } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { DEFAULT_FISH_MODEL } from '../../src/core/providers/fish';
import { initProviderRows, providerRowIds, type CheckOutcome, type ProviderRows } from '../../src/ui/provider-rows';
import { FISH_SOURCE_IDS, initFishVoiceSources } from '../../src/ui/fish-voice-sources';
import { FISH_MODEL_MENU_ID, FISH_MODEL_PREF, initFishModelRows } from '../../src/ui/fish-model-rows';

class Element {
  disabled = false;
  checked = false;
  value = '';
  textContent = '';
  attrs = new Map<string, string>();
  listeners = new Map<string, () => unknown>();
  fields: Element[] = [];
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  querySelectorAll() { return this.fields; }
  addEventListener(type: string, fn: () => unknown) { this.listeners.set(type, fn); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  fire() { return this.listeners.get('command')?.(); }
  appendItem() {}
  removeAllItems() {}
}

function setup(manual: boolean) {
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
    [FISH_MODEL_PREF]: DEFAULT_FISH_MODEL,
  };
  const observers = new Map<string, () => void>();
  const prefs: PrefsBackend = {
    get: key => store[key],
    set: (key, value) => { store[key] = value; observers.get(key)?.(); },
  };
  const watch = (name: string, changed: () => void) => {
    const key = 'extensions.zotero.' + name;
    observers.set(key, changed);
    return () => { observers.delete(key); };
  };
  let rows: ProviderRows | undefined;
  const locked = () => rows?.locked('fish') ?? false;
  const sources = initFishVoiceSources(doc, { prefs, locked, watch });
  const models = initFishModelRows(doc, { prefs, locked, watch, t: id => id, loadList: async () => ({ ok: false, reason: 'Not needed' }) });
  let finish!: (result: CheckOutcome) => void;
  const check = new Promise<CheckOutcome>(resolve => { finish = resolve; });
  rows = initProviderRows(doc, {
    prefs, check: () => check, readingTabs: () => [], warn: () => {},
    onVoicesChanged: () => sources.refresh(),
    onUnlocked: id => { if (id === 'fish') sources.refresh(); },
  });
  sources.refresh();
  return { ids, prefs, rows, sources, models, finish, el: (id: string) => elements.get(id)!, fields: () => fieldIds.map(id => elements.get(id)!.disabled) };
}

describe('Fish controls share the provider check lock (#214, #216)', () => {
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
    f.rows.dispose(); f.sources.dispose(); f.models.dispose();
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
    f.rows.dispose(); f.sources.dispose(); f.models.dispose();
  });
});
