import { describe, expect, it } from 'vitest';
import { segmentTextOf } from '../../src/read-aloud/range-text';
import { BR, paragraph, type Child } from './fake-dom';

/** The text of a range from the start of the paragraph's first text node to the end of its last. */
function whole(children: Child[]) {
  const p = paragraph(children);
  const last = p.texts[p.texts.length - 1];
  return segmentTextOf(p.range(p.texts[0], 0, last, last.data.length));
}

describe('segmentTextOf: a range spelled as Read Aloud spells its Segment (issue #209)', () => {
  it('is the covered slice of one text node', () => {
    const p = paragraph(['Roses are red.']);
    expect(segmentTextOf(p.range(p.texts[0], 6, p.texts[0], 9))).toBe('are');
  });

  it('puts a newline where a <br> sits inside the range', () => {
    expect(whole(['Roses are red,', BR, 'Violets are blue.'])).toBe('Roses are red,\nViolets are blue.');
  });

  it('leaves out a <br> right after the range ends', () => {
    const p = paragraph(['Roses are red,', BR, 'Violets are blue.']);
    expect(segmentTextOf(p.range(p.texts[0], 0, p.texts[0], 14))).toBe('Roses are red,');
  });

  it('puts an inline image’s alt text where the image sits', () => {
    expect(whole(['Roses are red, ', { img: { alt: 'violets' } }, ' are blue.'])).toBe('Roses are red, violets are blue.');
  });

  it('prefers an image’s aria-label to its alt', () => {
    expect(whole(['Let ', { img: { 'aria-label': 'x sub i', alt: 'x_i' } }, ' be given.'])).toBe('Let x sub i be given.');
  });

  it('gives nothing for an image with no alt, an empty one or a path-like one', () => {
    expect(whole(['A ', { img: {} }, ' b.'])).toBe('A  b.');
    expect(whole(['A ', { img: { alt: '  ' } }, ' b.'])).toBe('A  b.');
    expect(whole(['A ', { img: { alt: 'images/fig1.png' } }, ' b.'])).toBe('A  b.');
    expect(whole(['A ', { img: { alt: 'fig1.png' } }, ' b.'])).toBe('A  b.');
    expect(whole(['A ', { img: { alt: 'https://example.org/x' } }, ' b.'])).toBe('A  b.');
  });

  it('reads an alt with white space as prose, even when it names a file', () => {
    expect(whole(['A ', { img: { alt: 'see fig1.png' } }, ' b.'])).toBe('A see fig1.png b.');
  });

  it('reads text inside an inline element and a <br> inside it', () => {
    expect(whole(['One ', { span: ['two', BR, 'three'] }, ' four.'])).toBe('One two\nthree four.');
  });

  it('answers null for a range it cannot walk', () => {
    expect(segmentTextOf({ toString: () => 'anything' })).toBeNull();
    expect(segmentTextOf(null)).toBeNull();
  });
});
