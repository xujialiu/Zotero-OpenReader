/**
 * Issue #226: after a voice switch, the sentence after the takeover must not
 * wait for the new voice. The preparation asks for as many sentences at once
 * as the prefetch's requests at once, a cut at a word waits until the next
 * sentence can be in time, and the old voice's requests stop holding the
 * prefetch's slots at the takeover.
 */

import { describe, expect, it } from 'vitest';
import type { HandoffReport, VoiceNotice } from '../../../src/core/engine/handoff';
import { EngineSession } from '../../../src/core/engine/session';
import type { EngineSegment, EngineVoice, FetchResult, WordTiming } from '../../../src/core/engine/types';
import { FakeAudio, VirtualClock, voice, type FakeAudioData, type FakeClip } from './harness';

const alloy = voice('openai-official::alloy');
const nova = voice('openai-official::nova');
/** The new voice speaks a fifth slower. */
const SLOW = 1.2;
/** Ten sentences of 59 characters: 2.95 s each in the old voice, 3.54 s in the new. */
const TEXTS = Array.from({ length: 10 }, (_, i) => `Sentence ${i} has words that go on for a while xxxxxxxxxx end.`);
/** Sixteen sentences of 1.25 to 6 s in the old voice. */
const MIXED = [30, 90, 45, 120, 60, 25, 100, 50, 70, 35, 110, 55, 80, 40, 95, 65].map((length, i) =>
  `S${i} ${'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu '.repeat(3)}`.slice(0, length - 1).trimEnd() + '.',
);

/** Every word timed, 0.05 s a character and a character's pause after it. */
function wordsOf(text: string, slow: number): WordTiming[] {
  const out: WordTiming[] = [];
  let at = 0;
  for (const m of text.matchAll(/\S+/g)) {
    const duration = m[0].length * 0.05 * slow;
    out.push({ start: at, end: at + duration, charStart: m.index!, charEnd: m.index! + m[0].length });
    at += duration + 0.05 * slow;
  }
  return out;
}

interface Options {
  /** Requests at once, the pane's number. */
  requests?: number;
  /** Milliseconds a request of the old voice takes, and of the new one. */
  oldMs?: number;
  newMs?: number;
  timed?: boolean;
  texts?: string[];
  /** One worker both voices queue on, making one request at a time (a Kokoro server read in two of its voices). */
  serial?: boolean;
  /** A request that answers with no audio. */
  fails?: (v: EngineVoice, index: number, attempt: number) => boolean;
}

function setup(options: Options = {}) {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const asked: { at: number; voice: string; index: number }[] = [];
  const preparing: number[] = [];
  const texts = options.texts ?? TEXTS;
  const fetch = (segment: EngineSegment, v: EngineVoice): Promise<FetchResult> => {
    const index = texts.indexOf(segment.text);
    const attempt = asked.filter((a) => a.voice === v.id && a.index === index).length;
    asked.push({ at: clock.now(), voice: v.id, index });
    const slow = v.id === nova.id ? SLOW : 1;
    const ms = v.id === nova.id ? (options.newMs ?? 1500) : (options.oldMs ?? 1500);
    const result: FetchResult = options.fails?.(v, index, attempt)
      ? { audio: null, error: 'network' }
      : {
          audio: { name: `${v.id.split('::')[1]}:${index}`, duration: segment.text.length * 0.05 * slow } satisfies FakeAudioData,
          timestamps: options.timed === false ? null : wordsOf(segment.text, slow),
        };
    if (!options.serial) return new Promise((resolve) => clock.setTimeout(() => resolve(result), ms));
    const queued = queue;
    queue = queued.then(() => new Promise<void>((done) => clock.setTimeout(done, ms)));
    return queue.then(() => result);
  };
  let queue: Promise<void> = Promise.resolve();
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch,
    held: async () => ({ audio: null, error: 'not-held' }),
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    prefetch: () => ({ sentences: 5, requests: options.requests ?? 2 }),
    emit: () => {},
    notice: (kind) => {
      if (kind === 'preparing') preparing.push(clock.now());
    },
  });
  const notices: VoiceNotice[] = [];
  const report: HandoffReport = { pending: nova.id, stage: 'preparing', prepared: [], last: null, wordDecision: null, audioReady: [] };
  let takenAt: number | null = null;
  const segments = texts.map((text) => ({ text, anchor: null }));
  session.bind({ voice: alloy, segments, backwardStopIndex: 0, forwardStopIndex: null });
  session.setPaused(false);
  return {
    clock,
    session,
    report,
    notices,
    asked,
    /** Pick the new voice; the manager's rebuild onto it is a carry-on (session.ts bind). */
    pick() {
      session.prepareHandoff({
        target: nova,
        commit: () => {
          takenAt = clock.now();
          session.bind({ voice: nova, segments: session.segments!, backwardStopIndex: session.position, forwardStopIndex: null });
          session.setPaused(session.paused);
        },
        notice: (kind) => notices.push(kind),
        report,
      });
    },
    takenAt: () => takenAt,
    /** The sentences the new voice was asked for, in order. */
    novas: () => asked.filter((a) => a.voice === nova.id).map((a) => a.index),
    /** "Preparing…" shown since the new voice took over. */
    waitsAfterTakeover: () => preparing.filter((at) => takenAt !== null && at >= takenAt),
    /** Read on until the end of the document. */
    readToEnd: () => clock.advance(120_000),
  };
}

describe('Handoff: the preparation asks for as many sentences at once as the prefetch (issue #226)', () => {
  it.each([
    [1, [1]],
    [2, [1, 2]],
    [3, [1, 2, 3]],
  ])('at %i request(s) at once: the sentence being read, then the ones after it', async (requests, expected) => {
    const t = setup({ requests });
    await t.clock.advance(5000);
    expect(t.session.currentIndex).toBe(1);
    t.pick();
    await t.clock.advance(120);
    expect(t.novas()).toEqual(expected);
  });

  it('a request beside the first that fails does not fail the switch; the reading asks again', async () => {
    const t = setup({ fails: (v, index, attempt) => v.id === nova.id && index === 2 && attempt === 0 });
    await t.clock.advance(5000);
    t.pick();
    await t.readToEnd();
    expect(t.notices).toEqual(['preparing', 'selected']);
    expect(t.novas().filter((i) => i === 2)).toHaveLength(2);
    expect(t.session.voice?.id).toBe(nova.id);
    expect(t.session.completed).toBe(true);
  });
});

describe('Handoff: a cut at a word waits until the next sentence can be in time (issue #226)', () => {
  it('with the next sentence in, cuts at the first word boundary, and the next sentence plays without a wait', async () => {
    const t = setup({ requests: 2 });
    await t.clock.advance(5000);
    t.pick();
    await t.readToEnd();
    expect(t.report.last).toMatchObject({ kind: 'word', index: 1 });
    expect(t.waitsAfterTakeover()).toEqual([]);
  });

  it('with too little of the sentence left to fetch the next, cuts in a later sentence instead, and nothing waits', async () => {
    // One request at a time: the sentence being read arrives 0.24 s before its end in the new voice
    const t = setup({ requests: 1 });
    await t.clock.advance(5000);
    t.pick();
    await t.readToEnd();
    expect(t.report.last?.index).toBe(2);
    expect(t.waitsAfterTakeover()).toEqual([]);
  });

  it('with enough of the sentence left, cuts there before the next sentence is asked for', async () => {
    const t = setup({ requests: 1, oldMs: 600, newMs: 600 });
    await t.clock.advance(3650);
    expect(t.session.currentIndex).toBe(1);
    t.pick();
    await t.readToEnd();
    expect(t.report.last).toMatchObject({ kind: 'word', index: 1 });
    // Only the sentence being read was asked for before the takeover
    expect(t.asked.filter((a) => a.voice === nova.id && a.at < t.takenAt()!).map((a) => a.index)).toEqual([1]);
    expect(t.waitsAfterTakeover()).toEqual([]);
  });
});

describe('Handoff: a cut at a word on a server that makes one request at a time (issue #226)', () => {
  it('never counts the next sentence\'s wait in the queue as progress: no sentence after the takeover waits', async () => {
    const late: number[] = [];
    for (let pickAt = 3000; pickAt <= 13_500; pickAt += 250) {
      const t = setup({ serial: true, oldMs: 1500, newMs: 1500, texts: MIXED });
      await t.clock.advance(pickAt);
      t.pick();
      await t.readToEnd();
      expect(t.takenAt(), `picked at ${pickAt}`).not.toBeNull();
      if (t.waitsAfterTakeover().length) late.push(pickAt);
    }
    expect(late).toEqual([]);
  });
});

describe('the prefetch after a takeover (issue #226)', () => {
  it('asks for the new voice at once, though the old voice\'s requests are still on their way', async () => {
    // The old voice is slow: two of its requests sent at 12 s come back at 18 s
    const t = setup({ oldMs: 6000, newMs: 800, timed: false });
    await t.clock.advance(12_000);
    t.pick();
    await t.readToEnd();
    const takenAt = t.takenAt()!;
    expect(takenAt).not.toBeNull();
    const first = t.asked.find((a) => a.voice === nova.id && a.at >= takenAt);
    expect(first?.at).toBe(takenAt);
    expect(t.waitsAfterTakeover()).toEqual([]);
  });
});
