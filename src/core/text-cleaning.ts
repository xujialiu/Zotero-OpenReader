import { composeSpeechText, type ReplacedSpan, type SpeechText } from './replacements';
import { prepareSpeechText } from './speech-text';
import type { ProviderId } from './providers/types';

export type CleaningDocumentType = 'pdf' | 'epub' | 'snapshot';
export type CleaningProvider = ProviderId | 'zotero-standard' | 'zotero-premium';

export interface TextCleaningContext {
  documentType?: CleaningDocumentType;
  provider?: CleaningProvider;
}

export interface TextCleaningRule {
  readonly id: string;
  readonly scope: {
    readonly documentTypes: 'all' | readonly CleaningDocumentType[];
    readonly providers: 'all' | readonly CleaningProvider[];
  };
  /** Sorted, unique UTF-16 deletion positions; built-in scans must have bounded work. */
  remove(text: string): readonly number[];
}

/** Plugin-owned rules, not user-editable or synced Replacement rows (ADR 0025). */
export const TEXT_CLEANING_RULES: readonly TextCleaningRule[] = [
  { id: 'chinese-whitespace', scope: { documentTypes: 'all', providers: 'all' }, remove: chineseWhitespace },
];

export interface PreparedDocumentSpeech extends SpeechText {
  bracketsRemoved: number;
  cleaning: Array<{ id: string; removed: number }>;
}

export interface SpeechPreparationOptions {
  stripBrackets?: boolean;
  bracketPairs?: string;
  context?: TextCleaningContext;
  /** A maintained rule list, never user-supplied patterns. */
  rules?: readonly TextCleaningRule[];
}

const HAN = /^\p{Script=Han}$/u;
const WHITESPACE = /^\s$/u;
const CHINESE_PUNCTUATION = new Set(Array.from('，。！？；：、（）【】《》〈〉「」『』“”‘’〔〕［］｛｝…—·'));

/** A linear code-point scan; the returned positions are UTF-16 code units. */
function chineseWhitespace(text: string): number[] {
  const removed: number[] = [];
  let previous = '', whitespace = -1, at = 0;
  for (const char of text) {
    if (WHITESPACE.test(char)) {
      if (whitespace < 0) whitespace = at;
    } else {
      if (whitespace >= 0 && ((HAN.test(previous) && (HAN.test(char) || CHINESE_PUNCTUATION.has(char)))
        || (HAN.test(char) && CHINESE_PUNCTUATION.has(previous)))) {
        for (let i = whitespace; i < at; i++) removed.push(i);
      }
      whitespace = -1;
      previous = char;
    }
    at += char.length;
  }
  return removed;
}

/** One preparation path, preserving user Read as and the original UTF-16 coordinates. */
export function prepareDocumentSpeech(
  text: string,
  spans: readonly ReplacedSpan[],
  options: SpeechPreparationOptions = {},
): PreparedDocumentSpeech {
  const brackets = prepareSpeechText(text, options.stripBrackets ?? true, options.bracketPairs);
  let speech = composeSpeechText(text, spans, brackets.removed);
  const removed = [...brackets.removed];
  const cleaning: PreparedDocumentSpeech['cleaning'] = [];
  const context = options.context ?? {};
  for (const rule of options.rules ?? TEXT_CLEANING_RULES) {
    if (rule.scope.documentTypes !== 'all' && (!context.documentType || !rule.scope.documentTypes.includes(context.documentType))) continue;
    if (rule.scope.providers !== 'all' && (!context.provider || !rule.scope.providers.includes(context.provider))) continue;
    const before = removed.length;
    // Adjacent document pieces can be separated by removed brackets. Read as
    // pieces are opaque boundaries, including an empty Read as.
    for (let first = 0; first < speech.pieces.length;) {
      if (speech.pieces[first].replaced) { first++; continue; }
      let last = first;
      while (last + 1 < speech.pieces.length && !speech.pieces[last + 1].replaced) last++;
      const from = speech.pieces[first].outFrom;
      const to = speech.pieces[last].outTo;
      let piece = first;
      for (const relative of rule.remove(speech.text.slice(from, to))) {
        const at = from + relative;
        while (speech.pieces[piece].outTo <= at) piece++;
        removed.push(speech.pieces[piece].docFrom + at - speech.pieces[piece].outFrom);
      }
      first = last + 1;
    }
    if (removed.length > before) {
      cleaning.push({ id: rule.id, removed: removed.length - before });
      speech = composeSpeechText(text, spans, removed);
    }
  }
  return { ...speech, bracketsRemoved: brackets.removed.length, cleaning };
}

/** Normalized document text retained on a playable subdivision of a native Segment. */
export interface SpeechSegment {
  text: string;
  openReaderOriginal?: string;
  openReaderOffset?: number;
}

/** Capture primitives before a worker or provider await can outlive the reader realm. */
export function snapshotSpeechSegment(segment: SpeechSegment | string): SpeechSegment {
  if (typeof segment === 'string') return { text: segment };
  const { text, openReaderOriginal, openReaderOffset } = segment;
  return { text, openReaderOriginal, openReaderOffset };
}

/** Match rules on their original sentence, then express this piece's speech in its own coordinates. */
export function prepareSegmentSpeech(segment: SpeechSegment, spans: readonly ReplacedSpan[], options: SpeechPreparationOptions): PreparedDocumentSpeech {
  const { text, openReaderOriginal: original, openReaderOffset: start } = segment;
  if (original === undefined || start === undefined) return prepareDocumentSpeech(text, spans, options);
  const full = prepareDocumentSpeech(original, spans, options);
  const end = start + text.length;
  // addSegment trims the separating space. A replacement starting on that space belongs here.
  const ownsFrom = start > 0 && original[start - 1] === ' ' ? start - 1 : start;
  const pieces: SpeechText['pieces'] = [];
  let out = '';
  for (const piece of full.pieces) {
    const from = Math.max(start, piece.docFrom);
    const to = Math.min(end, piece.docTo);
    let speech: string;
    if (piece.replaced) {
      if (piece.docFrom < ownsFrom || piece.docFrom >= end) continue;
      speech = full.text.slice(piece.outFrom, piece.outTo);
    } else {
      if (to <= from) continue;
      speech = full.text.slice(piece.outFrom + from - piece.docFrom, piece.outFrom + to - piece.docFrom);
    }
    pieces.push({ docFrom: from - start, docTo: Math.max(from, to) - start, outFrom: out.length,
      outTo: out.length + speech.length, replaced: piece.replaced });
    out += speech;
  }
  return { ...full, text: out, pieces, changed: full.changed };
}
