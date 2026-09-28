/**
 * The whole sentence on screen while Read Aloud follows a PDF (issue #83).
 *
 * Zotero's PDF view follows the reading position on every state push while
 * the position is locked: `setReadAloudState` (reader.js:76421 in
 * 10.0.2-beta.9) calls `navigateToPosition(activeSegment.sourcePosition,
 * { ifNeeded: true, visibilityMargin: -innerHeight / 4, block: 'center',
 * inline: 'nearest', behavior: 'smooth' })` (76472–76479). That method
 * measures the sentence by the box of its rects on its first page only
 * (`getPositionBoundingViewRect`, 77036, through `getPositionBoundingRect(
 * position, position.pageIndex)`, 32305), and `getScrollTarget` (75155)
 * scrolls only when that box's top is in the bottom quarter of the viewport
 * or its bottom in the top quarter (75171), to put the top on the center
 * line (75183). The box's bottom is never held against the viewport's
 * bottom edge, nor its top against the top edge, and the sentence's
 * continuation on the next page (`nextPageRects`) is never measured — so a
 * sentence continued past the bottom, on the next page or at the top of the
 * next column stays cut, and Shift+Enter, which lands in the same branch,
 * cannot bring the tail in. Measured 2026-09-10 (notes/NOTES_2026-09-10.md).
 *
 * The PDF-only controller in pdf-follow.ts owns the follow state (#90),
 * preserves Zotero's state/highlight work and calls this geometry directly.
 * The native scroll/debounce branch is disabled on owned views: delayed
 * scroll events cannot disengage following, but deliberate navigation can.
 * Both pages are measured, the whole placed at the reading line (#155) when
 * it fits, else the real word followed when available; unmeasurable
 * positions and horizontal-only navigation use the saved native method
 * under the same plugin-owned lock, which still centers.
 *
 * Compartments: the shadow runs exported into the reader's compartment, so
 * `this`, the position and the options arrive behind Xray wrappers (waived
 * through the dep); reader-realm functions are called with primitives only,
 * their arrays walked by index. The scroll options are built here and cloned
 * into the container's own window before `scrollTo`, which reads a foreign
 * dictionary as empty (measured 2026-09-10).
 */

import { autoScrollMode, readingLine, type AutoScrollMode } from '../core/settings';
import type { WordTiming } from '../core/highlight-level';
import type { AnyFn } from './proto-patches';
import { createPdfFollow } from './pdf-follow';
import type { FollowIntents } from './follow-intent';
export { isFollowCall } from './pdf-follow';

/** A box in the container's coordinates, `[left, top, right, bottom]` in CSS px — Zotero's own shape. */
export type Box = [number, number, number, number];

/** What `#viewerContainer` reports. */
export interface Viewport {
  scrollTop: number;
  scrollLeft: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

/** Why following moved: sentence entry, explicit return, clipped content, a real word, or a new line of text (#157). */
export type FollowReason = 'sentence' | 'return' | 'cut' | 'part' | 'line' | 'none';

/**
 * Scroll at every line (#157): whether the sentence being read has a
 * highlighted word now (`word`), will have one once its first word is
 * spoken (`coming`), or has none to follow and scrolls at every sentence
 * (`sentence`).
 */
export type LineWords = 'word' | 'coming' | 'sentence';

/**
 * Which of the three a sentence is in. A word counts only while the Word
 * switch draws it; the whole-segment stand-in of a wordless voice is no
 * word; a sentence whose clip has real timings but no word active yet waits
 * for its first.
 */
export function lineWords(input: { wordShown: boolean; active: WordTiming; segment: WordTiming }): LineWords {
  if (!input.wordShown) return 'sentence';
  if (input.active === 'real') return 'word';
  if (input.active === 'stand-in') return 'sentence';
  return input.segment === 'real' ? 'coming' : 'sentence';
}

/** Whether two boxes lie on one line of text: they overlap vertically by at least half the shorter one's height. */
export function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return overlap > 0 && overlap >= Math.min(a[3] - a[1], b[3] - b[1]) / 2;
}

export interface FollowInput {
  mode?: AutoScrollMode;
  /** The reading line (#155), 0 to 100: the share of the free space left above what is placed. 50, the center, when left out. */
  line?: number;
  entered?: boolean;
  force?: boolean;
  /** The box of the sentence's rects on its first page — what Zotero measures. */
  head: Box;
  /** The union of every part's box: the head, and the next page's rects when the sentence has them. */
  whole: Box;
  /** The box of the word being read, when the voice has real word timing; null otherwise. */
  part: Box | null;
  viewport: Viewport;
  /** The breathing room inside the viewport's edges; `followMargin` of the viewport when left out. */
  margin?: number;
  /** The px a docked player bar lies over at the viewport's top and bottom (#135); none when left out. */
  inset?: { top: number; bottom: number };
  /** Scroll at every line (#157): what the sentence has to follow; `sentence` when left out. */
  words?: LineWords;
  /** Scroll at every line: the box of the highlighted word's first rect, the line it starts on. */
  wordLine?: Box | null;
  /** Scroll at every line: the line last placed in this sentence; null for none yet. */
  placedLine?: Box | null;
}

export interface FollowTarget {
  reason: FollowReason;
  /** Whether the whole sentence fits the actual viewport. */
  fits: boolean;
  /**
   * Whether the measurement is usable. Fully visible content is handled
   * here too, so native early-scroll triggers cannot run afterward.
   */
  handled: boolean;
  top?: number;
  left?: number;
  /** Scroll at every line: the line now placed at the reading line, scrolled to or already there. */
  placedLine?: Box;
}

const MARGIN_MIN = 8;
const MARGIN_MAX = 24;
const MARGIN_SHARE = 40;
/** Zotero's inline-nearest margin (reader.js NEAREST_MARGIN, 75153). */
const NEAREST_MARGIN = 10;
/**
 * A target already issued is not issued again on the pushes inside this
 * window: the follow calls on every word push, mid-animation included, and
 * the targets below do not depend on where the animation is.
 */
export const RETARGET_MS = 1500;
/** Where the shadow keeps its last decision, on the view itself: a WeakMap keyed by a waived wrapper misses the same view reached from our side. */
const LAST = '_zoteroTTSSentenceInView';

/** A fortieth of the viewport, between 8 and 24 px. */
export function followMargin(clientHeight: number): number {
  const share = Math.round(clientHeight / MARGIN_SHARE);
  if (!Number.isFinite(share)) return MARGIN_MIN;
  return Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, share));
}

/** The bounding box of Zotero's rects, `[x1, y1, x2, y2]` each; null for none, or a malformed one. */
export function boxOfRects(rects: unknown): Box | null {
  if (!Array.isArray(rects) || rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  // By index: a reader-realm array takes no sandbox callback
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!Array.isArray(r) || r.length < 4) return null;
    const a = Number(r[0]);
    const b = Number(r[1]);
    const c = Number(r[2]);
    const d = Number(r[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return null;
    x1 = Math.min(x1, a);
    y1 = Math.min(y1, b);
    x2 = Math.max(x2, c);
    y2 = Math.max(y2, d);
  }
  return [x1, y1, x2, y2];
}

export function unionBoxes(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** The corner of a pdf.js page view this module reads. */
export interface PageLike {
  viewport: { convertToViewportPoint(x: number, y: number): ArrayLike<number> };
  div: { getBoundingClientRect(): { x: number; y: number } };
}

export interface ScrollOffsets {
  scrollLeft: number;
  scrollTop: number;
}

/**
 * A page's rects as a box in container coordinates — Zotero's
 * `getPositionBoundingViewRect` (reader.js:77036) step for step: the PDF
 * box's corners through the page viewport, the page div's client rect, the
 * container's scroll offsets.
 */
export function pageBoxInContainer(rects: unknown, page: PageLike, scroll: ScrollOffsets): Box | null {
  const r = boxOfRects(rects);
  if (!r) return null;
  const p1 = page.viewport.convertToViewportPoint(r[0], r[1]);
  const p2 = page.viewport.convertToViewportPoint(r[2], r[3]);
  const x1 = Number(p1[0]);
  const y2 = Number(p1[1]);
  const x2 = Number(p2[0]);
  const y1 = Number(p2[1]);
  const pr = page.div.getBoundingClientRect();
  return [
    pr.x + Math.min(x1, x2) + scroll.scrollLeft,
    pr.y + Math.min(y1, y2) + scroll.scrollTop,
    pr.x + Math.max(x1, x2) + scroll.scrollLeft,
    pr.y + Math.max(y1, y2) + scroll.scrollTop,
  ];
}

/** A Read Aloud position as this module reads it: a page, its rects, the next page's when the sentence runs on. */
export interface PositionLike {
  pageIndex?: unknown;
  rects?: unknown;
  nextPageRects?: unknown;
  rotation?: unknown;
}

export interface Extent {
  head: Box;
  whole: Box;
}

/**
 * The head (first-page box) and the whole (with the next page's box when
 * there is one) of a position; null for what cannot be measured — no rects,
 * a page the viewer does not have, a rotated position — which the caller
 * leaves to Zotero.
 */
export function extentOf(
  position: PositionLike | null | undefined,
  pageAt: (index: number) => PageLike | null | undefined,
  scroll: ScrollOffsets,
): Extent | null {
  if (!position || typeof position !== 'object') return null;
  const index = position.pageIndex;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  if (position.rotation) return null;
  const first = pageAt(index);
  if (!first) return null;
  const head = pageBoxInContainer(position.rects, first, scroll);
  if (!head) return null;
  let whole: Box = head;
  const nextRects = position.nextPageRects;
  if (Array.isArray(nextRects) && nextRects.length) {
    const next = pageAt(index + 1);
    const tail = next ? pageBoxInContainer(nextRects, next, scroll) : null;
    if (tail) whole = unionBoxes(head, tail);
  }
  return { head, whole };
}

/** Whether any of the box lies outside the viewport less the margin. */
export function isOutside(box: Box, viewport: Viewport, margin: number): boolean {
  return box[1] < viewport.scrollTop + margin || box[3] > viewport.scrollTop + viewport.clientHeight - margin;
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, high));

/** Zotero's `inline: 'nearest'` rule (reader.js:75190–75206) on the box brought in; undefined when nothing has to move. */
function inlineNearest(box: Box, v: Viewport): number | undefined {
  const x = box[0];
  const right = box[2];
  const viewportRight = v.scrollLeft + v.clientWidth;
  const width = right - x;
  let left: number | undefined;
  if (width <= v.clientWidth) {
    const inlineMargin = Math.min(NEAREST_MARGIN, Math.max(0, (v.clientWidth - width) / 2));
    if (x < v.scrollLeft) left = x - inlineMargin;
    else if (right > viewportRight) left = right - v.clientWidth + inlineMargin;
  } else if (x > v.scrollLeft) {
    left = x;
  } else if (right < viewportRight) {
    left = right - v.clientWidth;
  }
  if (left === undefined) return undefined;
  left = clamp(left, 0, Math.max(0, v.scrollWidth - v.clientWidth));
  return Math.abs(left - v.scrollLeft) < 1 ? undefined : left;
}

/**
 * The follow decision: place at the reading line on sentence entry in
 * sentence mode, otherwise only after actual clipping; explicit return always
 * places a fitting sentence. A sentence taller than the viewport follows the
 * word being read when that leaves the viewport, placed at the reading line
 * the same way; without a word its head goes to
 * the top edge plus the margin, once. A target that is where the view
 * already stands is no scroll.
 *
 * Scroll at every line (#157) places the line the highlighted word starts
 * on whenever it is not the line last placed, and on a return, whatever
 * that leaves of the sentence above it; before the first word of a timed
 * sentence it waits, a return meanwhile placing the sentence's first line;
 * a sentence with no word to follow is placed exactly as at every sentence.
 */
export function followTarget(input: FollowInput): FollowTarget {
  const { head, whole, part, viewport: v } = input;
  const mode = autoScrollMode(input.mode);
  if (mode === 'line' && (input.words === undefined || input.words === 'sentence' || (input.words === 'word' && !input.wordLine))) {
    return followTarget({ ...input, mode: 'sentence' });
  }
  const CH = v.clientHeight;
  const ST = v.scrollTop;
  if (!(CH > 0)) return { reason: 'none', fits: false, handled: false };
  // What a docked bar covers is off screen (#135): measure against the rest
  let above = Math.max(0, input.inset?.top ?? 0);
  let below = Math.max(0, input.inset?.bottom ?? 0);
  if (!(CH - above - below > 0)) above = below = 0;
  const VH = CH - above - below;
  const seen: Viewport = { ...v, scrollTop: ST + above, clientHeight: VH };
  // The free space around the box is split above and below it by the
  // reading line: 50 centers, 0 is the top edge, 100 the bottom (#155)
  const line = readingLine(input.line);
  const placeOn = (box: Box): number => box[1] - above - ((VH - (box[3] - box[1])) * line) / 100;
  const margin = input.margin ?? followMargin(VH);
  const fits = whole[3] - whole[1] <= VH;
  let reason: FollowReason = 'none';
  let focus = whole;
  let top: number | undefined;
  let placedLine: Box | undefined;
  if (mode === 'line') {
    if (input.words === 'word') {
      const wordLine = input.wordLine!;
      focus = wordLine;
      if (input.force || !input.placedLine || !sameLine(wordLine, input.placedLine)) {
        reason = input.force ? 'return' : 'line';
        top = placeOn(wordLine);
        placedLine = wordLine;
      }
    } else if (input.force) {
      reason = 'return';
      focus = head;
      top = placeOn(head);
    } else {
      return { reason: 'none', fits, handled: true };
    }
  } else if (fits) {
    if (input.force || (mode === 'sentence' && input.entered) || isOutside(whole, seen, 0)) {
      reason = input.force ? 'return' : mode === 'sentence' && input.entered ? 'sentence' : 'cut';
      top = placeOn(whole);
    }
  } else if (input.entered || input.force) {
    reason = input.force ? 'return' : 'cut';
    focus = head;
    top = head[1] - margin - above;
  } else if (part) {
    focus = part;
    if (isOutside(part, seen, 0)) {
      reason = 'part';
      top = placeOn(part);
    }
  } else {
    // No word timing: never repeatedly drag a tall sentence back to its head.
    return { reason: 'none', fits, handled: true };
  }
  const left = inlineNearest(focus, v);
  if (top !== undefined) top = clamp(top, 0, Math.max(0, v.scrollHeight - CH));
  if (top !== undefined && Math.abs(top - ST) < 1) top = undefined;
  if (top === undefined && left === undefined) return { reason: 'none', fits, handled: true, ...(placedLine ? { placedLine } : {}) };
  const target: FollowTarget = { reason: reason === 'none' ? 'cut' : reason, fits, handled: true };
  if (top !== undefined) target.top = top;
  if (left !== undefined) target.left = left;
  if (placedLine) target.placedLine = placedLine;
  return target;
}

export interface SentenceInViewDeps {
  enabled?(): boolean;
  intents?: FollowIntents;
  resuming?(reader: any): boolean;
  mode?(): AutoScrollMode;
  /** The reading line (#155), 0 to 100. Optional: 50, the center. */
  line?(): number;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays: `this` and the arguments of an exported function arrive behind Xray wrappers. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.cloneInto into the container's own window: `scrollTo` reads a dictionary from another compartment as empty. Optional for tests. */
  cloneInto?(container: unknown, value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  /** What the reader's active word timestamp is (highlight-style.ts): only a real word is followed. Optional: without it no word is. */
  wordTiming?(reader: unknown): WordTiming;
  /** What the active segment's clip carries (highlight-style.ts): Scroll at every line waits for the first word only of real timings (#157). Optional: none. */
  segmentTiming?(reader: unknown): WordTiming;
  /** Whether the Word switch draws the word: Scroll at every line follows only a highlighted word (#157). Optional: on. */
  wordShown?(): boolean;
  /** The clock of the re-target window. Optional: Date.now. */
  now?(): number;
  /**
   * How many px of a view's viewport a docked player bar lies over, at its top and bottom (#135):
   * given the view's iframe and the viewport's box in the document that holds it. Optional: none.
   */
  covered?(frame: unknown, box: { top: number; bottom: number }): { top: number; bottom: number };
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface SentenceInView {
  refresh(): void;
  automatic(reader: any): boolean | null;
  manual(reader: any): void;
  locate(reader: any, automatic?: boolean): void;
  /** Patch the reader's PDF views; true once they are. Repeat calls are cheap no-ops, so this may be called on every Read Aloud event. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for `Zotero.ZoteroTTS.diagnostics.sentenceInView()`. */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every patched prototype back. */
  dispose(): void;
}

/** The last decision the shadow made on a view, kept on the view for the diagnostic and the re-target window. */
interface LastDecision {
  at: number;
  reason: FollowReason;
  fits: boolean;
  from: number;
  top: number | null;
  left: number | null;
  /** Whether a scroll was issued for it (false: a repeat inside the window, or nothing to do). */
  issued: boolean;
  /** Scroll at every line (#157): what the sentence had to follow, and the line placed last; null in the other styles. */
  words: LineWords | null;
  placedLine: Box | null;
}

/**
 * What following remembers of the sentence on a view: its key, the style and
 * reading line it was placed by, and for Scroll at every line (#157) the
 * regime it was last placed in and the line placed last.
 */
interface Entry {
  key: string;
  mode: string;
  regime: 'line' | 'sentence' | null;
  placedLine: Box | null;
}

/**
 * Scroll at every line's inputs for one push, and what it changes in the
 * entry: `entered` is true on the first push of a sentence in the sentence
 * regime, and a turn into the line regime forgets the line placed before.
 */
export function lineInputs(
  entry: { regime: 'line' | 'sentence' | null; placedLine: Box | null },
  words: LineWords,
  wordLine: Box | null,
): { words: LineWords; wordLine: Box | null; entered: boolean } {
  const regime = words === 'coming' ? entry.regime : words === 'word' && wordLine ? 'line' : 'sentence';
  const turned = regime !== entry.regime;
  if (turned && regime === 'line') entry.placedLine = null;
  entry.regime = regime;
  return { words, wordLine, entered: turned && regime === 'sentence' };
}

export function createSentenceInView(deps: SentenceInViewDeps): SentenceInView {
  /** The sentence last followed on a view, and the style and reading line it was placed by. */
  const entries = new WeakMap<object, Entry>();
  const controller = createPdfFollow({
    ...deps,
    clear(view) { delete view[LAST]; entries.delete(view); },
    follow(reader, view, originalNavigate, reset, force) {
      if (reset) delete view[LAST];
      const position = waive(waive(view._readAloudState)?.activeSegment)?.sourcePosition;
      if (!position) return;
      let container: any = null;
      const options = { ifNeeded: true, visibilityMargin: -(view._iframeWindow.innerHeight ?? 1000) / 4,
        block: 'center', inline: 'nearest', behavior: 'smooth' };
      try {
        container = containerOf(view);
        if (follow(reader, view, waive(position), options, force)) return;
      } catch (e) { deps.error(e); }
      // The saved method retains Zotero's horizontal-nearest behavior and
      // handles uncommon positions we cannot measure, without its lock/timer.
      const result = Reflect.apply(originalNavigate, view, [position, deps.cloneInto ? deps.cloneInto(container, options) : options]);
      if (result?.catch) result.catch(deps.exportFunction ? deps.exportFunction(deps.error, view) : deps.error);
    },
  });
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const now = (): number => (deps.now ? deps.now() : Date.now());

  const containerOf = (view: any): any => view?._iframeWindow?.document?.getElementById?.('viewerContainer') ?? null;
  const pagesOf = (view: any): any[] | null => {
    const pages = view?._iframeWindow?.PDFViewerApplication?.pdfViewer?._pages;
    return Array.isArray(pages) ? pages : null;
  };

  /** What a docked bar covers of a viewport `height` px tall whose top lies `top` px down the view's own window. */
  function insetOf(view: any, top: number, height: number): { top: number; bottom: number } {
    const frame = view?._iframe;
    const box = deps.covered ? frame?.getBoundingClientRect?.() : null;
    if (!box) return { top: 0, bottom: 0 };
    const y = Number(box.top) + top;
    return deps.covered!(frame, { top: y, bottom: y + height });
  }

  /** The sentence and the word against the container, or null for what Zotero should handle. */
  function measure(reader: unknown, view: any, position: unknown): { extent: Extent; part: Box | null; wordLine: Box | null; viewport: Viewport; inset: { top: number; bottom: number } } | null {
    const container = containerOf(view);
    const pages = pagesOf(view);
    if (!container || !pages) return null;
    const scroll: ScrollOffsets = { scrollLeft: Number(container.scrollLeft), scrollTop: Number(container.scrollTop) };
    const pageAt = (i: number): PageLike | null => (i >= 0 && i < pages.length ? (pages[i] ?? null) : null);
    const extent = extentOf(position as PositionLike, pageAt, scroll);
    if (!extent) return null;
    const viewport: Viewport = {
      scrollTop: scroll.scrollTop,
      scrollLeft: scroll.scrollLeft,
      clientWidth: Number(container.clientWidth),
      clientHeight: Number(container.clientHeight),
      scrollWidth: Number(container.scrollWidth),
      scrollHeight: Number(container.scrollHeight),
    };
    const c = container.getBoundingClientRect();
    const inset = insetOf(view, Number(c.top) + (Number(container.clientTop) || 0), viewport.clientHeight);
    let part: Box | null = null;
    let wordLine: Box | null = null;
    if (deps.wordTiming?.(reader) === 'real') {
      const word = waive(waive(view._readAloudState)?.activeWordSourcePosition);
      if (word && typeof word.pageIndex === 'number') {
        const page = pageAt(word.pageIndex);
        if (page) part = pageBoxInContainer(word.rects, page, scroll);
        // The line the word starts on: a hyphenated word's first rect (#157)
        if (page && part) wordLine = pageBoxInContainer([word.rects[0]], page, scroll);
      }
    }
    return { extent, part, wordLine, viewport, inset };
  }

  /** The follow's call: true when answered here, false when Zotero's method should run. */
  function follow(reader: unknown, view: any, position: any, options: any, force: boolean): boolean {
    const m = measure(reader, view, position);
    if (!m) return false;
    const mode = autoScrollMode(deps.mode?.());
    const line = readingLine(deps.line?.());
    const key = JSON.stringify(position);
    const previous = entries.get(view);
    const entered = previous?.key !== key;
    // A new reading line re-places the sentence as a new style does
    const changedMode = previous?.mode !== `${mode}@${line}`;
    if (changedMode) delete view[LAST];
    const entry: Entry = previous && !entered && !changedMode ? previous : { key, mode: `${mode}@${line}`, regime: null, placedLine: null };
    entries.set(view, entry);
    const lines = mode === 'line'
      ? lineInputs(entry, lineWords({ wordShown: deps.wordShown?.() ?? true, active: deps.wordTiming?.(reader) ?? 'none',
        segment: deps.segmentTiming?.(reader) ?? 'none' }), m.wordLine)
      : null;
    // First rect is the reading-order head, even when a column-crossing
    // sentence's union starts at the top of its second column.
    let head = m.extent.head;
    const page = pagesOf(view)?.[position.pageIndex];
    if (page && position.rects?.length) head = pageBoxInContainer([position.rects[0]], page, m.viewport) ?? head;
    const target = followTarget({ head, whole: m.extent.whole, part: m.part, viewport: m.viewport,
      mode, line, entered: entered || changedMode, force, inset: m.inset, ...(lines ? { ...lines, placedLine: entry.placedLine } : {}) });
    if (target.placedLine) entry.placedLine = target.placedLine;
    const last: LastDecision | undefined = view[LAST];
    const at = now();
    const decision: LastDecision = {
      at,
      reason: target.reason,
      fits: target.fits,
      from: m.viewport.scrollTop,
      top: target.top ?? null,
      left: target.left ?? null,
      issued: false,
      words: lines?.words ?? null,
      placedLine: lines ? entry.placedLine : null,
    };
    if (!target.handled || target.reason === 'none') {
      view[LAST] = decision;
      return target.handled;
    }
    if (last?.issued && last.top === decision.top && last.left === decision.left && at - last.at < RETARGET_MS) {
      // The same target, issued moments ago: the animation is on its way
      view[LAST] = { ...decision, at: last.at, issued: true };
      return true;
    }
    const opts: Record<string, unknown> = { behavior: options?.behavior ?? 'smooth' };
    if (target.top !== undefined) opts.top = target.top;
    if (target.left !== undefined) opts.left = target.left;
    const container = containerOf(view);
    container.scrollTo(deps.cloneInto ? deps.cloneInto(container, opts) : opts);
    decision.issued = true;
    view[LAST] = decision;
    const pageIndex = Number(position?.pageIndex);
    deps.debug?.(
      `sentence in view: ${target.reason} on page ${pageIndex + 1}: scrollTop ${Math.round(m.viewport.scrollTop)} -> ${Math.round(target.top ?? m.viewport.scrollTop)}` +
        `, sentence ${Math.round(m.extent.whole[3] - m.extent.whole[1])} px, viewport ${Math.round(m.viewport.clientHeight)} px`,
    );
    return true;
  }

  function pdfViewsOf(reader: any): any[] {
    const internal = reader?._internalReader;
    if (!internal) return [];
    return [internal._primaryView, internal._secondaryView].filter((v) => v && typeof v === 'object' && Array.isArray(v._pages));
  }

  function attach(reader: any): boolean {
    let done = false;
    for (const view of pdfViewsOf(reader)) {
      try { if (controller.attach(reader, view)) done = true; }
      catch (e) { deps.error(e); }
    }
    return done;
  }

  function inspect(reader: any): Record<string, unknown> {
    const internal = reader?._internalReader;
    const views = internal ? [internal._primaryView, internal._secondaryView].filter((v) => v && typeof v === 'object') : [];
    const view = views.find((v) => Array.isArray(v._pages)) ?? views[0];
    if (!view) return { kind: 'none', patched: false };
    if (!Array.isArray(view._pages)) return { kind: 'dom', patched: false };
    const ownership = controller.inspect(view);
    const patched = ownership.owned === true;
    let sentence: Record<string, unknown> | null = null;
    let part: Box | null = null;
    let viewport: Viewport | null = null;
    let covered: { top: number; bottom: number } | null = null;
    try {
      const state = waive(view._readAloudState);
      const position = waive(state?.activeSegment)?.sourcePosition ?? null;
      const m = position ? measure(reader, waive(view), waive(position)) : null;
      if (m) {
        viewport = m.viewport;
        covered = m.inset;
        part = m.part;
        // Against what a docked bar leaves uncovered, as the follow measures
        const seen: Viewport = { ...m.viewport, scrollTop: m.viewport.scrollTop + m.inset.top,
          clientHeight: m.viewport.clientHeight - m.inset.top - m.inset.bottom };
        sentence = {
          head: m.extent.head,
          whole: m.extent.whole,
          fits: m.extent.whole[3] - m.extent.whole[1] <= seen.clientHeight,
          cut: isOutside(m.extent.whole, seen, 0),
        };
      }
    } catch (e) {
      deps.error(e);
    }
    const last: LastDecision | undefined = view[LAST];
    return { kind: 'pdf', mode: autoScrollMode(deps.mode?.()), line: readingLine(deps.line?.()), patched, ...ownership, viewport, covered, sentence, part, last: last ? { ...last } : null };
  }

  return {
    attach,
    refresh: () => controller.refresh(),
    automatic: (reader: any) => controller.automatic(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView),
    manual: (reader: any) => controller.manual(reader),
    locate: (reader: any, automatic = false) => controller.locate(reader, automatic),
    inspect,
    patchCounts: () => controller.patchCounts(),
    dispose: () => controller.dispose(),
  };
}
