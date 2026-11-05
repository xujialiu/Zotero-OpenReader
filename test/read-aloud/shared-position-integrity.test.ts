import { describe, expect, it } from 'vitest';
import { createTextAnchor, type TextAnchor } from '../../src/core/document-anchor';
import { resolveSharedItem, sdtPositionAt, snapshotBlocks } from '../../src/read-aloud/sdt-anchor';

// Exercise the plugin's real SDT snapshot -> resolution -> source-position
// boundary, without involving a WebDAV server or a user's stored positions.
const paths = ['/6/4!/4/2', '/6/4!/4/4', '/6/4!/4/6'];
const locator = (path: string) => `epubcfi(${path})`;
const missingLocator = locator('/6/88!/4/2');
const quotation = (exact: string): TextAnchor => ({ exact, prefix: '', suffix: '' });
const blocksOf = (...paragraphs: string[]) => snapshotBlocks({
  content: paragraphs.map((text, index) => ({ anchor: { selectorMap: paths[index] }, content: [{ text }] })),
});

describe('shared short-heading recovery (#234)', () => {
  it.each([
    ['Chapter 7', 'Chapter 70', 'Chapter 71'],
    ['7', '17', '70'],
    ['第7章', '第7章的故事', '第70章'],
  ])('recovers %j rather than either longer quotation', (heading, before, after) => {
    const blocks = blocksOf(before, heading, after);
    const result = resolveSharedItem(quotation(heading), missingLocator, blocks);
    expect(result).toMatchObject({ outcome: 'resolved', block: blocks[1], start: 0, end: heading.length, moved: 'locator-did-not-resolve' });
  });

  it.each([locator(paths[0]), missingLocator])('refuses an absent whole heading with locator %s', (where) => {
    const result = resolveSharedItem(quotation('Volume One Chapter 7'), where, blocksOf('Volume One Chapter 70'));
    expect(result).toMatchObject({ outcome: 'unresolved', search: 'not-found' });
  });

  it('recovers elsewhere when a valid locator names the longer heading', () => {
    const blocks = blocksOf('Chapter 70', 'Chapter 7');
    expect(resolveSharedItem(quotation('Chapter 7'), locator(paths[0]), blocks)).toMatchObject({
      outcome: 'resolved', block: blocks[1], moved: 'text-disagreed',
    });
  });
});

describe('within-block ambiguity reaches the shared-position caller (#234)', () => {
  it.each([locator(paths[0]), missingLocator])('refuses identical uncontextualized copies with locator %s', (where) => {
    expect(resolveSharedItem(quotation('Yes.'), where, blocksOf('Yes. Yes.'))).toMatchObject({ outcome: 'unresolved', search: 'ambiguous' });
  });

  it('does not rescue ambiguity in the named block with a unique occurrence elsewhere', () => {
    expect(resolveSharedItem(quotation('Yes.'), locator(paths[0]), blocksOf('Yes. Yes.', 'Yes.'))).toMatchObject({
      outcome: 'unresolved', search: 'ambiguous', because: 'text-disagreed',
    });
  });

  it.each([false, true])('propagates an ambiguous winner even when it is visited last: %s', (reverse) => {
    const paragraphs = ['Yes!', 'Yes. Yes.'];
    if (reverse) paragraphs.reverse();
    expect(resolveSharedItem(quotation('Yes.'), missingLocator, blocksOf(...paragraphs))).toMatchObject({
      outcome: 'unresolved', search: 'ambiguous',
    });
  });

  it.each([false, true])('allows a stronger unique winner after weaker ambiguity, reversed: %s', (reverse) => {
    const paragraphs = ['Yes! Yes!', 'Yes.'];
    if (reverse) paragraphs.reverse();
    const result = resolveSharedItem(quotation('Yes.'), missingLocator, blocksOf(...paragraphs));
    expect(result).toMatchObject({ outcome: 'resolved', agreement: 'exact', block: { text: 'Yes.' } });
  });

  it.each([false, true])('allows context to select a unique block over tied copies, reversed: %s', (reverse) => {
    const paragraphs = ['Earlier. Yes. Earlier. Yes.', 'Unique lead. Yes. Unique tail.'];
    const anchor = createTextAnchor(paragraphs[1], paragraphs[1].indexOf('Yes.'), paragraphs[1].indexOf('Yes.') + 4);
    if (reverse) paragraphs.reverse();
    expect(resolveSharedItem(anchor, missingLocator, blocksOf(...paragraphs))).toMatchObject({
      outcome: 'resolved', block: { text: 'Unique lead. Yes. Unique tail.' },
    });
  });
});

describe('a late shared occurrence becomes the correct SDT point (#234)', () => {
  it.each([locator(paths[0]), missingLocator])('finds the 100th copy with locator %s and crosses text-node boundaries', (where) => {
    const text = Array.from({ length: 100 }, (_, index) => `Entry ${index}. Yes. Following ${index}.`).join(' ');
    const start = text.lastIndexOf('Yes.');
    const split = start + 2;
    const blocks = snapshotBlocks({ content: [{
      anchor: { selectorMap: paths[0] },
      content: [{ text: text.slice(0, split) }, { text: text.slice(split) }],
    }] });
    const result = resolveSharedItem(createTextAnchor(text, start, start + 4), where, blocks);
    expect(result).toMatchObject({ outcome: 'resolved', start, end: start + 4 });
    if (result.outcome !== 'resolved') throw new Error('The contextual late reply was not resolved');
    expect(sdtPositionAt(result.block, result.start, result.end)).toEqual({ start: [0, 0, start], end: [0, 1, 2] });
  });
});
