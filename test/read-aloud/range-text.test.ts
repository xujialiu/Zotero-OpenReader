import { describe, expect, it } from 'vitest';
import { IMAGE, rangeParts, rangeSpells } from '../../src/read-aloud/range-text';
import { BR, paragraph, type Child } from './fake-dom';

/** NFC, white space collapsed and trimmed: what highlight-style compares. */
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** A range from the start of the paragraph's first text node to the end of its last. */
function whole(children: Child[]) {
  const p = paragraph(children);
  const last = p.texts[p.texts.length - 1];
  return p.range(p.texts[0], 0, last, last.data.length);
}

const spells = (children: Child[], segment: string) => rangeSpells(rangeParts(whole(children))!, norm(segment), norm);

describe('rangeParts: what a range covers (issue #209)', () => {
  it('is the covered slice of one text node', () => {
    const p = paragraph(['Roses are red.']);
    expect(rangeParts(p.range(p.texts[0], 6, p.texts[0], 9))).toEqual(['are']);
  });

  it('gives a newline for a <br> inside the range and a gap for an <img>', () => {
    expect(rangeParts(whole(['Roses are red,', BR, 'Violets ', { img: { alt: 'x' } }, ' blue.']))).toEqual(['Roses are red,', '\n', 'Violets ', IMAGE, ' blue.']);
  });

  it('leaves out a <br> right after the range ends', () => {
    const p = paragraph(['Roses are red,', BR, 'Violets are blue.']);
    expect(rangeParts(p.range(p.texts[0], 0, p.texts[0], 14))).toEqual(['Roses are red,']);
  });

  it('reads text and a <br> inside an inline element', () => {
    expect(rangeParts(whole(['One ', { span: ['two', BR, 'three'] }, ' four.']))).toEqual(['One ', 'two', '\n', 'three', ' four.']);
  });

  it('answers null for a range it cannot walk', () => {
    expect(rangeParts({ toString: () => 'anything' })).toBeNull();
    expect(rangeParts(null)).toBeNull();
  });
});

describe('rangeSpells: the Segment around the images (issue #209)', () => {
  it('matches an unspaced <br>, which Zotero spells as a space', () => {
    expect(spells(['Roses are red,', BR, 'Violets are blue.'], 'Roses are red, Violets are blue.')).toBe(true);
  });

  it('takes whatever Zotero read for an image, whatever the page says about it', () => {
    // The EPUB view relabels the image; Zotero read "x over y" from the file
    const relabeled: Child[] = ['The ratio ', { img: { alt: 'x over y', 'aria-label': 'Zoom In' } }, ' stays fixed.'];
    expect(spells(relabeled, 'The ratio x over y stays fixed.')).toBe(true);
    expect(spells(['Let ', { img: { 'aria-label': 'Zoom In', alt: 'xi.png' } }, ' be given.'], 'Let x sub i be given.')).toBe(true);
  });

  it('matches an image Zotero gave no text', () => {
    expect(spells(['A small figure ', { img: { alt: 'figure-1.png' } }, ' sits here.'], 'A small figure sits here.')).toBe(true);
  });

  it('matches two images, and text after the last', () => {
    expect(spells(['If ', { img: {} }, ' and ', { img: {} }, ' hold, stop.'], 'If a > b and b > c hold, stop.')).toBe(true);
  });

  it('refuses text that differs outside the gaps (the wrong node, issue #4)', () => {
    expect(spells(['The ratio ', { img: {} }, ' stays fixed.'], 'The ratio x over y moves.')).toBe(false);
    expect(spells(['Roses are red,'], 'Violets are blue.')).toBe(false);
    expect(spells(['If ', { img: {} }, ' and ', { img: {} }, ' hold.'], 'If a and b and c fail.')).toBe(false);
  });

  it('refuses a range that is only an image, which would match anything', () => {
    const p = paragraph(['a', { img: { alt: 'x' } }, 'b']);
    const onlyImage = rangeParts(p.range(p.texts[0], 1, p.texts[1], 0))!;
    expect(onlyImage).toEqual(['', IMAGE, '']);
    expect(rangeSpells(onlyImage, 'Any sentence at all.', norm)).toBe(false);
  });
});
