import { describe, expect, it } from 'vitest';
import {
  composeSpeechText,
  findReplacements,
  mapTimestampsToDocument,
  needsWorker,
  parseDocumentReplacements,
  parseReplacements,
  sameReplacement,
  serializeReplacements,
  validateReplacement,
  type Replacement,
} from '../../src/core/replacements';

const exact = (text: string, readAs: string, matchCase = true): Replacement => ({ text, readAs, mode: 'exact', matchCase });
const wildcard = (text: string, readAs: string, matchCase = true): Replacement => ({ text, readAs, mode: 'wildcard', matchCase });
const regex = (text: string, readAs: string, matchCase = true): Replacement => ({ text, readAs, mode: 'regex', matchCase });

/** The speech text a Segment becomes under these rows, brackets left alone. */
function speak(text: string, rows: Replacement[], skip?: ReadonlySet<number>): string {
  return composeSpeechText(text, findReplacements(text, rows, { skip }).spans, []).text;
}

describe('validateReplacement', () => {
  it('accepts an exact row and refuses empty text', () => {
    expect(validateReplacement(exact('IL-6', 'interleukin six'))).toBeNull();
    expect(validateReplacement(exact('', 'x'))).toEqual({ reason: 'empty' });
    expect(validateReplacement(exact('   ', 'x'))).toEqual({ reason: 'empty' });
  });

  it('accepts an empty Read as: the text is skipped', () => {
    expect(validateReplacement(exact('et al.', ''))).toBeNull();
  });

  it('refuses a regular expression that does not compile, naming the error', () => {
    const problem = validateReplacement(regex('IL-(\\d+', 'x'));
    expect(problem?.reason).toBe('syntax');
    expect(problem?.detail).toBeTruthy();
  });

  it('refuses a pattern that matches empty text', () => {
    expect(validateReplacement(regex('a*', 'x'))).toEqual({ reason: 'empty-match' });
    expect(validateReplacement(wildcard('*', 'x'))).toEqual({ reason: 'empty-match' });
  });

  it('refuses a wildcard Read as with more * or ? than its text', () => {
    expect(validateReplacement(wildcard('IL-*', 'interleukin * *'))).toEqual({ reason: 'placeholders' });
    expect(validateReplacement(wildcard('IL-*', 'interleukin \\* *'))).toBeNull();
  });
});

describe('sameReplacement', () => {
  it('is the same text, mode and case flag; without match case, text compares ignoring case', () => {
    expect(sameReplacement(exact('IL', 'a'), exact('IL', 'b'))).toBe(true);
    expect(sameReplacement(exact('IL', 'a'), exact('il', 'a'))).toBe(false);
    expect(sameReplacement(exact('IL', 'a', false), exact('il', 'b', false))).toBe(true);
    expect(sameReplacement(exact('IL', 'a'), regex('IL', 'a'))).toBe(false);
    expect(sameReplacement(exact('IL', 'a'), exact('IL', 'a', false))).toBe(false);
  });
});

describe('parsing and storing', () => {
  it('round-trips a list and drops rows it cannot read', () => {
    const rows = [exact('IL-6', 'interleukin six'), wildcard('IL-*', 'interleukin *', false), regex('(\\d+) mg', '$1 milligrams')];
    expect(parseReplacements(serializeReplacements(rows))).toEqual(rows);
    const raw = JSON.stringify([rows[0], { text: 'x' }, null, { text: 'a', readAs: 'b', mode: 'glob', matchCase: true }, rows[2]]);
    expect(parseReplacements(raw)).toEqual([rows[0], rows[2]]);
    expect(parseReplacements('not json')).toEqual([]);
    expect(parseReplacements(undefined)).toEqual([]);
  });

  it('reads a document record: its rows and when they were set', () => {
    const value = JSON.stringify({ rows: [exact('IL', 'I L')], ts: 1_700_000_000_000 });
    expect(parseDocumentReplacements(value)).toEqual({ rows: [exact('IL', 'I L')], ts: 1_700_000_000_000 });
    expect(parseDocumentReplacements(JSON.stringify({ rows: [] }))).toBeNull();
    expect(parseDocumentReplacements('')).toBeNull();
  });
});

describe('exact rows', () => {
  it('replaces the whole word', () => {
    expect(speak('IL-6 levels rose.', [exact('IL-6', 'interleukin six')])).toBe('interleukin six levels rose.');
  });

  it('does not match inside a word that a hyphen, slash or underscore continues', () => {
    const rows = [exact('IL', 'I L')];
    expect(speak('IL-2 and IL_2 and IL/IL-6', rows)).toBe('IL-2 and IL_2 and IL/IL-6');
    expect(speak('ILLUMINATE', rows)).toBe('ILLUMINATE');
    expect(speak('IL-2R', [exact('IL-2', 'x')])).toBe('IL-2R');
  });

  it('matches next to spaces and punctuation, a trailing hyphen and an apostrophe', () => {
    const rows = [exact('IL', 'I L')];
    expect(speak('(IL) IL, IL. IL\'s IL- and IL', rows)).toBe('(I L) I L, I L. I L\'s I L- and I L');
    expect(speak('(IL-2) IL-2\'s', [exact('IL-2', 'x')])).toBe('(x) x\'s');
  });

  it('checks a boundary only where the row\'s own edge is a letter or digit', () => {
    expect(speak('the .NET runtime', [exact('.NET', 'dot net')])).toBe('the dot net runtime');
    expect(speak('e.g. this', [exact('e.g.', 'for example')])).toBe('for example this');
    expect(speak('x.NET', [exact('.NET', 'dot net')])).toBe('xdot net');
  });

  it('matches case unless told not to', () => {
    expect(speak('il and Il and IL', [exact('IL', 'x')])).toBe('il and Il and x');
    expect(speak('il and Il and IL', [exact('IL', 'x', false)])).toBe('x and x and x');
  });

  it('needs no boundary beside a script written without spaces', () => {
    expect(speak('抑制IL-6表达', [exact('IL-6', '白介素六')])).toBe('抑制白介素六表达');
    expect(speak('服用阿司匹林后', [exact('阿司匹林', 'aspirin')])).toBe('服用aspirin后');
  });

  it('skips the text when Read as is empty', () => {
    expect(speak('Smith et al. found', [exact('et al.', '')])).toBe('Smith  found');
  });
});

describe('wildcard rows', () => {
  it('fills each * of Read as with what it matched, in order', () => {
    expect(speak('IL-6 and IL-10 rose', [wildcard('IL-*', 'interleukin *')])).toBe('interleukin 6 and interleukin 10 rose');
    expect(speak('H2O', [wildcard('H?O', 'water ?')])).toBe('water 2');
  });

  it('keeps * inside one word, across joiners but not spaces or other punctuation', () => {
    expect(speak('IL-6-dependent, IL-7.', [wildcard('IL-*', '[*]')])).toBe('[6-dependent], [7].');
    expect(speak('anti IL-6 and anti IL-7', [wildcard('anti *', 'against *')])).toBe('against IL-6 and against IL-7');
  });

  it('has the exact rows\' boundaries at both ends', () => {
    expect(speak('XIL-6', [wildcard('IL-*', 'x')])).toBe('XIL-6');
  });

  it('reads \\*, \\? and \\\\ as the characters themselves, in both fields', () => {
    expect(speak('5* and 5x', [wildcard('5\\*', 'five star \\*')])).toBe('five star * and 5x');
    expect(speak('a?b', [wildcard('a\\?b', 'q')])).toBe('q');
  });

  it('matches case unless told not to', () => {
    expect(speak('il-6', [wildcard('IL-*', 'interleukin *', false)])).toBe('interleukin 6');
    expect(speak('il-6', [wildcard('IL-*', 'interleukin *')])).toBe('il-6');
  });
});

describe('regular-expression rows', () => {
  it('uses JavaScript syntax with $1 in Read as, and no implied boundaries', () => {
    expect(speak('IL-6 rose', [regex('IL-(\\d+)', 'interleukin $1')])).toBe('interleukin 6 rose');
    expect(speak('ILLUMINATE', [regex('IL', 'x')])).toBe('xLUMINATE');
    expect(speak('5 mg', [regex('(?<n>\\d+) mg', '$<n> milligrams ($&) $$')])).toBe('5 milligrams (5 mg) $');
  });

  it('matches case unless told not to', () => {
    expect(speak('Il-6', [regex('il-(\\d)', 'x$1', false)])).toBe('x6');
  });

  it('ignores empty matches at run time', () => {
    expect(speak('abc', [regex('\\b', 'x')])).toBe('abc');
  });
});

describe('the ordered passes (ADR 0023)', () => {
  it('lets an earlier row win even where a later one would match more, starting earlier', () => {
    const rows = [exact('IL-6', 'interleukin six'), wildcard('anti IL-*', 'anti-interleukin *')];
    expect(speak('anti IL-6', rows)).toBe('anti interleukin six');
    expect(speak('anti IL-6', [rows[1], rows[0]])).toBe('anti-interleukin 6');
  });

  it('never matches inside text a row put in', () => {
    expect(speak('IL and I', [exact('IL', 'I L'), exact('I', 'eye')])).toBe('I L and eye');
  });

  it('skips the rows it is told to', () => {
    const rows = [exact('IL', 'I L'), exact('and', '&')];
    expect(speak('IL and I', rows, new Set([0]))).toBe('IL & I');
  });

  it('reports each replaced span in document order, with the row that made it', () => {
    const found = findReplacements('IL-6 and IL', [exact('IL', 'I L'), exact('IL-6', 'x'), exact('nothing', 'y')]);
    expect(found.spans).toEqual([
      { from: 0, to: 4, text: 'x', row: 1 },
      { from: 9, to: 11, text: 'I L', row: 0 },
    ]);
  });
});

describe('needsWorker', () => {
  it('is true once a wildcard or regular-expression row is in the list', () => {
    expect(needsWorker([exact('a', 'b')])).toBe(false);
    expect(needsWorker([exact('a', 'b'), wildcard('a*', 'b')])).toBe(true);
    expect(needsWorker([regex('a', 'b')])).toBe(true);
    expect(needsWorker([])).toBe(false);
  });
});

describe('the speech text and its map back to the document', () => {
  it('maps a word inside Read as text to the whole replaced span, and the rest one to one', () => {
    const doc = 'IL-6 levels';
    const speech = composeSpeechText(doc, findReplacements(doc, [exact('IL-6', 'interleukin six')]).spans, []);
    expect(speech.text).toBe('interleukin six levels');
    const mapped = mapTimestampsToDocument([
      { start: 0, end: 0.4, charStart: 0, charEnd: 11 },
      { start: 0.4, end: 0.6, charStart: 12, charEnd: 15 },
      { start: 0.6, end: 1, charStart: 16, charEnd: 22 },
    ], speech.pieces);
    expect(mapped.map((t) => [t.charStart, t.charEnd])).toEqual([[0, 4], [0, 4], [5, 11]]);
    expect(mapped[1]).toMatchObject({ start: 0.4, end: 0.6 });
  });

  it('removes brackets only from the document\'s own text, never from Read as', () => {
    const doc = '[IL-6] rises';
    const speech = composeSpeechText(doc, findReplacements(doc, [exact('IL-6', 'interleukin six [soft]')]).spans, [0, 5]);
    expect(speech.text).toBe('interleukin six [soft] rises');
    const mapped = mapTimestampsToDocument([
      { start: 0, end: 1, charStart: 0, charEnd: 11 },
      { start: 1, end: 2, charStart: 23, charEnd: 28 },
    ], speech.pieces);
    expect(mapped.map((t) => [t.charStart, t.charEnd])).toEqual([[1, 5], [7, 12]]);
  });

  it('drops bracket positions a replacement already covers', () => {
    const doc = 'see [12] now';
    const speech = composeSpeechText(doc, findReplacements(doc, [regex('\\[\\d+\\]', '')]).spans, [4, 7]);
    expect(speech.text).toBe('see  now');
  });

  it('maps through bracket removal alone as before', () => {
    const doc = 'a <b> c';
    const speech = composeSpeechText(doc, [], [2, 4]);
    expect(speech.text).toBe('a b c');
    const mapped = mapTimestampsToDocument([{ start: 0, end: 1, charStart: 2, charEnd: 3 }, { start: 1, end: 2, charStart: 4, charEnd: 5 }], speech.pieces);
    expect(mapped.map((t) => [t.charStart, t.charEnd])).toEqual([[3, 4], [6, 7]]);
  });

  it('keeps an unchanged text unchanged', () => {
    const speech = composeSpeechText('plain', [], []);
    expect(speech).toMatchObject({ text: 'plain', changed: false });
    const timestamps = [{ start: 0, end: 1, charStart: 0, charEnd: 5 }];
    expect(mapTimestampsToDocument(timestamps, speech.pieces)).toEqual(timestamps);
  });
});
