import { describe, expect, it, vi } from 'vitest';
import type { FishModelList } from '../../src/core/providers/fish';
import type { PrefsBackend } from '../../src/core/settings';
import { FISH_MODEL_MENU_ID, FISH_MODEL_OBSERVER, FISH_MODEL_PREF, fishModelOptions, initFishModelRows } from '../../src/ui/fish-model-rows';

/** The message id with its arguments, so a label says what it was built from. */
const t = (id: string, args?: Record<string, string>) => (args ? `${id}(${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(',')})` : id);
const BEFORE = Date.parse('2026-10-16T12:00:00Z');
const AFTER = Date.parse('2026-12-01T00:00:00Z');
const read = (entries: Record<string, boolean>): FishModelList => ({ ok: true, models: new Map(Object.entries(entries).map(([id, free]) => [id, { free }])) });
const TODAY = read({ 's2.1-pro': false, 's2.1-pro-free': true, 's2-pro': false, s1: false });

describe('the Model dropdown\'s entries (issue #182)', () => {
  it('lists the known models with their prices, then those only Fish\'s list carries, as free or paid without a number', () => {
    expect(fishModelOptions('s2.1-pro-free', TODAY, BEFORE, t)).toEqual([
      { id: 's2.1-pro-free', label: 'ztts-fish-model-free(model=s2.1-pro-free)' },
      { id: 's2.1-pro', label: 'ztts-fish-model-bytes(model=s2.1-pro,price=15)' },
      { id: 'drama-3', label: 'ztts-fish-model-chars(model=drama-3,price=50)' },
      { id: 's2-pro', label: 'ztts-fish-model-bytes(model=s2-pro,price=15)' },
      { id: 's1', label: 'ztts-fish-model-paid(model=s1)' },
    ]);
  });

  it('marks nothing while the list is on its way, and keeps a chosen model neither list offers', () => {
    const options = fishModelOptions('s9', null, AFTER, t);
    expect(options.map((o) => o.id)).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro', 's9']);
    expect(options[0].label).toBe('ztts-fish-model-free(model=s2.1-pro-free)');
    expect(fishModelOptions('s9', TODAY, BEFORE, t).at(-1)).toEqual({ id: 's9', label: 'ztts-fish-model-gone(label=s9)' });
  });

  it('marks the free model the reading would refuse (issue #181)', () => {
    expect(fishModelOptions('s2.1-pro-free', read({ 's2.1-pro-free': false }), BEFORE, t)[0].label).toBe('ztts-fish-model-not-free(label=ztts-fish-model-free(model=s2.1-pro-free))');
    expect(fishModelOptions('s2.1-pro-free', { ok: false, reason: 'HTTP 503' }, AFTER, t)[0].label).toContain('ztts-fish-model-not-free');
    expect(fishModelOptions('s2.1-pro-free', { ok: false, reason: 'HTTP 503' }, BEFORE, t)[0].label).toBe('ztts-fish-model-free(model=s2.1-pro-free)');
  });
});

/** A XUL menulist as the dropdown drives it: its entries, built by appendItem, and its value. */
type Entry = { label: string; value: string };
function setup(options: { enabled?: boolean; stored?: string; list?: FishModelList } = {}) {
  const entries: Entry[] = [];
  const listeners = new Map<string, () => void>();
  const menu = {
    value: '',
    appendItem: (label: string, value: string) => entries.push({ label, value }),
    removeAllItems: () => entries.splice(0),
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const store: Record<string, unknown> = options.stored ? { [FISH_MODEL_PREF]: options.stored } : {};
  const prefs: PrefsBackend = { get: (k) => store[k], set: (k, v) => { store[k] = v; } };
  const watchers = new Map<string, () => void>();
  const loadList = vi.fn(async () => options.list ?? TODAY);
  const rows = initFishModelRows({ getElementById: (id) => (id === FISH_MODEL_MENU_ID ? menu : null) }, {
    prefs,
    t,
    loadList,
    fishEnabled: () => options.enabled ?? false,
    now: () => BEFORE,
    watch: (name, fn) => {
      watchers.set(name, fn);
      return () => watchers.delete(name);
    },
  });
  const ids = () => entries.map((entry) => entry.value);
  const pick = (id: string) => {
    menu.value = id;
    listeners.get('command')?.();
  };
  return { rows, menu, store, watchers, loadList, ids, pick, listeners };
}

describe('the Model dropdown', () => {
  it('shows the known models at once, selects the stored one, and adds Fish\'s own when its list arrives', async () => {
    const r = setup({ stored: 'drama-3' });
    expect(r.ids()).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro']);
    expect(r.menu.value).toBe('drama-3');
    await r.rows.load();
    expect(r.ids()).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro', 's1']);
    expect(r.menu.value).toBe('drama-3');
  });

  it('selects the free model when nothing is stored', () => {
    expect(setup().menu.value).toBe('s2.1-pro-free');
  });

  it('writes a pick while Fish Audio is off', () => {
    const r = setup();
    r.pick('s2-pro');
    expect(r.store[FISH_MODEL_PREF]).toBe('s2-pro');
  });

  it('takes no pick while Fish Audio is on, and puts the stored model back', () => {
    const r = setup({ enabled: true, stored: 's2.1-pro' });
    r.pick('drama-3');
    expect(r.store[FISH_MODEL_PREF]).toBe('s2.1-pro');
    expect(r.menu.value).toBe('s2.1-pro');
  });

  it('follows the pref when it changes elsewhere, and lets go of it when the pane closes', () => {
    const r = setup();
    r.store[FISH_MODEL_PREF] = 's2.1-pro';
    r.watchers.get(FISH_MODEL_OBSERVER)?.();
    expect(r.menu.value).toBe('s2.1-pro');
    r.rows.dispose();
    expect(r.watchers.size).toBe(0);
    expect(r.listeners.size).toBe(0);
  });
});
