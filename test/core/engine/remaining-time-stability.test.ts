import { describe, expect, it } from 'vitest';
import type { EngineSegment } from '../../../src/core/engine/types';
import { EngineSession } from '../../../src/core/engine/session';
import { FakeAudio, FakeFetch, VirtualClock, voice, type FakeClip } from './harness';

const prose = 'One two three four five six seven eight nine.';
const noPauses = { sentence: { enabled: false, ms: 0 }, paragraph: { enabled: false, ms: 0 } };
async function setup() {
  const clock = new VirtualClock(), audio = new FakeAudio(clock), fetch = new FakeFetch();
  fetch.hold = true;
  const list = Array.from({ length: 100 }, (_, i) => ({ text: `${prose} ${i}` }));
  const session = new EngineSession<FakeClip>({ clock, audio, fetch: fetch.fetch, pauses: () => noPauses, emit() {} });
  session.bind({ voice: voice(), segments: list, backwardStopIndex: 0, forwardStopIndex: null });
  session.setPaused(false);
  fetch.respond(list[0].text, { audio: { name: 'first', duration: 60 } });
  await clock.advance(0);
  // Exercise the same duration model used by decoded read-ahead responses.
  session.store!.remainingTime.record(1, 60);
  session.store!.remainingTime.record(2, 60);
  return { clock, audio, fetch, session, list };
}

describe('stable remaining time across playback transitions', () => {
  it('never rises on new measurements and bounds a downward correction by listening time', async () => {
    const t = await setup();
    const before = t.session.remainingTime().seconds!;
    t.session.store!.remainingTime.record(3, 600);
    expect(t.session.remainingTime().seconds).toBe(before);
    t.session.setSpeed(1);
    expect(t.session.remainingTime().seconds).toBe(before);
    await t.clock.advance(1000);
    const high = t.session.remainingTime().seconds!;
    expect(high).toBeLessThanOrEqual(before);
    for (let i = 4; i < 30; i++) t.session.store!.remainingTime.record(i, 3);
    expect(t.session.remainingTime().seconds).toBe(high);
    await t.clock.advance(1000);
    const low = t.session.remainingTime().seconds!;
    expect(low).toBeGreaterThanOrEqual(high - 1.5 - 1e-8);
    expect(low).toBeLessThan(high);
  });

  it('does not bank paused, stalled or buffering time, even without snapshots during the wait', async () => {
    const t = await setup();
    t.session.remainingTime();
    t.session.setPaused(true);
    const before = t.session.remainingTime().seconds!;
    for (let i = 3; i < 30; i++) t.session.store!.remainingTime.record(i, 3);
    await t.clock.advance(100000);
    expect(t.session.remainingTime().seconds).toBe(before);
    t.session.setPaused(false);
    await t.clock.advance(0);
    t.audio.stall();
    await t.clock.advance(100000);
    expect(t.session.remainingTime().seconds).toBe(before);
    t.audio.unstall();
    await t.clock.advance(1000);
    expect(t.session.remainingTime().seconds).toBeGreaterThanOrEqual(before - 1.5 - 1e-8);
    await t.clock.advance(59000);
    const waiting = t.session.remainingTime().seconds!;
    expect(t.session.buffering).toBe(true);
    await t.clock.advance(100000);
    expect(t.session.remainingTime().seconds).toBe(waiting);
    t.fetch.respond(t.list[1].text, { audio: { name: 'next', duration: 60 } });
    await t.clock.advance(1000);
    expect(t.session.remainingTime().seconds).toBeGreaterThanOrEqual(waiting - 1.5 - 1e-8);
  });

  it('resets for deliberate speed and position changes but only resets Section on a new section', async () => {
    const t = await setup();
    const start = t.session.remainingTime({ title: 'First', end: 1 });
    t.session.setSpeed(0.5);
    expect(t.session.remainingTime().seconds).toBeCloseTo(start.seconds! * 2);
    t.session.setSpeed(1);
    const beforeSection = t.session.remainingTime({ title: 'First', end: 1 });
    // A new section must not rebase Doc onto a newly increased raw estimate.
    t.session.store!.remainingTime.record(3, 600);
    await t.clock.advance(60000);
    const next = t.session.remainingTime({ title: 'Second', end: 20 });
    expect(next.seconds).toBeLessThanOrEqual(beforeSection.seconds!);
    expect(next.sectionSeconds).toBeGreaterThan(start.sectionSeconds!);
    t.session.setPaused(true);
    t.session.skipBack('sentence');
    expect(t.session.remainingTime().seconds).toBeGreaterThan(next.seconds!);
  });

  it('has no sample-size gate for a fully measured short document and completes without a countdown tail', async () => {
    const clock = new VirtualClock(), audio = new FakeAudio(clock), fetch = new FakeFetch();
    const session = new EngineSession<FakeClip>({ clock, audio, fetch: fetch.fetch, pauses: () => noPauses, emit() {} });
    session.bind({ voice: voice(), segments: [{ text: 'Hi' }], backwardStopIndex: 0, forwardStopIndex: null });
    expect(session.remainingTime().status).toBe('estimating');
    session.setPaused(false);
    await clock.advance(0);
    expect(session.remainingTime().seconds).toBeCloseTo(0.1);
    await clock.advance(101);
    expect(session.remainingTime()).toMatchObject({ status: 'finished', seconds: 0 });
  });
});

it('keeps real decoded read-ahead updates stable across sentences and gaps', async () => {
  const clock = new VirtualClock(), audio = new FakeAudio(clock), fetch = new FakeFetch();
  const list: EngineSegment[] = Array.from({ length: 30 }, (_, i) => ({ text: `${prose} ${i}`, anchor: 'paragraphStart' }));
  fetch.answer = segment => ({ audio: { name: segment.text, duration: 3 + (list.indexOf(segment) % 4) * 2 } });
  const session = new EngineSession<FakeClip>({ clock, audio, fetch: fetch.fetch,
    pauses: () => ({ sentence: { enabled: true, ms: 100 }, paragraph: { enabled: true, ms: 700 } }), emit() {} });
  session.bind({ voice: voice(), segments: list, backwardStopIndex: 0, forwardStopIndex: null });
  session.setPaused(false);
  let previous: number | null = null, comparisons = 0;
  for (let i = 0; i < 240; i++) {
    await clock.advance(250);
    const snapshot = session.remainingTime({ title: 'Same', end: 30 });
    if (snapshot.status !== 'ready') continue;
    if (previous !== null) {
      expect(snapshot.seconds!).toBeLessThanOrEqual(previous + 1e-8);
      expect(snapshot.seconds!).toBeGreaterThanOrEqual(previous - 0.375 - 1e-8);
      comparisons++;
    }
    previous = snapshot.seconds;
  }
  expect(comparisons).toBeGreaterThan(100);
  expect(session.position).toBeGreaterThan(5);
  expect(session.gaps).toBeGreaterThan(5);
  session.end();
});

it('accounts for listening before a pause without depending on a display refresh', async () => {
  const t = await setup();
  const before = t.session.remainingTime().seconds!;
  await t.clock.advance(1000);
  t.session.setPaused(true);
  expect(t.session.remainingTime().seconds).toBeCloseTo(before - 1);
  expect(t.session.listeningTime).toBeCloseTo(1);
});
