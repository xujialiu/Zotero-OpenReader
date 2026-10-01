import { describe, expect, it } from 'vitest';
import type { PauseSettings } from '../../../src/core/engine/gap';
import { HANDOFF_REQUEST_MS, type HandoffReport, type VoiceNotice } from '../../../src/core/engine/handoff';
import { EngineSession } from '../../../src/core/engine/session';
import type { EngineVoice, FetchResult, WordTiming } from '../../../src/core/engine/types';
import { EventLog, FakeAudio, FakeFetch, flush, segments, VirtualClock, voice, type FakeAudioData, type FakeClip } from './harness';

const TEXT = 'One two three.';
/** The old voice: "One" 0–0.2, "two" 0.25–0.45, "three" 0.5–0.7. */
const OLD: WordTiming[] = [
  { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
  { start: 0.25, end: 0.45, charStart: 4, charEnd: 7 },
  { start: 0.5, end: 0.7, charStart: 8, charEnd: 13 },
];
/** The new voice speaks the same words half again as slowly. */
const NEW: WordTiming[] = OLD.map((t) => ({ ...t, start: t.start * 1.5, end: t.end * 1.5 }));

const alloy = voice('openai-official::alloy');
const nova = voice('openai-official::nova');

/** Longer than the old voice's read-ahead: it has only the first four when a switch begins early. */
const LONG = [TEXT, 'Four five.', 'Six seven eight.', 'Nine ten.', 'Eleven twelve.', 'Thirteen fourteen.'];

function setup(options: { newTimings?: boolean; settings?: PauseSettings; texts?: string[] } = {}) {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const log = new EventLog();
  const errors: unknown[] = [];
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch: fetch.fetch,
    held: fetch.held,
    pauses: () => options.settings ?? { sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } },
    emit: log.emit,
    log: (e) => errors.push(e),
  });
  fetch.answer = (segment, v): FetchResult => {
    const slow = v.id === nova.id ? 1.5 : 1;
    const audioData: FakeAudioData = { name: `${v.id}:${segment.text}`, duration: segment.text.length * 0.05 * slow };
    const timings = segment.text === TEXT ? (v.id === nova.id ? (options.newTimings === false ? null : NEW) : OLD) : null;
    return { audio: audioData, timestamps: timings };
  };
  const list = segments(...(options.texts ?? [TEXT, 'Four five.', 'Six seven eight.', 'Nine ten.']));
  const notices: VoiceNotice[] = [];
  const commits: string[] = [];
  let valid = true;
  const report: HandoffReport = { pending: nova.id, stage: 'preparing', prepared: [], last: null, wordDecision: null, audioReady: [] };
  const prepare = (target: EngineVoice = nova) =>
    session.prepareHandoff({
      target,
      commit: () => {
        commits.push(target.id);
        // The manager's selection rebuilds its controller onto the new voice: a carry-on
        // over the segments it holds now, which a rebuild may have replaced
        expect(session.bind({ voice: target, segments: session.segments!, backwardStopIndex: session.position, forwardStopIndex: null })).toBe('carried-on');
        session.setPaused(session.paused);
      },
      valid: () => valid,
      notice: (kind) => notices.push(kind),
      report,
    });
  session.bind({ voice: alloy, segments: list, backwardStopIndex: 0, forwardStopIndex: null });
  return { clock, audio, fetch, log, errors, session, list, notices, commits, report, prepare, setValid: (v: boolean) => (valid = v) };
}

const playing = (t: ReturnType<typeof setup>) => t.audio.started.map((s) => [s.clip.name.replace('openai-official::', ''), Math.round(s.offset * 1000) / 1000]);

describe('Handoff: at a word', () => {
  it('prepares after 120 ms, cuts the old voice at the first shared word boundary and plays the new one from the same word', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(10);
    t.prepare();
    expect(t.notices).toEqual(['preparing']);
    await t.clock.advance(119);
    expect(t.fetch.requests.filter((r) => r.voice === nova.id)).toHaveLength(0);
    await t.clock.advance(1);
    expect(t.fetch.requests.filter((r) => r.voice === nova.id).map((r) => r.text)).toEqual([TEXT]);
    // Armed on "two": the old voice stops at 0.2 s, where its "One" ends
    expect(t.audio.started[0].cutAt).toBeCloseTo(0.2, 9);
    expect(t.report.stage).toBe('word');
    await t.clock.advance(70);
    expect(playing(t)).toEqual([
      ['alloy:One two three.', 0],
      ['nova:One two three.', 0.375],
    ]);
    expect(t.commits).toEqual([nova.id]);
    expect(t.session.voice?.id).toBe(nova.id);
    expect(t.notices).toEqual(['preparing', 'selected']);
    expect(t.report.last).toEqual({ kind: 'word', index: 0, offset: 0.375, charStart: 4, from: alloy.id, to: nova.id });
    expect(t.session.handoff).toBe(null);
  });

  it('asks for the new voice with the preparation’s signal', async () => {
    const t = setup();
    t.session.setPaused(false);
    const signal = { aborted: false };
    let aborted = 0;
    t.session.prepareHandoff({
      target: nova,
      commit: () => {},
      notice: () => {},
      report: t.report,
      abort: { signal, abort: () => aborted++ },
    });
    await t.clock.advance(120);
    expect(t.fetch.requests.find((r) => r.voice === nova.id)?.signal).toBe(signal);
    t.session.setSpeed(1.5);
    expect(aborted).toBe(1);
  });

  it('once the new voice has taken over, its requests are the reading\'s own, without the preparation\'s signal (issue #162)', async () => {
    const t = setup({ texts: LONG });
    t.session.setPaused(false);
    const signal = { aborted: false };
    t.session.prepareHandoff({
      target: nova,
      commit: () => {
        t.session.bind({ voice: nova, segments: t.session.segments!, backwardStopIndex: t.session.position, forwardStopIndex: null });
        t.session.setPaused(t.session.paused);
      },
      notice: () => {},
      report: t.report,
      abort: { signal, abort: () => {} },
    });
    await t.clock.advance(400);
    expect(t.session.voice?.id).toBe(nova.id);
    const novas = t.fetch.requests.filter((r) => r.voice === nova.id);
    // The preparation's request carried the signal; the prefetch after the takeover does not
    expect(novas[0]).toEqual({ text: TEXT, voice: nova.id, signal });
    expect(novas.slice(1).map((r) => r.text)).toEqual(['Four five.', 'Six seven eight.', 'Nine ten.']);
    expect(novas.slice(1).every((r) => r.signal === undefined)).toBe(true);
  });

  it('coalesces picks within 120 ms: only the last voice is asked for', async () => {
    const t = setup();
    t.session.setPaused(false);
    t.prepare(voice('openai-official::echo'));
    await t.clock.advance(60);
    t.prepare(nova);
    await t.clock.advance(120);
    expect(t.fetch.requests.filter((r) => r.voice !== alloy.id).map((r) => r.voice)).toEqual([nova.id]);
    expect(t.notices.slice(0, 3)).toEqual(['preparing', 'cancelled', 'preparing']);
  });
});

describe('Handoff: at a sentence', () => {
  it('without a shared word boundary, takes the next sentence it has audio for, from its start', async () => {
    const t = setup({ newTimings: false });
    t.session.setPaused(false);
    t.prepare();
    await t.clock.advance(200);
    expect(t.report.wordDecision).toBe('no-new-timings');
    expect(t.fetch.requests.filter((r) => r.voice === nova.id).map((r) => r.text)).toEqual([TEXT, 'Four five.']);
    await t.clock.advance(501);
    expect(playing(t)).toEqual([
      ['alloy:One two three.', 0],
      ['nova:Four five.', 0],
    ]);
    expect(t.commits).toEqual([nova.id]);
    expect(t.report.last?.kind).toBe('sentence');
    expect(t.notices).toEqual(['preparing', 'selected']);
  });

  it('prepares further ahead while the new voice keeps arriving too late', async () => {
    const t = setup({ newTimings: false });
    t.fetch.hold = true;
    t.session.setPaused(false);
    t.fetch.respond(TEXT);
    await t.clock.advance(0);
    t.prepare();
    await t.clock.advance(120);
    // The old voice reads on past the sentence the new voice was asked for
    for (const text of ['Four five.', 'Six seven eight.']) t.fetch.respond(text);
    await t.clock.advance(1300);
    t.fetch.respond(TEXT);
    await t.clock.advance(25);
    expect(t.session.position).toBe(2);
    const asked = t.fetch.waiting.filter((p) => p.voice.id === nova.id).map((p) => p.segment.text);
    expect(asked).toEqual(['Nine ten.']);
  });
});

describe('Handoff: called off', () => {
  it('when the manager side stops being valid before the cut: the old clip plays on untouched', async () => {
    const t = setup();
    t.session.setPaused(false);
    t.prepare();
    await t.clock.advance(130);
    t.setValid(false);
    await t.clock.advance(70);
    expect(t.notices).toEqual(['preparing', 'cancelled']);
    expect(t.audio.started[0].cutAt).toBe(null);
    expect(playing(t)).toEqual([['alloy:One two three.', 0]]);
  });

  it('by a speed change or the end: the old voice reads on', async () => {
    for (const action of ['speed', 'end'] as const) {
      const t = setup();
      t.session.setPaused(false);
      t.prepare();
      await t.clock.advance(130);
      expect(t.report.stage, action).toBe('word');
      if (action === 'speed') t.session.setSpeed(1.5);
      if (action === 'end') t.session.end();
      expect(t.notices, action).toEqual(['preparing', 'cancelled']);
      expect(t.session.handoff, action).toBe(null);
      expect(t.session.voice?.id, action).toBe(alloy.id);
      await t.clock.advance(1000);
      expect(t.commits, action).toEqual([]);
    }
  });

  it('when the manager side stops being valid; a cut already armed plays on from that word', async () => {
    const t = setup();
    t.session.setPaused(false);
    t.prepare();
    await t.clock.advance(196);
    expect(t.report.stage).toBe('word');
    // Between the last look (195 ms) and the cut (200 ms)
    t.setValid(false);
    await t.clock.advance(10);
    expect(t.notices).toEqual(['preparing', 'cancelled']);
    expect(playing(t)).toEqual([
      ['alloy:One two three.', 0],
      ['alloy:One two three.', 0.2],
    ]);
  });

  it('fails after 60 s for one request, and the old voice reads on', async () => {
    const t = setup({ newTimings: false });
    t.session.setPaused(false);
    t.prepare();
    t.fetch.hold = true;
    await t.clock.advance(120 + HANDOFF_REQUEST_MS);
    expect(t.notices).toEqual(['preparing', 'failed']);
    expect(t.errors.some((e) => String(e).includes('timed out'))).toBe(true);
    expect(t.session.voice?.id).toBe(alloy.id);
  });

  it('fails when the manager does not take the new voice', async () => {
    const t = setup();
    t.session.setPaused(false);
    t.session.prepareHandoff({ target: nova, commit: () => false, notice: (kind) => t.notices.push(kind), report: t.report });
    await t.clock.advance(200);
    expect(t.notices).toEqual(['preparing', 'failed']);
    expect(t.report.stage).toBe('failed');
    expect(t.errors.some((e) => String(e).includes('did not take the new voice'))).toBe(true);
  });

  it('fails on a request that fails', async () => {
    const t = setup();
    const answer = t.fetch.answer;
    t.fetch.answer = (s, v) => (v.id === nova.id ? { audio: null, error: 'network' } : answer(s, v));
    t.session.setPaused(false);
    t.prepare();
    await t.clock.advance(130);
    expect(t.notices).toEqual(['preparing', 'failed']);
  });
});

describe('Handoff: the old voice asks for nothing new (issue #163)', () => {
  it('reading on, the old voice reads only the audio it has, and the new voice takes the first sentence it lacks', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    // The old voice has sentences 0-3: the first, and its read-ahead of three
    expect(t.fetch.of(alloy.id)).toHaveLength(4);
    t.prepare();
    await t.clock.advance(120);
    expect(t.fetch.of(nova.id)).toEqual([TEXT]);
    await t.clock.advance(700);
    // Too late for sentence 0: the new voice is asked further ahead
    t.fetch.respond(TEXT);
    await t.clock.advance(25);
    expect(t.fetch.of(nova.id)).toEqual([TEXT, 'Nine ten.']);
    // Sentences 1-3 from what the old voice has; at sentence 4 it has nothing, and the reading waits
    await t.clock.advance(1700);
    expect(t.session.position).toBe(4);
    expect(t.audio.current).toBeUndefined();
    expect(t.session.buffering).toBe(true);
    expect(t.report).toMatchObject({ stage: 'waiting', waitedAt: 4, oldRequests: 0 });
    expect(t.fetch.lookups).toEqual([{ text: 'Eleven twelve.', voice: alloy.id }]);
    t.fetch.respond('Nine ten.');
    await t.clock.advance(25);
    expect(t.fetch.of(nova.id)).toEqual([TEXT, 'Nine ten.', 'Eleven twelve.']);
    t.fetch.respond('Eleven twelve.');
    await t.clock.advance(1);
    expect(playing(t).map(([name]) => name)).toEqual([
      'alloy:One two three.',
      'alloy:Four five.',
      'alloy:Six seven eight.',
      'alloy:Nine ten.',
      'nova:Eleven twelve.',
    ]);
    expect(playing(t).at(-1)).toEqual(['nova:Eleven twelve.', 0]);
    expect(t.report.last).toMatchObject({ kind: 'sentence', index: 4 });
    expect(t.fetch.of(alloy.id)).toHaveLength(4);
    expect(t.commits).toEqual([nova.id]);
    expect(t.notices).toEqual(['preparing', 'selected']);
  });

  it('waits for audio the old voice asked for before the switch, reads it in the old voice, and stops the read-ahead', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.hold = true;
    t.session.setPaused(false);
    t.fetch.respond(TEXT);
    await t.clock.advance(0);
    // The read-ahead, two at a time: sentence 1 and one more on their way
    expect(t.fetch.of(alloy.id)).toHaveLength(3);
    expect(t.fetch.of(alloy.id)).toContain('Four five.');
    t.prepare();
    await t.clock.advance(800);
    expect(t.session.position).toBe(1);
    expect(t.audio.current).toBeUndefined();
    t.fetch.respond('Four five.');
    await t.clock.advance(0);
    expect(playing(t).at(-1)).toEqual(['alloy:Four five.', 0]);
    // The read-ahead does not go on to its third sentence
    expect(t.fetch.of(alloy.id)).toHaveLength(3);
  });

  it('a skip to a sentence the old voice has: the old voice reads it, and the new voice takes over within it', async () => {
    const t = setup({ texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(800);
    expect(t.session.position).toBe(1);
    const before = t.fetch.of(alloy.id).length;
    t.prepare();
    await t.clock.advance(130);
    expect(t.fetch.of(nova.id)).toEqual(['Four five.']);
    t.session.skipBack('sentence');
    expect(t.session.handoff?.pending).toBe(true);
    await t.clock.advance(600);
    expect(playing(t).at(-1)).toEqual(['alloy:One two three.', 0]);
    expect(t.commits).toEqual([]);
    // The preparation starts over where the reading landed
    t.fetch.respond('Four five.');
    await t.clock.advance(25);
    expect(t.fetch.of(nova.id)).toEqual(['Four five.', TEXT]);
    t.fetch.respond(TEXT);
    await t.clock.advance(300);
    expect(t.report.last).toMatchObject({ kind: 'word', index: 0 });
    expect(playing(t).at(-1)?.[0]).toBe('nova:One two three.');
    expect(t.fetch.of(alloy.id)).toHaveLength(before);
  });

  it('a skip to a sentence the old voice lacks: the reading waits for the new voice, which reads it from its start', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    const before = t.fetch.of(alloy.id).length;
    t.prepare();
    await t.clock.advance(130);
    // Five ahead: the last sentence
    t.session.skipAhead('sentence', true);
    await t.clock.advance(600);
    expect(t.session.position).toBe(5);
    expect(t.audio.current).toBeUndefined();
    expect(t.report).toMatchObject({ stage: 'waiting', waitedAt: 5 });
    expect(t.fetch.of(alloy.id)).toHaveLength(before);
    t.fetch.respond(TEXT);
    await t.clock.advance(25);
    expect(t.fetch.of(nova.id)).toEqual([TEXT, 'Thirteen fourteen.']);
    t.fetch.respond('Thirteen fourteen.');
    await t.clock.advance(1);
    expect(playing(t).at(-1)).toEqual(['nova:Thirteen fourteen.', 0]);
    expect(t.report.last).toMatchObject({ kind: 'sentence', index: 5 });
    expect(t.commits).toEqual([nova.id]);
    expect(t.fetch.of(alloy.id)).toHaveLength(before);
    expect(t.notices).toEqual(['preparing', 'selected']);
  });

  it('a skip to a sentence both voices have: the new voice reads it', async () => {
    const t = setup({ newTimings: false });
    t.session.setPaused(false);
    t.prepare();
    await t.clock.advance(200);
    expect(t.report.prepared).toEqual([0, 1]);
    t.session.skipAhead('sentence');
    await t.clock.advance(600);
    expect(playing(t).at(-1)).toEqual(['nova:Four five.', 0]);
    expect(t.report.last).toMatchObject({ kind: 'sentence', index: 1 });
    expect(t.fetch.requests.filter((r) => r.voice === nova.id && r.text === 'Four five.')).toHaveLength(1);
  });

  it.each(['failure', 'speed change'] as const)('a %s while the reading waits for the new voice: the old voice asks for the sentence and reads it', async (how) => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    t.prepare();
    await t.clock.advance(130);
    t.session.skipAhead('sentence', true);
    await t.clock.advance(600);
    expect(t.report.stage).toBe('waiting');
    expect(t.fetch.of(alloy.id)).not.toContain('Thirteen fourteen.');
    if (how === 'failure') await t.clock.advance(HANDOFF_REQUEST_MS);
    else t.session.setSpeed(1.5);
    await t.clock.advance(1);
    expect(t.notices).toEqual(['preparing', how === 'failure' ? 'failed' : 'cancelled']);
    expect(t.fetch.of(alloy.id).at(-1)).toBe('Thirteen fourteen.');
    expect(playing(t).at(-1)).toEqual(['alloy:Thirteen fourteen.', 0]);
    expect(t.session.voice?.id).toBe(alloy.id);
  });

  it('a jump keeps the switch: the run moves, the old voice keeps what it has, and the same rule holds where it landed', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    const before = t.fetch.of(alloy.id).length;
    const handoff = t.prepare()!;
    await t.clock.advance(130);
    // Zotero's repositionTo: the same voice and segments, a controller told where to start
    expect(t.session.bind({ voice: alloy, segments: t.list, backwardStopIndex: 2, forwardStopIndex: null, jump: true })).toBe('started');
    t.session.setPaused(false);
    expect(t.session.handoff).toBe(handoff);
    expect(handoff.pending).toBe(true);
    await t.clock.advance(0);
    expect(playing(t).at(-1)).toEqual(['alloy:Six seven eight.', 0]);
    await t.clock.advance(1300);
    expect(t.session.position).toBe(4);
    expect(t.report).toMatchObject({ stage: 'waiting', waitedAt: 4 });
    expect(t.fetch.of(alloy.id)).toHaveLength(before);
    expect(t.notices).toEqual(['preparing']);
  });

  it('the same sentences rebuilt after the controller’s end keep the switch (Zotero’s restart from a selection)', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    const before = t.fetch.of(alloy.id).length;
    const handoff = t.prepare()!;
    await t.clock.advance(130);
    // clearSegments: the manager destroys its controller, and the Engine ends the session
    t.session.end({ park: true });
    expect(t.audio.current).toBeUndefined();
    // setSegments a microtask later: the same texts, new objects, the selection's index
    const rebuilt = segments(...LONG);
    expect(t.session.bind({ voice: alloy, segments: rebuilt, backwardStopIndex: 4, forwardStopIndex: null })).toBe('started');
    t.session.setPaused(false);
    expect(t.session.handoff).toBe(handoff);
    expect(handoff.pending).toBe(true);
    await t.clock.advance(0);
    expect(t.report).toMatchObject({ stage: 'waiting', waitedAt: 4 });
    expect(t.fetch.of(alloy.id)).toHaveLength(before);
    t.fetch.respond(TEXT);
    await t.clock.advance(25);
    t.fetch.respond('Eleven twelve.');
    await t.clock.advance(1);
    expect(playing(t).at(-1)).toEqual(['nova:Eleven twelve.', 0]);
    expect(t.report.last).toMatchObject({ kind: 'sentence', index: 4 });
    expect(t.session.segments).toBe(rebuilt);
    expect(t.notices).toEqual(['preparing', 'selected']);
  });

  it('other sentences after the end call the switch off, and the old voice starts afresh', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    t.prepare();
    await t.clock.advance(130);
    const store = t.session.store;
    t.session.end({ park: true });
    t.session.bind({ voice: alloy, segments: segments('Something else.', ...LONG.slice(1)), backwardStopIndex: 0, forwardStopIndex: null });
    expect(t.notices).toEqual(['preparing', 'cancelled']);
    expect(t.session.handoff).toBe(null);
    expect(t.session.store).not.toBe(store);
    expect(store?.closed).toBe(true);
  });

  it('an end no bind follows calls the switch off at its next look', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    t.prepare();
    await t.clock.advance(130);
    t.session.end({ park: true });
    expect(t.notices).toEqual(['preparing']);
    await t.clock.advance(25);
    expect(t.notices).toEqual(['preparing', 'cancelled']);
    // A bind after that starts afresh
    t.session.bind({ voice: alloy, segments: segments(...LONG), backwardStopIndex: 0, forwardStopIndex: null });
    expect(t.session.handoff).toBe(null);
  });

  it('an end of the session for good calls the switch off at once', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.session.setPaused(false);
    await t.clock.advance(10);
    t.prepare();
    await t.clock.advance(130);
    t.session.end();
    expect(t.notices).toEqual(['preparing', 'cancelled']);
  });

  it('the same sentences rebuilt while the session is live keep the switch too', async () => {
    const t = setup({ newTimings: false, texts: LONG });
    t.fetch.holding = (v) => v.id === nova.id;
    t.session.setPaused(false);
    await t.clock.advance(10);
    const handoff = t.prepare()!;
    await t.clock.advance(130);
    expect(t.session.bind({ voice: alloy, segments: segments(...LONG), backwardStopIndex: 2, forwardStopIndex: null })).toBe('started');
    t.session.setPaused(false);
    expect(t.session.handoff).toBe(handoff);
    await t.clock.advance(0);
    expect(playing(t).at(-1)).toEqual(['alloy:Six seven eight.', 0]);
  });

  it('a jump with no switch pending starts afresh, as before', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(10);
    const store = t.session.store;
    expect(t.session.bind({ voice: alloy, segments: t.list, backwardStopIndex: 2, forwardStopIndex: null, jump: true })).toBe('started');
    expect(t.session.store).not.toBe(store);
  });
});

describe('Handoff: paused', () => {
  it('prepares silently, says ready once the paused word is known, and plays the new voice from the next word on Play', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(100);
    t.session.setPaused(true);
    const handoff = t.prepare()!;
    await t.clock.advance(150);
    expect(t.notices).toEqual(['preparing', 'ready']);
    expect(t.audio.current).toBeUndefined();
    handoff.play(() => t.session.setPaused(false));
    await t.clock.advance(0);
    expect(playing(t)).toEqual([
      ['alloy:One two three.', 0],
      ['nova:One two three.', 0.375],
    ]);
    expect(t.notices).toEqual(['preparing', 'ready', 'selected']);
  });

  it('resumes the old voice when the paused word is not known, and hands over at the next sentence', async () => {
    const t = setup({ newTimings: false });
    t.session.setPaused(false);
    await t.clock.advance(100);
    t.session.setPaused(true);
    const handoff = t.prepare()!;
    await t.clock.advance(150);
    handoff.play(() => t.session.setPaused(false));
    await t.clock.advance(0);
    expect(playing(t)).toEqual([
      ['alloy:One two three.', 0],
      ['alloy:One two three.', 0.1],
    ]);
    await t.clock.advance(700);
    expect(playing(t).at(-1)).toEqual(['nova:Four five.', 0]);
  });

  it('asks a suspended output to run before the new voice plays', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(100);
    t.session.setPaused(true);
    const handoff = t.prepare()!;
    await t.clock.advance(150);
    t.audio.isRunning = false;
    let played = 0;
    handoff.play(() => {
      played++;
      t.session.setPaused(false);
    });
    await t.clock.advance(25);
    expect(played).toBe(0);
    t.audio.isRunning = true;
    await t.clock.advance(25);
    expect(played).toBe(1);
    await flush();
    expect(playing(t).at(-1)).toEqual(['nova:One two three.', 0.375]);
  });
});
