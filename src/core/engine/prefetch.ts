/**
 * Prefetch (issue #166, ADR 0013): the audio of the sentences after the
 * one that just started is fetched before the reading reaches them, for
 * every voice. How far ahead and how many requests at once are the pane's
 * two numbers (core/settings.ts `prefetchOf`), read at every start; without
 * them, Read Aloud's own three and two (`_prefetchFrom`, reader.js
 * 40258-40260).
 *
 * The order is Read Aloud's engine's: the next segment first, the rest by
 * how likely each is to arrive late — its estimated fetch time against the
 * time left until it plays, less 50 ms per segment of distance. Fetch time
 * is learned per character as the session goes (`FetchTimer`, reader.js
 * 40367-40375, 40391-40396).
 *
 * The runner is one per session, where Read Aloud's engine starts a
 * `keepFetching` per start (40302-40327): requests an earlier start sent
 * keep their slots, so the prefetch never has more requests open than the
 * setting. It asks in priority order, where Read Aloud's asked the second of
 * a pair first, which with more at once would put the next sentence last.
 * The sentence playback waits for is not the runner's: it is asked for at
 * once (session.ts), so for a moment after a skip one more can be open.
 */

import type { EngineSegment } from './types';

/** How far ahead, and how many requests at once. */
export interface PrefetchSettings {
  sentences: number;
  requests: number;
}

/** Read Aloud's own window and concurrency (reader.js 40259-40260): the Engine's when it is given no numbers. */
export const READ_ALOUD_PREFETCH: Readonly<PrefetchSettings> = { sentences: 3, requests: 2 };

const EST_PLAYBACK_CHARS_PER_SECOND = 16;
const EXP_MOVING_AVERAGE_ALPHA = 0.25;
const LATENCY_PADDING_MS = 250;
const DEFAULT_MS_PER_CHAR = 1.5;

const textLength = (segment: EngineSegment | undefined): number => (typeof segment?.text === 'string' ? segment.text.length : 0);

/** Seconds a segment will take to play at `speed` (reader.js 40386-40390). */
export function estimatePlaybackTime(segment: EngineSegment | undefined, speed: number): number {
  const secsAt1x = textLength(segment) / EST_PLAYBACK_CHARS_PER_SECOND;
  return Math.max(0.2, secsAt1x / speed);
}

/** An exponential moving average of fetch milliseconds per character, ignoring near-instant answers (cache hits). */
export class FetchTimer {
  perCharMs: number | null = null;

  record(segment: EngineSegment | undefined, elapsedMs: number): void {
    const length = textLength(segment);
    if (!length) return;
    const perChar = elapsedMs / length;
    if (this.perCharMs === null) {
      this.perCharMs = perChar;
    } else if (perChar > this.perCharMs * 0.1) {
      this.perCharMs = EXP_MOVING_AVERAGE_ALPHA * perChar + (1 - EXP_MOVING_AVERAGE_ALPHA) * this.perCharMs;
    }
  }

  /** Estimated milliseconds to fetch a segment (reader.js 40391-40396). */
  estimate(segment: EngineSegment | undefined): number {
    return LATENCY_PADDING_MS + (this.perCharMs ?? DEFAULT_MS_PER_CHAR) * textLength(segment);
  }
}

export interface PrefetchInput {
  segments: ArrayLike<EngineSegment>;
  /** The first index to fetch: one past the segment that just started. */
  startIndex: number;
  /** The segment playing: the last one that started, else the position. */
  playingIndex: number;
  /** Seconds left of the clip playing. */
  remaining: number;
  speed: number;
  /** `forwardStopIndex`, when the run has one. */
  forwardStopIndex: number | null;
  timer: FetchTimer;
  /** How many segments from `startIndex` on. */
  window: number;
}

/** The indices to fetch, in the order Read Aloud's engine takes them off its list. */
export function prefetchOrder(input: PrefetchInput): number[] {
  const { segments, startIndex, playingIndex, remaining, speed, timer } = input;
  const endIndex = Math.min(startIndex + Math.max(0, input.window), input.forwardStopIndex ?? segments.length);
  if (startIndex >= endIndex) return [];
  const prefixSums = [0];
  for (let i = playingIndex + 1; i < endIndex; i++) {
    prefixSums.push(prefixSums[prefixSums.length - 1] + estimatePlaybackTime(segments[i], speed));
  }
  const timeUntilStart = (i: number): number => {
    if (i <= playingIndex) return 0;
    const offset = i - (playingIndex + 1);
    const sumNext = offset >= 0 && offset < prefixSums.length ? prefixSums[offset] : 0;
    return (remaining + sumNext) * 1000;
  };
  const candidates: { index: number; score: number }[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const risk = timer.estimate(segments[i]) - timeUntilStart(i);
    let score = risk - (i - playingIndex) * 50;
    if (i === playingIndex + 1) score += 10_000;
    candidates.push({ index: i, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.index);
}

export interface PrefetchJob {
  /** One segment's audio; a failure is ignored, playback asks again when it gets there. */
  fetch(index: number): Promise<unknown>;
  /** Whether a segment still needs a request: not decoded, not on its way. */
  needed(index: number): boolean;
  /** Ends the run before its next request. */
  stopped(): boolean;
  /** How many requests may be open at once. */
  requests: number;
}

/**
 * One session's prefetch. `run` replaces what is left to ask for with a new
 * start's order; requests already open, whichever start sent them, hold
 * their slots until answered. `cancel` drops what is left (a skip, the end
 * of a run) without touching what is open.
 */
export class PrefetchRunner {
  private queue: number[] = [];
  private job: PrefetchJob | null = null;
  /** Requests sent and not answered yet. */
  open = 0;
  /** The most ever open at once, for the diagnostics. */
  peak = 0;

  run(order: readonly number[], job: PrefetchJob): void {
    this.queue = [...order];
    this.job = job;
    this.fill();
  }

  cancel(): void {
    this.queue = [];
    this.job = null;
  }

  private fill(): void {
    const job = this.job;
    if (!job) return;
    while (this.open < job.requests && this.queue.length) {
      if (job.stopped()) {
        this.cancel();
        return;
      }
      const index = this.queue.shift()!;
      if (!job.needed(index)) continue;
      this.open++;
      this.peak = Math.max(this.peak, this.open);
      let request: Promise<unknown>;
      try {
        request = job.fetch(index);
      } catch (e) {
        request = Promise.reject(e);
      }
      void request.then(this.answered, this.answered);
    }
  }

  private readonly answered = (): void => {
    this.open--;
    this.fill();
  };
}
