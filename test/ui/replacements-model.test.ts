import { describe, expect, it } from 'vitest';
import type { Replacement } from '../../src/core/replacements';
import { createReplacementsModel } from '../../src/ui/replacements-model';

const row = (text: string, readAs = text.toLowerCase(), extra: Partial<Replacement> = {}): Replacement => ({ text, readAs, mode: 'exact', matchCase: true, ...extra });
const texts = (model: ReturnType<typeof createReplacementsModel>) => model.rows().map((r) => `${r.scope[0]}:${r.row.text}`);

describe('the replacements table (issue #237)', () => {
  it('lists the document\'s rows above the global ones', () => {
    const model = createReplacementsModel({ document: [row('A'), row('B')], global: [row('C')] });
    expect(texts(model)).toEqual(['d:A', 'd:B', 'g:C']);
    expect(model.mode).toBe('document');
  });

  it('shows the global rows alone when opened from the settings', () => {
    const model = createReplacementsModel({ document: null, global: [row('C')] });
    expect(texts(model)).toEqual(['g:C']);
    expect(model.mode).toBe('global');
    expect(() => model.add(row('D'), 'document')).toThrow();
  });

  it('adds a row at the end of its list', () => {
    const model = createReplacementsModel({ document: [row('A')], global: [row('C')] });
    expect(model.add(row('B'), 'document')).toBe(1);
    expect(model.add(row('D'), 'global')).toBe(3);
    expect(texts(model)).toEqual(['d:A', 'd:B', 'g:C', 'g:D']);
  });

  it('edits a row in place, or moves it to the end of the other list when its scope changes', () => {
    const model = createReplacementsModel({ document: [row('A'), row('B')], global: [row('C')] });
    expect(model.update(0, row('A2'), 'document')).toBe(0);
    expect(model.update(0, row('A3'), 'global')).toBe(2);
    expect(texts(model)).toEqual(['d:B', 'g:C', 'g:A3']);
  });

  it('removes rows', () => {
    const model = createReplacementsModel({ document: [row('A'), row('B')], global: [row('C')] });
    model.remove([0, 2]);
    expect(texts(model)).toEqual(['d:B']);
  });

  it('drags a row only within its own list, clamping at the list\'s edge', () => {
    const model = createReplacementsModel({ document: [row('A'), row('B')], global: [row('C'), row('D'), row('E')] });
    expect(model.move(4, 2)).toBe(2);
    expect(texts(model)).toEqual(['d:A', 'd:B', 'g:E', 'g:C', 'g:D']);
    // Dropped among the document's rows: the top of its own list
    expect(model.move(3, 0)).toBe(2);
    expect(texts(model)).toEqual(['d:A', 'd:B', 'g:C', 'g:E', 'g:D']);
    expect(model.move(0, 4)).toBe(1);
    expect(texts(model)).toEqual(['d:B', 'd:A', 'g:C', 'g:E', 'g:D']);
  });

  it('greys a global row that a document row with the same text, mode and case takes the place of', () => {
    const model = createReplacementsModel({ document: [row('IL', 'I L')], global: [row('IL', 'interleukin'), row('IL', 'x', { matchCase: false }), row('IL-6')] });
    expect(model.rows().map((_, i) => model.overridden(i))).toEqual([false, true, false, false]);
  });

  it('finds the same row already in a list, for the row dialog to refuse', () => {
    const model = createReplacementsModel({ document: [row('IL')], global: [row('IL')] });
    expect(model.duplicate(row('IL', 'other'), 'document')).toBe(0);
    expect(model.duplicate(row('IL', 'other'), 'document', 0)).toBeNull();
    expect(model.duplicate(row('IL'), 'global')).toBe(1);
    expect(model.duplicate(row('il'), 'global')).toBeNull();
  });

  it('hands back both lists, and says which changed', () => {
    const model = createReplacementsModel({ document: [row('A')], global: [row('C')] });
    expect(model.changed()).toEqual({ document: false, global: false });
    model.move(0, 0);
    expect(model.changed()).toEqual({ document: false, global: false });
    model.add(row('D'), 'global');
    expect(model.result()).toEqual({ document: [row('A')], global: [row('C'), row('D')] });
    expect(model.changed()).toEqual({ document: false, global: true });
  });
});
