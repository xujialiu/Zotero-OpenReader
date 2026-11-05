import { describe, expect, it } from 'vitest';
import { createTextAnchor, matchAnchor, type TextAnchor } from '../../src/core/document-anchor';

// Issue #234: independently specified against the shared position contract and
// OpenReader's 18b37fb. These tests are not taken from the unmerged PR #244.
const quotation = (exact: string): TextAnchor => ({ exact, prefix: '', suffix: '' });

function repeatedText(count: number): string {
  return Array.from({ length: count }, (_, index) => `Entry ${index} asks again. Yes. Answer ${index} follows.`).join(' ');
}

function lastReply(text: string): TextAnchor {
  const start = text.lastIndexOf('Yes.');
  return createTextAnchor(text, start, start + 'Yes.'.length);
}

describe('quotation boundaries across matching paths (#234)', () => {
  it.each([
    ['Chapter 7', 'Chapter 70'],
    ['7', '1907'],
    ['Volume One Chapter 7', 'Volume One Chapter 70'],
    ['Volume One Chapter 7', 'Volume One Chapter 80'],
    ['第7章', '第7章的故事'],
    ['Chapter 7', 'Chapter 7𝟘'],
    ['A', '𝒳A'],
    ['a', 'a\u0301'],
    ['e\u0301', 'e\u0301clair'],
  ])('refuses %j inside %j, including token and approximate fallback', (exact, text) => {
    expect(matchAnchor(quotation(exact), text)).toBeNull();
  });

  it('still finds a token-exact reflowed heading after rejecting a character substring', () => {
    const text = 'Chapter 70\nChapter\t7';
    expect(matchAnchor(quotation('Chapter 7'), text)).toMatchObject({
      start: text.indexOf('Chapter\t7'), end: text.length, agreement: 'aligned', matched: 1, ambiguous: false,
    });
  });

  it('ranks context-attested adjacent Han text as exact, not behind an unrelated spaced copy', () => {
    const text = '前文你好后文。 你好。';
    const anchor = createTextAnchor(text, 2, 4);
    expect(matchAnchor(anchor, text)).toMatchObject({ start: 2, end: 4, agreement: 'exact', ambiguous: false });
  });

  it('allows adjacent astral characters only when the stored context attests them', () => {
    const text = '𝒳A𝟘';
    const anchor = createTextAnchor(text, 2, 3);
    expect(matchAnchor(anchor, text)).toMatchObject({ start: 2, end: 3, agreement: 'exact', ambiguous: false });
    expect(matchAnchor(quotation('A'), text)).toBeNull();
  });

  it('preserves original UTF-16 offsets when matching NFC against NFD', () => {
    const text = '🙂 prelude. Cafe\u0301. Afterward.';
    const start = text.indexOf('Cafe');
    const end = text.indexOf(' Afterward.');
    const anchor = createTextAnchor(text, start, end);
    const match = matchAnchor(anchor, text);
    expect(anchor.exact).toBe('Café.');
    expect(match).toMatchObject({ start, end, agreement: 'exact', ambiguous: false });
    if (!match) throw new Error('The canonically equivalent quotation was not found');
    expect(text.slice(match.start, match.end)).toBe('Cafe\u0301.');
  });
});

describe('every repeated occurrence remains eligible (#234)', () => {
  it.each([40, 64, 65, 100])('finds the final reply among %i exact occurrences by its context', (count) => {
    const text = repeatedText(count);
    expect(matchAnchor(lastReply(text), text)).toMatchObject({
      start: text.lastIndexOf('Yes.'), agreement: 'exact', matched: 1, ambiguous: false,
    });
  });

  it.each([64, 65, 100])('finds the final reply among %i token-equivalent occurrences', (count) => {
    const source = repeatedText(count);
    const reflowed = source.replaceAll('Yes.', 'YES!');
    expect(matchAnchor(lastReply(source), reflowed)).toMatchObject({
      start: reflowed.lastIndexOf('YES!'), end: reflowed.lastIndexOf('YES!') + 3,
      agreement: 'aligned', matched: 1, ambiguous: false,
    });
  });

  it('reports indistinguishable occurrences rather than making a unique match', () => {
    expect(matchAnchor(quotation('Yes.'), 'Yes. '.repeat(100))).toMatchObject({ ambiguous: true });
  });

  it('finds the final contextual reply in a 10,000-occurrence block', () => {
    // A correctness/scaling fixture, not a flaky wall-clock threshold. The
    // verification notes retain measured timing separately.
    const text = repeatedText(10_000);
    expect(matchAnchor(lastReply(text), text)).toMatchObject({ start: text.lastIndexOf('Yes.'), ambiguous: false });
  });
});
