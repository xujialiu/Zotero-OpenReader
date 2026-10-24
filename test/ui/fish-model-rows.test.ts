import { describe, expect, it } from 'vitest';
import type { FishModelList } from '../../src/core/providers/fish';
import { fishModelOptions } from '../../src/ui/fish-model-rows';

/** The message id with its arguments, so a label says what it was built from. */
const t = (id: string, args?: Record<string, string>) => (args ? `${id}(${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(',')})` : id);
const read = (entries: Record<string, boolean>): FishModelList => ({ ok: true, models: new Map(Object.entries(entries).map(([id, free]) => [id, { free }])) });
const TODAY = read({ 's2.1-pro': false, 's2.1-pro-free': true, 's2-pro': false, s1: false });

describe('the Model dropdown\'s entries (issue #182)', () => {
  it('lists the known models, then those only Fish\'s list carries, each as free or paid, never with a price', () => {
    expect(fishModelOptions('s2.1-pro-free', TODAY, t)).toEqual([
      { id: 's2.1-pro-free', label: 'ztts-fish-model-free(model=s2.1-pro-free)' },
      { id: 's2.1-pro', label: 'ztts-fish-model-paid(model=s2.1-pro)' },
      { id: 'drama-3', label: 'ztts-fish-model-paid(model=drama-3)' },
      { id: 's2-pro', label: 'ztts-fish-model-paid(model=s2-pro)' },
      { id: 's1', label: 'ztts-fish-model-paid(model=s1)' },
    ]);
  });

  it('lists the known models alone while the list is on its way or unread, and keeps a chosen model neither offers by its id', () => {
    expect(fishModelOptions('s9', null, t).map((o) => o.id)).toEqual(['s2.1-pro-free', 's2.1-pro', 'drama-3', 's2-pro', 's9']);
    expect(fishModelOptions('s9', { ok: false, reason: 'HTTP 503' }, t).at(-1)).toEqual({ id: 's9', label: 's9' });
  });
});
