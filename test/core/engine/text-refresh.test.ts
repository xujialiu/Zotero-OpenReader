import { describe, expect, it } from 'vitest';
import type { HandoffReport } from '../../../src/core/engine/handoff';
import { EngineSession } from '../../../src/core/engine/session';
import type { EngineSegment, EngineVoice, FetchResult, WordTiming } from '../../../src/core/engine/types';
import { EventLog, FakeAudio, FakeFetch, segments, VirtualClock, voice, type FakeAudioData, type FakeClip } from './harness';

/**
 * Replacement edits while reading (issue #237): the sentences whose speech
 * text an edit changed are asked for again, and the one being read hands
 * over the way a voice switch does, at a word both versions time, else at
 * the next sentence.
 */

const TEXT = 'One IL two.';
/** Word timings in the document's coordinates, whatever the voice was given: "One", "IL", "two." */
const TIMED: WordTiming[] = [
  { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
  { start: 0.25, end: 0.45, charStart: 4, charEnd: 6 },
  { start: 0.5, end: 0.7, charStart: 7, charEnd: 11 },
];

const alloy = voice('openai-official::alloy');

function setup(options: { timed?: boolean } = {}) {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const log = new EventLog();
  const errors: unknown[] = [];
  /** What the voice is given for a sentence: the test's rows. */
  let rows: Record<string, string> = {};
  const speak = (text: string) => Object.entries(rows).reduce((out, [from, to]) => out.split(from).join(to), text);
  fetch.answer = (segment: EngineSegment, v: EngineVoice): FetchResult => {
    const speech = speak(segment.text);
    const audioData: FakeAudioData = { name: `${speech}`, duration: segment.text.length * 0.08 };
    return { audio: audioData, timestamps: segment.text === TEXT && options.timed !== false ? TIMED : null, speechText: speech } as FetchResult;
  };
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch: fetch.fetch,
    held: fetch.held,
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    emit: log.emit,
    log: (e) => errors.push(e),
  });
  const list = segments('Before it.', TEXT, 'Three IL.', 'Four five.', 'Six IL seven.', 'Eight.');
  session.bind({ voice: alloy, segments: list, backwardStopIndex: 0, forwardStopIndex: null });
  const report: HandoffReport = { pending: null, stage: 'preparing', prepared: [], last: null, wordDecision: null, audioReady: [] };
  /** The sentences whose speech text the session's clips no longer match. */
  const stale = () => {
    const store = session.store!;
    const out = new Set<number>([session.position]);
    for (const index of [...store.clips.keys(), ...store.inflight.keys()]) out.add(index);
    return new Set([...out].filter((index) => store.inflight.has(index) || store.speech.get(index) !== speak(list[index].text)));
  };
  return {
    clock, audio, fetch, log, errors, session, list, report, stale,
    setRows: (next: Record<string, string>) => (rows = next),
    played: () => audio.started.map((s) => s.clip.name),
  };
}

describe('replacement edits while reading (issue #237)', () => {
  it('keeps every clip whose text the edit leaves alone, and does nothing more', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(50);
    t.setRows({ nothing: 'x' });
    expect(t.stale().size).toBe(0);
    expect(t.session.refreshText(t.stale(), t.report)).toBe('none');
  });

  it('asks again only for the sentences ahead whose text changed, while the sentence being read plays on', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(50);
    const before = t.fetch.requests.length;
    expect(t.session.store!.speech.get(2)).toBe('Three IL.');
    t.setRows({ IL: 'interleukin' });
    const changed = t.stale();
    // The prefetch holds the next two: both have an IL
    expect([...changed].sort()).toEqual([1, 2]);
    expect(t.session.refreshText(changed, t.report)).toBe('dropped');
    await t.clock.advance(10);
    expect(t.fetch.requests.slice(before).map((r) => r.text).sort()).toEqual(['One IL two.', 'Three IL.']);
    expect(t.session.store!.speech.get(1)).toBe('One interleukin two.');
    expect(t.session.store!.speech.get(2)).toBe('Three interleukin.');
    expect(t.session.store!.speech.get(0)).toBe('Before it.');
    expect(t.played()).toEqual(['Before it.']);
    expect(t.audio.current?.stopped).toBe(false);
  });

  it('hands the sentence being read over at a word both versions time, keeping the unchanged clips', async () => {
    const t = setup();
    t.session.setPaused(false);
    // Into "One IL two.", before "IL"
    await t.clock.advance(800 + 100);
    expect(t.played()).toEqual(['Before it.', 'One IL two.']);
    t.setRows({ IL: 'interleukin' });
    const before = t.fetch.requests.length;
    expect(t.session.refreshText(t.stale(), t.report)).toBe('handoff');
    await t.clock.advance(400);
    // Only the changed sentences, the one being read first
    expect(t.fetch.requests.slice(before).map((r) => r.text)).toEqual(['One IL two.', 'Three IL.', 'Six IL seven.']);
    expect(t.played()).toEqual(['Before it.', 'One IL two.', 'One interleukin two.']);
    expect(t.report.last).toMatchObject({ kind: 'word', index: 1 });
    // The unchanged sentence came over with the reading, not asked again
    expect(t.session.store!.speech.get(3)).toBe('Four five.');
    expect(t.fetch.requests.filter((r) => r.text === 'Four five.')).toHaveLength(1);
    expect(t.errors).toEqual([]);
  });

  it('hands over at the next sentence when the voice times no words', async () => {
    const t = setup({ timed: false });
    t.session.setPaused(false);
    await t.clock.advance(800 + 100);
    t.setRows({ One: '1', IL: 'interleukin' });
    expect(t.session.refreshText(t.stale(), t.report)).toBe('handoff');
    await t.clock.advance(3000);
    expect(t.played().slice(0, 4)).toEqual(['Before it.', 'One IL two.', 'Three interleukin.', 'Four five.']);
    expect(t.report.last).toMatchObject({ kind: 'sentence', index: 2 });
  });

  it('reads the new text when Play comes after an edit made while paused', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(800 + 100);
    t.session.setPaused(true);
    t.setRows({ IL: 'interleukin' });
    expect(t.session.refreshText(t.stale(), t.report)).toBe('handoff');
    await t.clock.advance(500);
    t.session.setPaused(false);
    await t.clock.advance(1500);
    expect(t.played()).toContain('One interleukin two.');
    expect(t.played()).toContain('Three interleukin.');
    expect(t.played()).not.toContain('Three IL.');
  });

  it('still asks again for the changed sentences ahead when a speed change calls the handover off', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(800 + 100);
    t.setRows({ IL: 'interleukin' });
    expect(t.session.refreshText(t.stale(), t.report)).toBe('handoff');
    t.session.setSpeed(1.5);
    await t.clock.advance(5000);
    expect(t.played()).toContain('Three interleukin.');
    expect(t.played()).not.toContain('Three IL.');
  });
});
