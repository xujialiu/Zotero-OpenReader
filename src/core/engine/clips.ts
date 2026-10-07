/**
 * One voice's clips for one run of segments: fetched, decoded and kept the
 * way Read Aloud's engine keeps them (`_getAudioData` / `_fetchAudio`,
 * reader.js 40329-40380) — up to 32 decoded clips and their word timings,
 * least recently used out first, and one fetch per segment however many
 * callers ask while it is on its way.
 *
 * Two of Read Aloud's faults are left behind here (issue #133). A clip that
 * arrives but will not decode fails as `unknown`, where Read Aloud's engine
 * set no error at all, so the reading stopped without a word and Retry did
 * nothing (40177-40184, issue #42). And a failure is the caller's to keep:
 * this store remembers none, so a segment whose prefetch failed is asked
 * for once more when playback reaches it (40359-40361).
 *
 * While a voice switch is pending, the old voice asks for nothing new
 * (issue #163): `held` answers only what it already has — a decoded clip,
 * a fetch on its way, or audio the interface holds (the plugin's cache, a
 * request of the same audio on its way) — through a lookup that never
 * reaches a provider, and `null` otherwise.
 */

import { RemainingTime } from './remaining-time';
import { LruMap } from './lru';
import { FetchTimer } from './prefetch';
import type { EngineClip, EngineClock, EngineSegment, EngineVoice, FetchResult, WordTiming } from './types';

/** Read Aloud keeps 32 decoded clips (reader.js 39901). */
export const CLIP_CACHE_CAPACITY = 32;

/** A fetch or decode that produced no clip; `code` is the error word the manager shows. */
export class ClipError extends Error {
  constructor(
    readonly code: string,
    readonly stage: 'fetch' | 'decode' | 'closed',
    readonly cause?: unknown,
  ) {
    super(`OpenReader: no audio (${stage}: ${code})`);
    this.name = 'ClipError';
  }
}

export interface ClipStoreDeps<Clip extends EngineClip> {
  segments: ArrayLike<EngineSegment>;
  voice: EngineVoice;
  clock: EngineClock;
  fetch(segment: EngineSegment, voice: EngineVoice, signal?: unknown): Promise<FetchResult>;
  decode(audio: unknown): Promise<Clip>;
  /** Audio that would not decode: whatever keeps the answer must drop it, so asking again reaches the provider. */
  discard?(segment: EngineSegment, voice: EngineVoice): void;
  /** Passed to every fetch: a handoff's preparation can be called off (handoff.ts). */
  signal?: unknown;
  /** The audio the interface already holds for a segment, never asking a provider; no audio when it holds none. */
  held?(segment: EngineSegment, voice: EngineVoice): Promise<FetchResult>;
}

export class ClipStore<Clip extends EngineClip> {
  readonly clips = new LruMap<number, Clip>(CLIP_CACHE_CAPACITY);
  readonly timings = new LruMap<number, ArrayLike<WordTiming>>(CLIP_CACHE_CAPACITY);
  readonly inflight = new Map<number, Promise<Clip>>();
  readonly timer = new FetchTimer();
  /** Fetches issued, for the diagnostics and the tests. */
  requests = 0;
  /** Lookups of held audio (`held`), which ask no provider: for the diagnostics and the tests. */
  lookups = 0;
  private readonly durations = new Map<number, number>();
  private timeModel: RemainingTime | null = null;
  get remainingTime(): RemainingTime {
    if (!this.timeModel) {
      this.timeModel = new RemainingTime(this.segments);
      for (const [index, duration] of this.durations) this.timeModel.record(index, duration);
    }
    return this.timeModel;
  }
  closed = false;

  constructor(readonly deps: ClipStoreDeps<Clip>) {}

  get voice(): EngineVoice {
    return this.deps.voice;
  }

  get segments(): ArrayLike<EngineSegment> {
    return this.deps.segments;
  }

  /** The clip of segment `index`: cached, on its way, or fetched now. */
  get(index: number): Promise<Clip> {
    const cached = this.clips.get(index);
    if (cached) return Promise.resolve(cached);
    const inflight = this.inflight.get(index);
    if (inflight) return inflight;
    const segment = this.deps.segments[index];
    const job = this.fetchAndDecode(index, segment).finally(() => this.inflight.delete(index));
    this.inflight.set(index, job);
    return job;
  }

  /**
   * The clip of segment `index` only if it needs no new request: decoded,
   * on its way, or held by the interface; `null` otherwise, and on any
   * failure — the caller then has another voice ask for it (issue #163).
   */
  held(index: number): Promise<Clip | null> {
    const cached = this.clips.get(index);
    if (cached) return Promise.resolve(cached);
    const inflight = this.inflight.get(index);
    if (inflight) return inflight.catch(() => null);
    const lookup = this.deps.held;
    if (!lookup || this.closed) return Promise.resolve(null);
    this.lookups++;
    const segment = this.deps.segments[index];
    return this.decodeInto(index, segment, () => lookup(segment, this.deps.voice), false).catch(() => null);
  }

  /** The clip of segment `index` if it is decoded and kept; refreshes it, as Read Aloud's `get` does. */
  cached(index: number): Clip | undefined {
    return this.clips.get(index);
  }

  /** The same sentences, rebuilt as new objects (session.ts `bind`, issue #163): the clips stay, by index. */
  rebase(segments: ArrayLike<EngineSegment>): void {
    this.deps.segments = segments;
    this.timeModel = null;
  }

  /**
   * A handoff's store, now the reading's (session.ts `swapVoice`): its
   * requests from here on are the reading's own, no longer a preparation's
   * that can be called off (issue #162).
   */
  dropSignal(): void {
    this.deps.signal = undefined;
  }

  /** Stop keeping anything; answers on their way are decoded no more. */
  close(): void {
    this.closed = true;
    this.clips.clear();
    this.timings.clear();
    this.inflight.clear();
    this.durations.clear();
    this.timeModel = null;
  }

  private fetchAndDecode(index: number, segment: EngineSegment): Promise<Clip> {
    this.requests++;
    return this.decodeInto(index, segment, () => this.deps.fetch(segment, this.deps.voice, this.deps.signal), true);
  }

  /** Get a segment's audio from `source`, decode it and keep it; `timed` feeds the fetch timer (a lookup is not a fetch). */
  private async decodeInto(index: number, segment: EngineSegment, source: () => Promise<FetchResult>, timed: boolean): Promise<Clip> {
    const started = this.deps.clock.now();
    let result: FetchResult;
    try {
      result = await source();
    } catch (e) {
      throw new ClipError('unknown', 'fetch', e);
    }
    if (this.closed) throw new ClipError('unknown', 'closed');
    if (!result?.audio) throw new ClipError(result?.error || 'unknown', 'fetch');
    if (timed) this.timer.record(segment, this.deps.clock.now() - started);
    let clip: Clip;
    try {
      clip = await this.deps.decode(result.audio);
    } catch (e) {
      // Retry must not be answered with the same bytes again
      try {
        this.deps.discard?.(segment, this.deps.voice);
      } catch {
        // The error below is what matters
      }
      throw new ClipError('unknown', 'decode', e);
    }
    if (this.closed) throw new ClipError('unknown', 'closed');
    this.clips.set(index, clip);
    this.durations.set(index, clip.duration);
    this.timeModel?.record(index, clip.duration);
    if (result.timestamps) this.timings.set(index, result.timestamps);
    return clip;
  }
}
