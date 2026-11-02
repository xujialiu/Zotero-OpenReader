import type { Timestamp } from './providers/types';

/**
 * Replacements (issue #237): rules that change the text a voice is given
 * while the highlight stays on the document's text. The pure half: the
 * rows, their checks, the ordered passes over one Segment (ADR 0023) and
 * the map from the speech text back to the document's.
 *
 * Regular-expression rows run in a worker under a time limit (ADR 0024,
 * read-aloud/replacement-runner.ts); this file is what the worker and the
 * main thread both run.
 */

export type MatchMode = 'exact' | 'regex';

export interface Replacement {
  text: string;
  readAs: string;
  mode: MatchMode;
  matchCase: boolean;
}

/** A document's own rows, with when they were last set (ms since the epoch): the sync's tie-breaker. */
export interface DocumentReplacements {
  rows: Replacement[];
  ts: number;
}

export type ReplacementProblem = { reason: 'empty' | 'syntax' | 'empty-match'; detail?: string };

/** One replaced piece of a Segment: document code units [from, to) read as `text`, made by row `row`. */
export interface ReplacedSpan {
  from: number;
  to: number;
  text: string;
  row: number;
}

/** A run of the speech text and the document text it stands for: one to one, or a whole replaced span. */
export interface SpeechPiece {
  outFrom: number;
  outTo: number;
  docFrom: number;
  docTo: number;
  replaced: boolean;
}

export interface SpeechText {
  text: string;
  pieces: SpeechPiece[];
  changed: boolean;
}

const MODES: readonly MatchMode[] = ['exact', 'regex'];
/** A row's text or Read as longer than this is not a replacement anyone typed. */
const MAX_FIELD = 4000;

/** Scripts written without spaces between words: their characters neither need nor make a word boundary. */
const NO_SPACE = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}';
const NO_SPACE_CHAR = new RegExp(`^[${NO_SPACE}]$`, 'u');
const LETTER_CHAR = /^[\p{L}\p{N}\p{M}]$/u;
/** A letter, digit or mark of a script that separates its words with spaces. */
const WORD = `(?:(?![${NO_SPACE}])[\\p{L}\\p{N}\\p{M}])`;
const JOINER = '[\\-/_]';
const LEFT_EDGE = `(?<!${WORD})(?<!${WORD}${JOINER})`;
const RIGHT_EDGE = `(?!${WORD})(?!${JOINER}${WORD})`;

const isWordChar = (char: string): boolean => LETTER_CHAR.test(char) && !NO_SPACE_CHAR.test(char);
const escapeLiteral = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

function flags(row: Replacement, global: boolean): string {
  return (global ? 'g' : '') + 'u' + (row.matchCase ? '' : 'i');
}

/** The row's pattern source, with an exact row's word boundaries. */
function source(row: Replacement, edges = true): string {
  if (row.mode === 'regex') return row.text;
  const body = escapeLiteral(row.text);
  if (!edges) return body;
  const chars = Array.from(row.text);
  const first = chars[0] ?? '', last = chars[chars.length - 1] ?? '';
  return (isWordChar(first) ? LEFT_EDGE : '') + body + (isWordChar(last) ? RIGHT_EDGE : '');
}

function compile(row: Replacement, global = true): RegExp | null {
  try {
    return new RegExp(source(row), flags(row, global));
  } catch {
    return null;
  }
}

/** Why a row cannot be saved, or null. Duplicates are the list's check (sameReplacement). */
export function validateReplacement(row: Replacement): ReplacementProblem | null {
  if (!row.text.trim()) return { reason: 'empty' };
  let pattern: RegExp;
  try {
    pattern = new RegExp(source(row, false), flags(row, false));
  } catch (e) {
    return { reason: 'syntax', detail: e instanceof Error ? e.message : String(e) };
  }
  if (row.mode === 'regex' && pattern.exec('') !== null) return { reason: 'empty-match' };
  return null;
}

/** The same row for the list's purposes: text, mode and case flag; without match case, text compares ignoring case. */
export function sameReplacement(a: Replacement, b: Replacement): boolean {
  if (a.mode !== b.mode || a.matchCase !== b.matchCase) return false;
  return a.matchCase ? a.text === b.text : a.text.toLocaleLowerCase() === b.text.toLocaleLowerCase();
}

/** Is a regular-expression row in the list: the list then runs in the worker (ADR 0024). */
export function needsWorker(rows: readonly Replacement[]): boolean {
  return rows.some((row) => row.mode === 'regex');
}

function readRow(value: unknown): Replacement | null {
  if (!value || typeof value !== 'object') return null;
  const { text, readAs, mode, matchCase } = value as Record<string, unknown>;
  if (typeof text !== 'string' || typeof readAs !== 'string' || typeof matchCase !== 'boolean') return null;
  if (!MODES.includes(mode as MatchMode) || text.length > MAX_FIELD || readAs.length > MAX_FIELD) return null;
  const row: Replacement = { text, readAs, mode: mode as MatchMode, matchCase };
  return validateReplacement(row) ? null : row;
}

function json(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** A stored list, from its JSON or the array itself; rows that cannot be read or used are dropped. */
export function parseReplacements(value: unknown): Replacement[] {
  const list = json(value);
  if (!Array.isArray(list)) return [];
  const rows: Replacement[] = [];
  for (const item of list) {
    const row = readRow(item);
    if (row) rows.push(row);
  }
  return rows;
}

export function serializeReplacements(rows: readonly Replacement[]): string {
  return JSON.stringify(rows.map(({ text, readAs, mode, matchCase }) => ({ text, readAs, mode, matchCase })));
}

/** A document's record, `{ rows, ts }`; an empty list with its time is a record too (all rows deleted). */
export function parseDocumentReplacements(value: unknown): DocumentReplacements | null {
  const record = json(value);
  if (!record || typeof record !== 'object') return null;
  const { rows, ts } = record as Record<string, unknown>;
  if (!Array.isArray(rows) || typeof ts !== 'number' || !Number.isSafeInteger(ts) || ts <= 0) return null;
  return { rows: parseReplacements(rows), ts };
}

export function serializeDocumentReplacements(record: DocumentReplacements): string {
  return JSON.stringify({ rows: JSON.parse(serializeReplacements(record.rows)), ts: record.ts });
}

/** `$1`, `$<name>`, `$&`, `` $` ``, `$'` and `$$` in a regular expression's Read as (String.prototype.replace's rules). */
function expandRegex(readAs: string, match: RegExpExecArray, text: string): string {
  let out = '';
  for (let i = 0; i < readAs.length; i++) {
    const char = readAs[i];
    if (char !== '$' || i + 1 >= readAs.length) {
      out += char;
      continue;
    }
    const next = readAs[i + 1];
    if (next === '$') { out += '$'; i++; continue; }
    if (next === '&') { out += match[0]; i++; continue; }
    if (next === '`') { out += text.slice(0, match.index); i++; continue; }
    if (next === "'") { out += text.slice(match.index + match[0].length); i++; continue; }
    if (next === '<' && match.groups) {
      const close = readAs.indexOf('>', i + 2);
      if (close > 0) {
        out += match.groups[readAs.slice(i + 2, close)] ?? '';
        i = close;
        continue;
      }
    }
    if (/[0-9]/.test(next)) {
      const groups = match.length - 1;
      const two = readAs.slice(i + 1, i + 3);
      if (/^[0-9]{2}$/.test(two) && Number(two) >= 1 && Number(two) <= groups) {
        out += match[Number(two)] ?? '';
        i += 2;
        continue;
      }
      if (Number(next) >= 1 && Number(next) <= groups) {
        out += match[Number(next)] ?? '';
        i++;
        continue;
      }
    }
    out += char;
  }
  return out;
}

const overlaps = (spans: readonly ReplacedSpan[], from: number, to: number): boolean =>
  spans.some((span) => from < span.to && span.from < to);

/** One code point on from `index`, so a search never restarts inside a surrogate pair. */
function stepFrom(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? index + 2 : index + 1;
}

/**
 * The ordered passes (ADR 0023): each row in turn replaces what it finds in
 * the text no earlier row replaced. `onRow` is told before each
 * regular-expression row starts: the worker reports it, so a row that runs
 * out of time is known (ADR 0024). Spans come back in document order.
 */
export function findReplacements(
  text: string,
  rows: readonly Replacement[],
  options: { skip?: ReadonlySet<number>; onRow?(row: number): void } = {},
): { spans: ReplacedSpan[] } {
  const spans: ReplacedSpan[] = [];
  for (let k = 0; k < rows.length; k++) {
    if (options.skip?.has(k)) continue;
    const row = rows[k];
    if (row.mode === 'regex') options.onRow?.(k);
    const pattern = compile(row);
    if (!pattern) continue;
    let match: RegExpExecArray | null;
    while (pattern.lastIndex <= text.length && (match = pattern.exec(text)) !== null) {
      const from = match.index, to = from + match[0].length;
      if (to === from || overlaps(spans, from, to)) {
        if (from >= text.length) break;
        pattern.lastIndex = stepFrom(text, from);
        continue;
      }
      const readAs = row.mode === 'regex' ? expandRegex(row.readAs, match, text) : row.readAs;
      spans.push({ from, to, text: readAs, row: k });
      pattern.lastIndex = to;
    }
  }
  spans.sort((a, b) => a.from - b.from);
  return { spans };
}

/**
 * The text the voice is given: the replaced spans' Read as text, verbatim,
 * and the document's own text around them with bracket removal's `removed`
 * code units taken out (core/speech-text.ts). A removed position inside a
 * replaced span is already gone with it.
 */
export function composeSpeechText(text: string, spans: readonly ReplacedSpan[], removed: readonly number[]): SpeechText {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const gone = new Set(removed.filter((at) => !sorted.some((span) => at >= span.from && at < span.to)));
  const pieces: SpeechPiece[] = [];
  let out = '';
  const verbatim = (from: number, to: number) => {
    let start = -1;
    for (let i = from; i <= to; i++) {
      const keep = i < to && !gone.has(i);
      if (keep && start < 0) start = i;
      if (!keep && start >= 0) {
        pieces.push({ outFrom: out.length, outTo: out.length + i - start, docFrom: start, docTo: i, replaced: false });
        out += text.slice(start, i);
        start = -1;
      }
    }
  };
  let at = 0;
  for (const span of sorted) {
    verbatim(at, span.from);
    pieces.push({ outFrom: out.length, outTo: out.length + span.text.length, docFrom: span.from, docTo: span.to, replaced: true });
    out += span.text;
    at = span.to;
  }
  verbatim(at, text.length);
  return { text: out, pieces, changed: sorted.length > 0 || gone.size > 0 };
}

function identity(pieces: readonly SpeechPiece[]): boolean {
  return pieces.every((piece) => !piece.replaced && piece.docFrom === piece.outFrom);
}

/**
 * Word timings of the speech text in the document's coordinates: one to one
 * outside replacements; a timing inside a replaced span covers the whole
 * span, so `IL-6` lights while *interleukin six* is heard. Returns copies,
 * or the array itself when nothing moved; a reader-realm array is walked by
 * index (MEMORY/zotero.md).
 */
export function mapTimestampsToDocument(timestamps: ArrayLike<Timestamp>, pieces: readonly SpeechPiece[]): Timestamp[] {
  // Nothing moved: the provider's own array, as bracket removal always returned it
  if (identity(pieces)) return timestamps as Timestamp[];
  const docEnd = pieces.length ? pieces[pieces.length - 1].docTo : 0;
  const at = (position: number, end: boolean): number => {
    for (const piece of pieces) {
      if (position >= piece.outFrom && position < piece.outTo) {
        if (piece.replaced) return end ? piece.docTo : piece.docFrom;
        return piece.docFrom + (position - piece.outFrom) + (end ? 1 : 0);
      }
    }
    // Past the end, or where an empty Read as left nothing: the next piece's start
    const next = pieces.find((piece) => piece.outFrom >= position && piece.outTo > piece.outFrom);
    return next ? next.docFrom : docEnd;
  };
  const out: Timestamp[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const start = at(t.charStart, false);
    out.push({ start: t.start, end: t.end, charStart: start, charEnd: t.charEnd > t.charStart ? Math.max(start, at(t.charEnd - 1, true)) : start });
  }
  return out;
}
