/**
 * One reader tab's reading, played by the Engine (issue #133, ADR 0005).
 *
 * Read Aloud's manager asks the selected voice for a controller and talks
 * only to what comes back (reader.js 82653-82718). The Engine answers every
 * such request of a tab with a controller bound to this session, so the
 * session outlives the manager's rebuilds: a voice list that lands on the
 * voice already playing, or a handoff's switch, rebuilds the controller
 * (#75, #95) and the sentence carries on. A rebuild the manager was told to
 * make somewhere — a jump, new segments, another voice — starts afresh, as
 * a new controller of Read Aloud's does; only a jump, or the same sentences
 * rebuilt, while a voice switch is pending moves the run instead, keeping
 * the switch (issue #163). Zotero's restart from a selection is the latter:
 * `clearSegments` ends the session, and the same sentences come back as new
 * objects a microtask later (reader.js 83880-83885, 84048-84073), so an end
 * the manager's teardown causes parks a pending switch for that bind.
 *
 * Everything else is Read Aloud's engine, `RemoteReadAloudController` and
 * its bases (reader.js 39296-39512, 39906-40403), line for line where the
 * manager can tell the difference: the order and timing of every event, the
 * position after each, what a skip, a pause, the end of the document or an
 * error does. The departures settled on 2026-09-23:
 *
 * - The word comes from the audio clock (words.ts), not from a timer per
 *   word armed at the start.
 * - A paused offset is used only by the resume of that pause. Read Aloud's
 *   engine never resets `_indexAtPause` or its offset (40147, 40163-40166,
 *   39318), so a later return to a sentence once paused on starts midway,
 *   or past its end and so not at all.
 * - A failed prefetch is asked for once more when playback reaches it;
 *   only the fetch playback waits on can fail the segment (clips.ts).
 * - A clip that will not decode fails as `unknown`, so the error shows and
 *   Retry works (clips.ts, issue #42).
 * - The 600 ms skip debounce dies with the session (40222 against
 *   40397-40402): a skip, then Stop, no longer fetches and bills the target.
 * - The output is asked to run on Play (39931-39962): a reading started
 *   without a click or key press in the reader no longer plays silently.
 *
 * And what the plugin adds: the pause between sentences of the pane's
 * settings (gap.ts, issues #44 and #142), the prefetch's reach and requests
 * at once of the pane's settings, one runner per session (prefetch.ts,
 * issue #166), the "Preparing…" notice after 300 ms of
 * waiting for audio (issue #120), and the voice switch (handoff.ts): while
 * one is pending, the old voice reads only the audio it already has, asks
 * for nothing new and reads nothing ahead, and the reading waits for the
 * new voice at the first sentence the old one has no audio for (issue #163).
 */

import { ClipError, ClipStore } from './clips';
import { gapBefore, type PauseSettings } from './gap';
import { Handoff, type HandoffOptions } from './handoff';
import { prefetchOrder, PrefetchRunner, READ_ALOUD_PREFETCH, type PrefetchSettings } from './prefetch';
import { RemainingTimeDisplay } from './remaining-time';
import { skipAheadTarget, skipBackTarget } from './skip';
import type {
  EngineAudio,
  EngineClip,
  EngineClock,
  EngineEventType,
  EngineSegment,
  EngineVoice,
  FetchResult,
  PlayingSource,
  WordTiming,
} from './types';
import { untilNextWord, wordAt, wordAtPosition } from './words';

/** Read Aloud's wait after a skip before the target is fetched (reader.js 39904). */
export const SKIP_DEBOUNCE_MS = 600;
/** How long a device-change probe waits for the clock to move (reader.js 39905). */
export const STALL_PROBE_MS = 400;
/** How long playback waits for audio before "Preparing…" shows (issue #120). */
export const PREPARING_AFTER_MS = 300;
/** Retry a just-early boundary without adding another 15 ms (issue #144). */
export const WORD_TICK_MIN_MS = 1;
/** A frozen audio clock backs off to the previous polling floor. */
const WORD_TICK_STALLED_MS = 15;

export interface RemainingSnapshot {
  status: 'ready' | 'estimating' | 'unavailable' | 'finished';
  scope: 'document' | 'selection';
  seconds: number | null;
  sectionSeconds?: number;
  sectionTitle?: string;
}

export type PlaybackNotice = 'idle' | 'preparing' | 'failed';

export interface SessionDeps<Clip extends EngineClip> {
  clock: EngineClock;
  audio: EngineAudio<Clip>;
  fetch(segment: EngineSegment, voice: EngineVoice, signal?: unknown): Promise<FetchResult>;
  /** The audio the interface already holds for a segment, never asking a provider (clips.ts `held`). */
  held?(segment: EngineSegment, voice: EngineVoice): Promise<FetchResult>;
  /** A fetched answer whose audio would not decode: drop it wherever it is kept (clips.ts). */
  discard?(segment: EngineSegment, voice: EngineVoice): void;
  /** The pane's pause settings, read at every sentence boundary. */
  pauses(): PauseSettings;
  /** The pane's prefetch numbers, read at every start (issue #166); absent, Read Aloud's own (prefetch.ts). */
  prefetch?(): PrefetchSettings;
  /** The events Read Aloud's manager listens for. */
  emit(type: EngineEventType, segment: EngineSegment | null): void;
  /** The playback notice: "Preparing…" while audio is late, "failed" on an error, idle otherwise. */
  notice?(kind: PlaybackNotice): void;
  /** A failure worth a line in the error console: why a segment has no audio. */
  log?(e: unknown): void;
  debug?(message: string): void;
}

/** What the manager asked for when it built a controller (`getController`, reader.js 82664). */
export interface BindRequest {
  voice: EngineVoice;
  segments: ArrayLike<EngineSegment>;
  backwardStopIndex: number | null;
  forwardStopIndex: number | null;
  /** The manager was told where to start (`repositionTo`): never a carry-on. */
  jump?: boolean;
}

/** Where a pause left a clip: the only resume that may use it (a departure, see above). */
interface ResumePoint {
  index: number;
  offset: number;
  at: number;
}

export class EngineSession<Clip extends EngineClip = EngineClip> {
  // The run
  voice: EngineVoice | null = null;
  segments: ArrayLike<EngineSegment> | null = null;
  store: ClipStore<Clip> | null = null;
  position = 0;
  completed = false;
  private readonly documentTime = new RemainingTimeDisplay();
  private readonly sectionTime = new RemainingTimeDisplay();
  private timeScope: string | null = null;
  private timeSection: number | null = null;
  private listened = 0;
  private completedScope: 'document' | 'selection' = 'document';
  backwardStopIndex: number | null = null;
  forwardStopIndex: number | null = null;

  // ReadAloudController (reader.js 39298-39312)
  paused = false;
  speed = 1;
  error: string | null = null;
  buffering = false;
  lastSkipGranularity: string | null = null;
  activeTimestampIndex: number | null = null;
  private gapTimer: unknown = null;
  private skipTimer: unknown = null;

  // RemoteReadAloudControllerBase (reader.js 39907-39930)
  private source: PlayingSource | null = null;
  clip: Clip | null = null;
  isPlaying = false;
  private startedAt = 0;
  private playbackOffset = 0;
  private playbackRate = 1;
  timings: ArrayLike<WordTiming> | null = null;
  /** A voice being prepared to take the reading over (handoff.ts). */
  handoff: Handoff<Clip> | null = null;
  private wordTimer: unknown = null;
  private lastWord: number | null = null;
  private lastWordElapsed: number | null = null;
  private wordRetryMs = WORD_TICK_MIN_MS;
  /** Mechanism evidence for issue #144; counts last for the reading session. */
  readonly wordClock = { ticks: 0, shortWaits: 0, backoffs: 0, lastWaitMs: 0 };

  // RemoteReadAloudController (reader.js 40146-40154)
  currentIndex: number | null = null;
  private resumePoint: ResumePoint | null = null;
  private readonly failed = new Set<number>();

  /** Bumped at every fresh start and at the end: an answer for an older run is dropped. */
  private generation = 0;
  /** The prefetch: one per session, so requests an earlier start sent keep their slots (prefetch.ts). */
  private readonly prefetcher = new PrefetchRunner();
  /** The last start's prefetch, for the diagnostics (issue #166). */
  private lastPrefetch: { from: number; sentences: number; requests: number; order: number[] } | null = null;
  /** No controller holds the session: the manager destroyed the last one and asked for no other. */
  ended = true;
  /** Set by a carry-on bind: the manager's first `paused` write only restates what plays. */
  private carriedOn = false;
  /** The sentence the reading waits at for a pending switch's new voice, which the old one has no audio for (issue #163). */
  private awaitingHandoff: number | null = null;
  /** A skip or a jump landed, and the sentence there has not started since. */
  private landed = false;
  /** A pending switch and the old voice's clips, kept over an end for a bind of the same sentences (issue #163). */
  private parked: { handoff: Handoff<Clip>; store: ClipStore<Clip> } | null = null;

  /** The last pause between sentences waited, and how many: what proves the pane's settings reached the gap (issue #44). */
  lastGap: { ms: number; paragraph: boolean; speed: number; at: number } | null = null;
  gaps = 0;
  /** The playback notice's counts (issue #120): waits begun, "Preparing…" shown, waits ended by a source starting, failures shown. */
  readonly noticeCounts = { waits: 0, shown: 0, starts: 0, failed: 0 };

  // The playback notice (issue #120)
  private waiting = false;
  private preparingShown = false;
  private failedShown = false;
  private noticeTimer: unknown = null;

  constructor(private readonly deps: SessionDeps<Clip>) {}

  // ---- Binding ------------------------------------------------------------

  /**
   * A controller was asked for: carry on when it is the same voice over the
   * same segments and nobody said where to start, else start afresh where
   * the manager says. Answers which it did.
   */
  bind(request: BindRequest): 'carried-on' | 'started' {
    const sameVoice = this.voice !== null && this.voice.id === request.voice.id;
    if (!this.ended && sameVoice && this.segments === request.segments && !request.jump) {
      // A carry-on keeps the run's own start for the end-of-document rewind
      this.voice = request.voice;
      this.carriedOn = true;
      return 'carried-on';
    }
    const kept = this.keptSwitch(request, sameVoice);
    if (kept) {
      // A jump, or the same sentences rebuilt, keeps a pending switch and what the old voice has (issue #163)
      this.store = kept.store;
      this.handoff = kept.handoff;
      if (request.segments !== this.segments) {
        kept.store.rebase(request.segments);
        kept.handoff.rebase(request.segments);
      }
      this.reset(request);
      kept.handoff.moved();
      return 'started';
    }
    this.start(request);
    return 'started';
  }

  /** The pending switch a bind keeps: the live one, or the one an end parked, when the voice and the sentences' texts are the same. */
  private keptSwitch(request: BindRequest, sameVoice: boolean): { handoff: Handoff<Clip>; store: ClipStore<Clip> } | null {
    const parked = this.parked;
    this.parked = null;
    const live = !this.ended && this.handoff?.pending && this.store ? { handoff: this.handoff, store: this.store } : null;
    const candidate = live ?? (parked?.handoff.pending ? parked : null);
    if (candidate && sameVoice && sameTexts(this.segments, request.segments)) return candidate;
    if (parked) {
      parked.handoff.cancel();
      parked.store.close();
    }
    return null;
  }

  private start(request: BindRequest): void {
    this.awaitingHandoff = null;
    this.handoff?.cancel();
    this.store?.close();
    this.store = new ClipStore<Clip>({
      segments: request.segments,
      voice: request.voice,
      clock: this.deps.clock,
      fetch: this.deps.fetch,
      held: this.deps.held,
      decode: (audio) => this.deps.audio.decode(audio),
      discard: this.deps.discard,
    });
    this.reset(request);
  }

  /** A new run where the manager says, over the store in place. */
  private reset(request: BindRequest): void {
    this.awaitingHandoff = null;
    this.landed = false;
    this.generation++;
    this.prefetcher.cancel();
    this.clearGap();
    this.cancelSkip();
    this.stopSource();
    this.resetRemainingTime();
    this.listened = 0;
    this.settleNotice();
    this.voice = request.voice;
    this.segments = request.segments;
    // A new controller of Read Aloud's (reader.js 39396-39404)
    this.position = request.backwardStopIndex ?? 0;
    this.backwardStopIndex = request.backwardStopIndex;
    this.forwardStopIndex = request.forwardStopIndex;
    this.completedScope = 'document';
    this.completed = false;
    this.paused = false;
    this.error = null;
    this.buffering = false;
    this.lastSkipGranularity = null;
    this.activeTimestampIndex = null;
    this.clip = null;
    this.isPlaying = false;
    this.playbackOffset = 0;
    this.playbackRate = 1;
    this.timings = null;
    this.currentIndex = null;
    this.resumePoint = null;
    this.failed.clear();
    this.carriedOn = false;
    this.ended = false;
  }

  /**
   * The manager destroyed its controller and asked for no other: stop
   * everything, fetch nothing more. With `park`, a pending switch and the
   * old voice's clips are kept for a bind of the same sentences that may
   * follow at once (Zotero's restart from a selection, issue #163); one no
   * bind takes back is called off at its next look.
   */
  end(options: { park?: boolean } = {}): void {
    this.awaitingHandoff = null;
    this.dropParked();
    if (options.park && this.handoff?.pending && this.store) {
      this.parked = { handoff: this.handoff, store: this.store };
      this.handoff = null;
      this.store = null;
    }
    this.handoff?.cancel();
    this.generation++;
    this.prefetcher.cancel();
    this.ended = true;
    this.carriedOn = false;
    this.clearGap();
    this.cancelSkip();
    this.stopSource();
    this.store?.close();
    this.store = null;
    this.setBufferingQuietly(false);
    this.settleNotice();
  }

  // ---- The controller's members ---------------------------------------------

  /** `paused = …` (reader.js 39316-39323). */
  setPaused(paused: boolean): void {
    if (this.carriedOn) {
      this.carriedOn = false;
      if (paused === this.paused) return;
    }
    if (this.ended) return;
    if (paused) {
      const now = this.deps.clock.now();
      if (this.isPlaying && this.clip && this.currentIndex !== null) {
        this.resumePoint = { index: this.currentIndex, offset: this.currentPlaybackTime(), at: now };
      } else if (this.resumePoint) {
        // Every pause restarts Read Aloud's pause clock, a repeated one too (`_pausedAt`, reader.js 39317-39319)
        this.resumePoint.at = now;
      }
    }
    this.paused = paused;
    if (!paused && this.completed) this.resetRemainingTime();
    if (!paused) this.completed = false;
    this.clearGap();
    this.speak();
  }

  /** `speed = …` (reader.js 39327-39330, 40051-40058): a clip playing is re-stretched where it is. */
  setSpeed(speed: number): void {
    this.handoff?.cancel();
    if (speed !== this.speed) this.resetRemainingTime();
    this.speed = speed;
    if (this.ended) return;
    if (this.isPlaying && this.clip) {
      const offset = this.currentPlaybackTime();
      const timings = this.timings;
      this.stopSource();
      this.playClip(this.clip, offset, this.speed, timings);
    }
  }

  skipBack(granularity: string = 'paragraph', accelerate = false): void {
    if (this.ended || !this.segments) return;
    this.lastSkipGranularity = granularity;
    this.skipTo(skipBackTarget(this.segments, this.position, granularity, accelerate));
  }

  skipAhead(granularity: string = 'paragraph', accelerate = false): void {
    if (this.ended || !this.segments) return;
    this.lastSkipGranularity = granularity;
    this.skipTo(skipAheadTarget(this.segments, this.position, granularity, accelerate));
  }

  /** `retry()` (reader.js 40247-40257): only a segment that failed is asked for again. */
  retry(): void {
    if (this.ended) return;
    const index = this.position;
    if (!this.failed.has(index)) return;
    this.failed.delete(index);
    this.error = null;
    this.deps.emit('ErrorCleared', this.currentSegment);
    this.paused = false;
    this.speak();
  }

  /** The word timings of a segment's clip, if it has any (reader.js 40381-40385). */
  getTimestampsForSegment(segment: unknown): ArrayLike<WordTiming> | null {
    const index = this.indexOf(segment);
    if (index < 0 || !this.store) return null;
    return this.store.timings.get(index) ?? null;
  }

  /** The segment an annotation made now belongs to: the previous one while under half and under 3 s into this one (reader.js 39386-39395). */
  getSegmentToAnnotate(): EngineSegment | null {
    if (!this.segments) return null;
    const seconds = this.currentPlaybackTime();
    const fraction = this.clip ? seconds / this.clip.duration : 0;
    if (fraction < 0.5 && seconds < 3) {
      const previous = this.position - 1;
      if (previous >= 0) return this.segments[previous];
    }
    return this.currentSegment;
  }

  /** The word playing now, at once, when the highlight switches to Word (reader.js 40122-40137). */
  syncActiveWordToPlayback(): void {
    const timings = this.timings;
    if (!timings?.length || !this.isPlaying) return;
    const index = wordAtPosition(timings, this.heardPosition());
    if (index === null || this.activeTimestampIndex === index) return;
    this.activeTimestampIndex = index;
    this.lastWord = index;
    this.deps.emit('ActiveWordChange', this.currentSegment);
  }

  /**
   * After a carry-on the manager has dropped the word it highlighted
   * (`_destroyController`, reader.js 82726): say it again, once the new
   * controller's listeners are in place.
   */
  restateWord(): void {
    if (this.ended || this.activeTimestampIndex === null || !this.isPlaying) return;
    this.deps.emit('ActiveWordChange', this.currentSegment);
  }

  get currentSegment(): EngineSegment | null {
    return this.segments?.[this.position] ?? null;
  }

  // ---- The handoff ----------------------------------------------------------

  /** Prepare `options.target` to take the reading over (handoff.ts); a switch already pending is called off. */
  prepareHandoff(options: HandoffOptions): Handoff<Clip> | null {
    if (this.ended || !this.voice || !this.segments) return null;
    this.handoff?.cancel();
    const handoff = new Handoff<Clip>(this, this.deps, options);
    this.handoff = handoff;
    handoff.begin();
    return handoff;
  }

  /**
   * The handoff's new voice takes the reading: its clips become the
   * session's, and segment `index` plays from `offset` of the new voice's
   * clip — now, or on Play when paused — through the same start as any
   * other segment, so the manager hears what a new controller of Read
   * Aloud's would tell it.
   */
  takeOver(voice: EngineVoice, store: ClipStore<Clip>, index: number, offset: number): void {
    this.swapVoice(voice, store);
    this.stopSource();
    this.resumePoint = { index, offset, at: this.deps.clock.now() };
    if (!this.paused) this.speakInternal();
  }

  /**
   * A pending switch failed or was called off while the reading waited for
   * its new voice (issue #163): the old voice asks for that sentence, as
   * before the switch. One task later, so a deactivate or new segments that
   * called it off can end the run first and nothing is asked for a reading
   * that is gone.
   */
  handoffEnded(): void {
    const index = this.awaitingHandoff;
    if (index === null) return;
    this.deps.clock.setTimeout(() => {
      if (this.awaitingHandoff !== index || this.ended || this.paused || this.position !== index) return;
      this.speakInternal();
    }, 0);
  }

  /** A skip or a jump landed on the sentence at the position, which has not started since: its start is a fresh one. */
  get landing(): boolean {
    return this.landed;
  }

  private dropParked(): void {
    const parked = this.parked;
    this.parked = null;
    if (!parked) return;
    parked.handoff.cancel();
    parked.store.close();
  }

  private swapVoice(voice: EngineVoice, store: ClipStore<Clip>): void {
    this.resetRemainingTime();
    const old = this.store;
    this.voice = voice;
    this.store = store;
    // Its requests are the reading's own from now on, not a preparation's (issue #162)
    store.dropSignal();
    if (old && old !== store) old.close();
    // A new controller of Read Aloud's knows no failures of the old voice
    this.failed.clear();
  }

  /** The source playing now, which a handoff's cut is armed on. */
  get playingSource(): PlayingSource | null {
    return this.source;
  }

  /** Where the clip playing started on the audio clock, from where in it, at what rate (reader.js 39913-39922). */
  get clipStartedAt(): number {
    return this.startedAt;
  }

  get clipOffset(): number {
    return this.playbackOffset;
  }

  get clipRate(): number {
    return this.playbackRate;
  }

  /** Stop the clip playing at context time `when` and call `onCut` then, instead of its end; answers the source armed, or null. */
  cutAt(when: number, onCut: () => void): PlayingSource | null {
    const source = this.source;
    if (!source || !this.isPlaying) return null;
    source.stopAt(when, () => {
      if (this.source === source) onCut();
    });
    return source;
  }

  /** Take a cut back: the clip plays to its end, reported as ever. */
  uncut(armed: unknown): void {
    if (!this.source || armed !== this.source || !this.clip) return;
    const remaining = Math.max(0, this.clip.duration - this.currentPlaybackTime()) / this.playbackRate;
    this.source.restoreEnd(this.deps.audio.now() + remaining + 1);
  }

  /** Play the current clip on from `offset`: a cut whose switch was called off at the last moment. */
  continueFrom(offset: number): void {
    if (this.ended || this.paused || !this.clip) return;
    this.playClip(this.clip, offset, this.speed, this.timings);
  }

  // ---- Speaking -------------------------------------------------------------

  private speak(cause?: 'skip'): void {
    if (cause === 'skip') {
      // Read Aloud's lodash debounce: the target is fetched 600 ms after the last skip
      this.cancelSkip();
      this.skipTimer = this.deps.clock.setTimeout(() => {
        this.skipTimer = null;
        this.speakInternal();
      }, SKIP_DEBOUNCE_MS);
      return;
    }
    this.speakInternal();
  }

  /** `_speakInternal` (reader.js 40162-40221). */
  private speakInternal(): void {
    this.awaitingHandoff = null;
    if (this.ended || !this.segments || !this.store) return;
    if (this.paused) {
      this.stop();
      this.settleNotice();
      return;
    }
    const index = this.position;
    const segment = this.segments[index];
    if (!segment) return;
    // A voice being prepared takes the next sentence it has audio for
    if (this.handoff?.sentenceStart(index)) return;
    const generation = this.generation;
    const store = this.store;
    const handoff = this.handoff;
    const handleError = (): void => {
      if (generation !== this.generation || this.position !== index) return;
      this.setBuffering(false);
      this.segmentStart(segment, index);
      this.deps.emit('Error', segment);
      this.showFailed();
    };
    if (!handoff && this.failed.has(index)) {
      handleError();
      return;
    }
    // A context made without user activation starts suspended; Read Aloud's never resumed it
    if (!this.deps.audio.running()) this.deps.audio.resume();
    this.setBuffering(true);
    this.waitForAudio();
    const start = (clip: Clip): void => {
      this.setBuffering(false);
      if (this.ended || this.paused) return;
      this.currentIndex = index;
      this.landed = false;
      this.segmentStart(segment, index);
      const offset = this.resumeOffset(index, clip);
      try {
        this.playClip(clip, offset, this.speed, store.timings.get(index) ?? null);
      } catch (e) {
        this.deps.log?.(e);
        this.failPlayback(index, 'unknown');
        handleError();
        return;
      }
      this.prefetchFrom(index + 1);
    };
    if (handoff) {
      // A switch is pending: the old voice reads only the audio it already has (issue #163)
      void store.held(index).then((clip) => {
        if (generation !== this.generation || this.position !== index || this.store !== store) return;
        if (clip) {
          start(clip);
          return;
        }
        if (this.ended || this.paused) {
          this.setBuffering(false);
          return;
        }
        if (this.handoff === handoff) {
          // It has none: the reading waits here for the new voice
          this.awaitingHandoff = index;
          handoff.waitAt(index);
          return;
        }
        // The switch ended while this looked: the old voice asks for it, as before the switch
        this.speakInternal();
      });
      return;
    }
    store.get(index).then(
      (clip) => {
        if (generation !== this.generation || this.position !== index) return;
        start(clip);
      },
      (e: unknown) => {
        if (generation !== this.generation || this.position !== index) return;
        if (!(e instanceof ClipError && e.stage === 'closed')) this.deps.log?.(e);
        this.failPlayback(index, e instanceof ClipError ? e.code : 'unknown');
        handleError();
      },
    );
  }

  /** Where a clip starts: 0, or the pause this start resumes (reader.js 40200-40216). */
  private resumeOffset(index: number, clip: Clip): number {
    const resume = this.resumePoint;
    this.resumePoint = null;
    if (!resume || resume.index !== index) return 0;
    const pausedFor = (this.deps.clock.now() - resume.at) / 1000;
    // Short pause (under 5 seconds): resume from exact position
    if (pausedFor < 5) return resume.offset;
    // Medium pause (5-20 seconds): jump back one word boundary; long (20+): two
    if (this.voice?.lang.startsWith('en')) {
      return this.deps.audio.wordOnset(clip, resume.offset, pausedFor >= 20 ? 2 : 1);
    }
    return resume.offset;
  }

  private failPlayback(index: number, code: string): void {
    this.error = code;
    this.failed.add(index);
  }

  /** `_handleSegmentStart` (reader.js 39480-39483). */
  private segmentStart(segment: EngineSegment, index: number): void {
    this.position = index;
    this.deps.emit('ActiveSegmentChange', segment);
  }

  /** `_handleSegmentEnd` (reader.js 39484-39511). */
  private segmentEnd(segment: EngineSegment, index: number): void {
    if (this.paused || !this.segments) return;
    this.lastSkipGranularity = null;
    this.deps.emit('ActiveSegmentChanging', null);
    this.deps.emit('ActiveSegmentChange', null);
    if (this.position !== index) return;
    const last = this.segments.length - 1;
    if (this.forwardStopIndex !== null && this.position === this.forwardStopIndex - 1) {
      this.position = Math.min(this.position + 1, last);
      this.forwardStopIndex = null;
      this.deps.emit('ActiveSegmentChanging', this.currentSegment);
      this.deps.emit('ActiveSegmentChange', this.currentSegment);
      this.completedScope = 'selection';
      this.completed = true;
      this.deps.emit('Complete', null);
    } else if (this.position === last) {
      this.position = this.backwardStopIndex ?? 0;
      this.completedScope = 'document';
      this.completed = true;
      this.deps.emit('Complete', null);
    } else {
      this.position++;
      let gap: number;
      try {
        gap = gapBefore(this.currentSegment, this.speed, this.deps.pauses());
      } catch (e) {
        // A broken setting must not stall the reading: the voice's own delay, as Read Aloud waits
        this.deps.log?.(e);
        gap = Math.max(0, this.voice?.sentenceDelay ?? 0) + (this.currentSegment?.anchor === 'paragraphStart' ? 200 : 0);
      }
      this.lastGap = { ms: gap, paragraph: this.currentSegment?.anchor === 'paragraphStart', speed: this.speed, at: this.deps.clock.now() };
      this.gaps++;
      this.scheduleSpeak(gap);
    }
  }

  private scheduleSpeak(delay: number): void {
    this.settleNotice();
    this.gapTimer = this.deps.clock.setTimeout(() => {
      this.listened += this.gapListening();
      this.gapTimer = null;
      this.speak();
    }, delay);
  }

  /** `_skipTo` (reader.js 39460-39469). */
  private skipTo(position: number): void {
    this.resetRemainingTime();
    this.clearGap();
    this.position = position;
    this.awaitingHandoff = null;
    this.landed = true;
    // Nothing more is asked for the place it left; what is on its way finishes (issue #166)
    this.prefetcher.cancel();
    // A pending switch goes on from where the skip lands (issue #163)
    this.handoff?.moved();
    this.completed = false;
    this.stop();
    this.deps.emit('ActiveSegmentChanging', this.currentSegment);
    if (!this.paused) this.waitForAudio();
    this.speak('skip');
    if (this.paused) this.deps.emit('ActiveSegmentChange', this.currentSegment);
  }

  /**
   * Fetch ahead after a clip starts (reader.js 40258-40328): as far, and
   * with as many requests at once, as the pane says at this start (issue
   * #166).
   */
  private prefetchFrom(startIndex: number): void {
    const store = this.store;
    const segments = this.segments;
    // While a switch is pending the old voice asks for nothing ahead (issue #163)
    if (!store || !segments || this.handoff) return;
    const generation = this.generation;
    const { sentences, requests } = this.prefetchSettings();
    const order = prefetchOrder({
      segments,
      startIndex,
      playingIndex: this.currentIndex ?? this.position,
      remaining: Math.max(0, (this.clip?.duration ?? 0) - this.currentPlaybackTime()),
      speed: this.speed,
      forwardStopIndex: this.forwardStopIndex,
      timer: store.timer,
      window: sentences,
    });
    this.lastPrefetch = { from: startIndex, sentences, requests, order };
    this.prefetcher.run(order, {
      fetch: (index) => store.get(index),
      needed: (index) => !store.clips.has(index) && !store.inflight.has(index),
      stopped: () => generation !== this.generation || store.closed || this.handoff !== null,
      requests,
    });
  }

  /** The last start's numbers and targets, and the prefetch requests open now and at most (issue #166). */
  get prefetchReport(): { from: number; sentences: number; requests: number; order: number[]; open: number; peak: number } | null {
    const last = this.lastPrefetch;
    return last ? { ...last, order: [...last.order], open: this.prefetcher.open, peak: this.prefetcher.peak } : null;
  }

  private prefetchSettings(): PrefetchSettings {
    try {
      return this.deps.prefetch?.() ?? READ_ALOUD_PREFETCH;
    } catch (e) {
      // A broken setting must not stop the reading: Read Aloud's own numbers
      this.deps.log?.(e);
      return READ_ALOUD_PREFETCH;
    }
  }

  // ---- Playing a clip -------------------------------------------------------

  /** `_playAudioBuffer` (reader.js 40019-40050). */
  private playClip(clip: Clip, offset: number, rate: number, timings: ArrayLike<WordTiming> | null): void {
    this.stopSource();
    this.clip = clip;
    this.playbackOffset = offset;
    this.playbackRate = rate;
    this.timings = timings;
    let source: PlayingSource | null = null;
    const started = this.deps.audio.start(clip, offset, rate, () => {
      if (this.source !== source) return;
      this.listened += this.sourceListening();
      this.isPlaying = false;
      this.clearWordClock();
      const segment = this.currentSegment;
      if (segment) this.segmentEnd(segment, this.position);
    });
    source = started.source;
    this.source = source;
    this.startedAt = started.startedAt;
    this.isPlaying = true;
    this.outputStarted();
    if (timings?.length) this.startWordClock();
  }

  /** `_stop` (reader.js 40059-40064). */
  private stop(): void {
    const offset = this.currentPlaybackTime();
    this.stopSource();
    this.playbackOffset = offset;
  }

  /** `_stopSource` (reader.js 40065-40078). */
  private stopSource(): void {
    this.listened += this.sourceListening();
    if (this.source) {
      const source = this.source;
      this.source = null;
      try {
        source.stop();
      } catch (e) {
        this.deps.log?.(e);
      }
    }
    this.isPlaying = false;
    this.clearWordClock();
  }

  /**
   * Where playback is in the unstretched clip, by the audio clock
   * (`_currentPlaybackTime`, reader.js 39998-40004): the stretched clip plays
   * at 1×, so the time since its start times the rate.
   */
  currentPlaybackTime(): number {
    if (!this.isPlaying || !this.clip) return this.playbackOffset;
    const elapsed = (this.deps.audio.now() - this.startedAt) * this.playbackRate;
    return Math.min(this.playbackOffset + elapsed, this.clip.duration);
  }

  /** What the listener hears now: the same, less the output latency. */
  private heardPosition(): number {
    if (!this.isPlaying || !this.clip) return this.playbackOffset;
    return this.playbackOffset + this.heardElapsed();
  }

  /** Seconds of unstretched audio heard since the clip started; negative before its first sound arrives. */
  private heardElapsed(): number {
    return (this.deps.audio.now() - this.startedAt - this.deps.audio.latency()) * this.playbackRate;
  }

  // ---- The word, off the audio clock ---------------------------------------

  private startWordClock(): void {
    this.lastWord = null;
    this.clearWordClock();
    this.lastWordElapsed = null;
    this.wordRetryMs = WORD_TICK_MIN_MS;
    // Read Aloud's first word timers fire from a setTimeout too (reader.js 40094)
    this.wordTimer = this.deps.clock.setTimeout(() => this.wordTick(), 0);
  }

  private wordTick(): void {
    this.wordTimer = null;
    const timings = this.timings;
    if (this.ended || !this.isPlaying || !timings?.length) return;
    const elapsed = this.heardElapsed();
    this.wordClock.ticks++;
    // Quantization can repeat a read even while sound plays. Back off
    // gradually, and reset as soon as audio time advances; never spin on
    // a suspended output just before a boundary.
    this.wordRetryMs = elapsed === this.lastWordElapsed
      ? Math.min(WORD_TICK_STALLED_MS, this.wordRetryMs * 2)
      : WORD_TICK_MIN_MS;
    this.lastWordElapsed = elapsed;
    const index = wordAt(timings, this.playbackOffset, elapsed);
    if (index !== null && index !== this.lastWord) {
      this.lastWord = index;
      this.activeTimestampIndex = index;
      this.deps.emit('ActiveWordChange', this.currentSegment);
    }
    const next = untilNextWord(timings, this.playbackOffset, elapsed);
    if (next === null) return;
    const ms = Math.max(this.wordRetryMs, (next / this.playbackRate) * 1000);
    if (ms < WORD_TICK_STALLED_MS) this.wordClock.shortWaits++;
    if (this.wordRetryMs > WORD_TICK_MIN_MS) this.wordClock.backoffs++;
    this.wordClock.lastWaitMs = ms;
    this.wordTimer = this.deps.clock.setTimeout(() => this.wordTick(), ms);
  }

  private clearWordClock(): void {
    if (this.wordTimer !== null) {
      this.deps.clock.clearTimeout(this.wordTimer);
      this.wordTimer = null;
    }
  }

  // ---- The output device ----------------------------------------------------

  /**
   * An audio device came or went. Gecko on Windows leaves a context on a
   * removed output silent: if the clock has not moved 400 ms later, the
   * output is rebuilt and the clip replays from where it stopped
   * (reader.js 39964-39993).
   */
  deviceChanged(): void {
    if (this.ended || !this.isPlaying || !this.clip) return;
    const source = this.source;
    const sampled = this.deps.audio.now();
    this.deps.clock.setTimeout(() => {
      if (this.ended || this.source !== source || !this.isPlaying || !this.clip) return;
      if (this.deps.audio.now() > sampled) return;
      const clip = this.clip;
      const offset = this.currentPlaybackTime();
      const rate = this.playbackRate;
      const timings = this.timings;
      this.stopSource();
      this.deps.audio.rebuild();
      this.playClip(clip, offset, rate, timings);
    }, STALL_PROBE_MS);
  }

  /** The output started or stopped running: a source already started is now heard. */
  outputChanged(): void {
    if (this.isPlaying && this.waiting) this.outputStarted();
  }

  // ---- Buffering and the notice ---------------------------------------------

  private setBuffering(buffering: boolean): void {
    if (this.buffering === buffering) return;
    this.buffering = buffering;
    this.deps.emit('BufferingChange', this.currentSegment);
  }

  private setBufferingQuietly(buffering: boolean): void {
    this.buffering = buffering;
  }

  /** Playback wants audio it does not have yet: "Preparing…" if that lasts 300 ms. */
  private waitForAudio(): void {
    if (this.paused || this.waiting) return;
    if (this.failedShown) {
      this.failedShown = false;
      this.deps.notice?.('idle');
    }
    this.waiting = true;
    this.noticeCounts.waits++;
    this.noticeTimer = this.deps.clock.setTimeout(() => {
      this.noticeTimer = null;
      if (!this.waiting || this.paused || this.ended) return;
      this.preparingShown = true;
      this.noticeCounts.shown++;
      this.deps.notice?.('preparing');
    }, PREPARING_AFTER_MS);
  }

  /** A source started: the wait is over once the output runs (issue #120). */
  private outputStarted(): void {
    if (!this.waiting) return;
    if (!this.deps.audio.running()) return;
    this.noticeCounts.starts++;
    this.settleNotice();
  }

  private settleNotice(): void {
    if (this.noticeTimer !== null) {
      this.deps.clock.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.waiting = false;
    if (this.preparingShown || this.failedShown) {
      this.preparingShown = false;
      this.failedShown = false;
      this.deps.notice?.('idle');
    }
  }

  private showFailed(): void {
    this.settleNotice();
    this.failedShown = true;
    this.noticeCounts.failed++;
    this.deps.notice?.('failed');
  }

  // ---- Small things ----------------------------------------------------------

  private clearGap(): void {
    if (this.gapTimer !== null) {
      this.listened += this.gapListening();
      this.deps.clock.clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private cancelSkip(): void {
    if (this.skipTimer !== null) {
      this.deps.clock.clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
  }

  /** A segment's index in the run, by identity, walked by index (types.ts). */
  indexOf(segment: unknown): number {
    const segments = this.segments;
    if (!segments || !segment) return -1;
    for (let i = 0; i < segments.length; i++) if (segments[i] === segment) return i;
    return -1;
  }

  private sourceListening(): number {
    return this.isPlaying && this.clip
      ? Math.max(0, this.currentPlaybackTime() - this.playbackOffset) / this.playbackRate : 0;
  }

  private gapListening(): number {
    return this.inGap && this.lastGap
      ? Math.max(0, Math.min(this.lastGap.ms, this.deps.clock.now() - this.lastGap.at)) / 1000 : 0;
  }

  /** Cumulative audible-source progress and consumed configured gaps, in listening seconds. */
  get listeningTime(): number {
    return this.listened + this.sourceListening() + this.gapListening();
  }

  private resetRemainingTime(): void {
    this.documentTime.reset();
    this.sectionTime.reset();
    this.timeScope = null;
    this.timeSection = null;
  }

  /** Listening time, read without fetching audio or walking the document again. */
  remainingTime(section?: { title: string; end: number }): RemainingSnapshot {
    const scope = this.completed ? this.completedScope
      : this.forwardStopIndex !== null && this.position < this.forwardStopIndex ? 'selection' : 'document';
    if (this.completed) return { status: 'finished', scope, seconds: 0 };
    if (this.ended || !this.store || !this.segments) return { status: 'estimating', scope, seconds: null };
    if (!this.segments.length) return { status: 'unavailable', scope, seconds: null };
    const end = scope === 'selection' ? this.forwardStopIndex! : this.segments.length;
    const offset = this.currentIndex === this.position && !this.inGap && !this.skipPending
      ? this.resumePoint?.offset ?? (this.isPlaying || this.paused ? this.currentPlaybackTime() : 0) : 0;
    const gap = this.inGap && this.lastGap ? Math.max(0, this.lastGap.ms - (this.deps.clock.now() - this.lastGap.at)) / 1000 : 0;
    const pauses = this.deps.pauses();
    const estimate = (to: number) => this.store!.remainingTime.seconds(this.position, to, this.speed, pauses, offset);
    const seconds = estimate(end);
    if (seconds === null) return { status: 'estimating', scope, seconds: null };
    const scopeKey = `${scope}:${end}`;
    if (this.timeScope !== scopeKey) { this.resetRemainingTime(); this.timeScope = scopeKey; }
    const listening = this.listeningTime;
    const result: RemainingSnapshot = { status: 'ready', scope, seconds: this.documentTime.update(seconds + gap, listening) };
    if (scope === 'document' && section) {
      const remaining = estimate(section.end);
      if (this.timeSection !== section.end) { this.sectionTime.reset(); this.timeSection = section.end; }
      if (remaining !== null) {
        result.sectionSeconds = Math.min(result.seconds!, this.sectionTime.update(remaining + gap, listening));
        result.sectionTitle = section.title;
      }
    }
    return result;
  }

  /** Whether a gap between sentences is running. */
  get inGap(): boolean {
    return this.gapTimer !== null;
  }

  /** Whether a skip is waiting out its debounce. */
  get skipPending(): boolean {
    return this.skipTimer !== null;
  }
}

/** Whether two runs of segments read the same texts in the same order: the same sentences, whatever objects carry them. */
function sameTexts(a: ArrayLike<EngineSegment> | null, b: ArrayLike<EngineSegment>): boolean {
  if (!a) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]?.text !== b[i]?.text) return false;
  return true;
}
