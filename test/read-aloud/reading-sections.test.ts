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

// Issue #156: the shape of The Well-Spoken Thesaurus's PDF outline, where Zotero
// anchored 44 of 55 bookmarks and left the rest as bare page destinations.
it('drops only the sections next to an entry Zotero could not anchor', () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ text: 'Sentence', position: { start: [i + 1, 0, 0], end: [i + 1, 0, 8] } }));
  const page = (pageIndex: number) => ({ position: { pageIndex, rect: [28, 648, 28, 648] } });
  const outline = [
    { title: 'Title Page', source: 'native', target: page(1) },
    { title: 'Contents', source: 'native', target: page(4) },
    { title: 'Acknowledgments', ref: [2] },
    { title: 'Rhetorical Form', ref: [3], children: [
      { title: 'Lesson 1', ref: [4] },
      { title: 'Lesson 2', source: 'native', target: page(16) },
      { title: 'Lesson 3', ref: [6] },
      { title: 'Lesson 4', ref: [7] },
    ] },
    { title: 'Vocabulary', ref: [8] },
    { title: 'Thesaurus', ref: [9], children: [
      { title: 'Ii', ref: [10] },
      { title: 'Jj', source: 'native', target: page(300) },
      { title: 'Kk', ref: [11] },
    ] },
    { title: 'About the Author', ref: [12] },
    { title: 'Back Cover', source: 'native', target: page(400) },
  ];
  const sections = readingSections(outline, blocks);
  expect(sections).toEqual([
    { title: 'Acknowledgments', start: 1, end: 2 },
    { title: 'Rhetorical Form', start: 2, end: 3 },
    { title: 'Lesson 3', start: 5, end: 6 },
    { title: 'Lesson 4', start: 6, end: 7 },
    { title: 'Vocabulary', start: 7, end: 8 },
    { title: 'Thesaurus', start: 8, end: 9 },
    { title: 'Kk', start: 10, end: 11 },
  ]);
  // Lesson 1 and 2, Ii and Jj, and the last section before Back Cover have no located end.
  for (const position of [0, 3, 4, 9, 11]) expect(sectionAt(sections, position)).toBeUndefined();
});

it('drops only the neighbors of a boundary inside a segment or a heading without text', () => {
  const crossing = [
    { text: 'A', position: { start: [1, 0, 0], end: [1, 0, 8] } },
    { text: 'runs on', position: { start: [2, 0, 0], end: [3, 0, 2] } },
    { text: 'B', position: { start: [3, 0, 2], end: [3, 0, 9] } },
    { text: 'C', position: { start: [4, 0, 0], end: [4, 0, 8] } },
    { text: 'E', position: { start: [6, 0, 0], end: [6, 0, 8] } },
  ];
  const outline = [
    { title: 'A', ref: [1] }, { title: 'Inside a segment', ref: [3] },
    { title: 'C', ref: [4] }, { title: 'No text', ref: [5] }, { title: 'E', ref: [6] },
  ];
  expect(readingSections(outline, crossing)).toEqual([{ title: 'E', start: 4, end: 5 }]);
});

it('still refuses the whole outline when located entries contradict reading order', () => {
  expect(readingSections([
    { title: 'A', ref: [1] }, { title: 'Unanchored' }, { title: 'C', ref: [7] }, { title: 'D', ref: [3] },
  ], segments)).toEqual([]);
  expect(readingSections([
    { title: 'A', ref: [3] }, { title: 'Unanchored' }, { title: 'B', ref: [3] }, { title: 'C', ref: [7] },
  ], segments)).toEqual([]);
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
