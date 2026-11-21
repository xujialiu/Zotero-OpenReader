import { splitText } from '../core/providers/split-text';
import { isInvisibleSegment } from './invisible-text';

// A 286-character table extract produced 35 seconds of audio. Leave ordinary
// sentences alone and keep cold requests for oversized ones below that sample.
const LONG_SEGMENT = 480;
const PIECE_LENGTH = 240;

interface Segment {
  text: string;
  granularity: string;
  anchor: string | null;
  sourcePosition?: unknown;
  paragraphSourcePosition?: unknown;
  openReaderOriginal?: string;
  openReaderOffset?: number;
}
interface Source {
  chain: { text: string };
  rawStart: number;
  rawEnd: number;
}
interface Collection {
  segments: Segment[];
  _sources?: WeakMap<Segment, Source>;
  addSegment(chain: Source['chain'], from: number, to: number, granularity: string): boolean;
  getSegmentTextSpans(segment: Segment): unknown;
}
interface Mapper { textNodeSpansToSourcePosition(spans: unknown): unknown }

/** Map normalized UTF-16 offsets to the raw SDT chain, including collapsed whitespace. */
function rawBoundaries(source: Source): number[] {
  const raw = source.chain.text.slice(source.rawStart, source.rawEnd);
  const positions: number[] = [];
  let end = source.rawStart;
  for (const word of raw.matchAll(/\S+/gu)) {
    if (positions.length) positions.push(end);
    const start = source.rawStart + word.index;
    end = start + word[0].length;
    for (let at = start; at < end; at++) positions.push(at);
  }
  positions.push(end);
  return positions;
}

function divide(collection: Collection, original: Segment, mapper: Mapper): Segment[] | null {
  const source = collection._sources?.get(original);
  if (!source || isInvisibleSegment(original)) return null;
  const raw = rawBoundaries(source);
  if (raw.length !== original.text.length + 1) return null;
  const list = collection.segments;
  const before = list.length;
  const pieces: Segment[] = [];
  try {
    for (const part of splitText(original.text, PIECE_LENGTH)) {
      const text = part.text.trim();
      if (!text) continue;
      const offset = part.offset + part.text.indexOf(text);
      if (!collection.addSegment(source.chain, raw[offset], raw[offset + text.length], original.granularity)) return null;
      const piece = list[list.length - 1];
      if (piece.text !== text) return null;
      // Use the same native source registry that word highlighting and annotations consult.
      piece.sourcePosition = mapper.textNodeSpansToSourcePosition(collection.getSegmentTextSpans(piece));
      if (!piece.sourcePosition) return null;
      piece.paragraphSourcePosition = original.paragraphSourcePosition;
      piece.anchor = pieces.length ? null : original.anchor;
      piece.openReaderOriginal = original.text;
      piece.openReaderOffset = offset;
      pieces.push(piece);
    }
    return pieces;
  } finally {
    // addSegment appends. Publish the pieces in reading order only after every range succeeded.
    list.length = before;
  }
}

/** Called after native source materialization, before selection/position lookup and setSegments. */
export function divideLongSegments(collection: Collection | undefined, list: Segment[], mapper: Mapper | undefined): void {
  if (!collection || collection.segments !== list || !mapper || typeof collection.addSegment !== 'function') return;
  const expanded: Segment[] = [];
  for (let i = 0; i < list.length; i++) {
    const original = list[i];
    const pieces = original.text.length > LONG_SEGMENT ? divide(collection, original, mapper) : null;
    if (pieces) expanded.push(...pieces);
    else expanded.push(original);
  }
  if (expanded.length === list.length) return;
  for (let i = 0; i < expanded.length; i++) list[i] = expanded[i];
}
