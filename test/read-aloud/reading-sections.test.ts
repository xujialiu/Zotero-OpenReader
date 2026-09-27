import { describe, expect, it } from 'vitest';
import { readingSections, sectionAt } from '../../src/read-aloud/reading-sections';
const segments = [1, 3, 4, 7, 9].map(n => ({ text: 'Sentence', position: { start: [n, 0, 0], end: [n, 0, 8] } }));
describe('reading sections', () => {
  it('ends introductions at their first child and excludes material before the first heading', () => {
    const outline = [{ title: 'Part I', ref: [3], children: [{ title: 'Chapter 1', ref: [4] }] }, { title: 'Part II', ref: [7] }];
    const sections = readingSections(outline, segments);
    expect(sectionAt(sections, 0)).toBeUndefined();
    expect(sectionAt(sections, 1)).toEqual({ title: 'Part I', start: 1, end: 2 });
    expect(sectionAt(sections, 2)).toEqual({ title: 'Chapter 1', start: 2, end: 3 });
    expect(sectionAt(sections, 3)).toEqual({ title: 'Part II', start: 3, end: 5 });
  });
  it('refuses unresolved, duplicate, reversed, or crossing boundaries instead of merging chapters silently', () => {
    for (const outline of [
      [{ title: 'A', ref: [3] }, { title: 'B' }],
      [{ title: 'A', ref: [3] }, { title: 'B', ref: [3] }],
      [{ title: 'A', ref: [7] }, { title: 'B', ref: [3] }],
      [{ title: 'A', ref: [3] }, { title: 'B', ref: [5] }],
    ]) expect(readingSections(outline, segments)).toEqual([]);
  });
});

it('uses every depth, child siblings, ancestor siblings, and the final document boundary', () => {
  const outline = [{ title: 'Chapter 1', ref: [1], children: [
    { title: '1.1', ref: [3], children: [{ title: '1.1.1', ref: [4] }, { title: '1.1.2', ref: [7] }] },
    { title: '1.2', ref: [9] },
  ] }];
  expect(readingSections(outline, segments)).toEqual([
    { title: 'Chapter 1', start: 0, end: 1 },
    { title: '1.1', start: 1, end: 2 },
    { title: '1.1.1', start: 2, end: 3 },
    { title: '1.1.2', start: 3, end: 4 },
    { title: '1.2', start: 4, end: 5 },
  ]);
});

it('uses the deepest title when a parent and child share the same start', () => {
  expect(readingSections([{ title: 'Part', ref: [3], children: [
    { title: 'Chapter', ref: [3], children: [{ title: 'Section', ref: [3] }] },
  ] }, { title: 'Next', ref: [7] }], segments)).toEqual([
    { title: 'Section', start: 1, end: 3 }, { title: 'Next', start: 3, end: 5 },
  ]);
});

it('does not skip invalid nested boundaries or rely on reader array callbacks', () => {
  for (const children of [[{ title: 'Missing' }], [{ title: 'Reversed', ref: [1] }], [{ title: 'Unmapped', ref: [5] }]]) {
    expect(readingSections([{ title: 'Parent', ref: [3], children }], segments)).toEqual([]);
  }
  const children = { 0: { title: 'Child', ref: [4] }, length: 1 };
  expect(readingSections({ 0: { title: 'Parent', ref: [3], children }, length: 1 }, segments)).toEqual([
    { title: 'Parent', start: 1, end: 2 }, { title: 'Child', start: 2, end: 5 },
  ]);
});
