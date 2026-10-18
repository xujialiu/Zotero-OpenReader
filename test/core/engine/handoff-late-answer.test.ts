import { describe, expect, it } from 'vitest';
import { EngineSession } from '../../../src/core/engine/session';
import { EventLog, FakeAudio, FakeFetch, segments, VirtualClock, voice, type FakeClip } from './harness';

const alloy = voice('openai-official::alloy');
const nova = voice('openai-official::nova');

/**
 * Issue #196: the old voice answers late, after the new voice took the
 * Segment over. A takeover replaces the ClipStore without a new run, so the
 * old store's answer must be told apart from a failure of the reading.
 */
async function takenOver() {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const log = new EventLog();
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch: fetch.fetch,
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    emit: log.emit,
  });
  session.bind({ voice: alloy, segments: segments('One two three.'), backwardStopIndex: 0, forwardStopIndex: null });

  // Play: the first Segment is asked of the slow old voice and waits ("Preparing...")
  fetch.holding = (v) => v.id === alloy.id;
  session.setPaused(false);

  // The user picks Nova meanwhile; Nova's audio for the Segment arrives first
  session.prepareHandoff({
    target: nova,
    commit: () => {
      session.bind({ voice: nova, segments: session.segments!, backwardStopIndex: session.position, forwardStopIndex: null });
      session.setPaused(session.paused);
    },
    notice: () => {},
    report: { pending: nova.id, stage: 'preparing', prepared: [], last: null, wordDecision: null, audioReady: [] },
  });
  await clock.advance(130);

  // Pause, then Play: Nova takes the Segment, and the old voice's store is closed
  session.setPaused(true);
  session.setPaused(false);
  await clock.advance(50);
  expect(audio.current?.clip.name).toBe('openai-official::nova:One two three.');
  return { clock, fetch, log, session, audio };
}

describe('the old voice answers after the new voice took the Segment (#196)', () => {
  it('reports no playback Error when the late answer is audio', async () => {
    const t = await takenOver();
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.log.of('Error')).toEqual([]);
    expect(t.session.error).toBe(null);
    expect(t.audio.current?.clip.name).toBe('openai-official::nova:One two three.');
  });

  it('reports no playback Error when the old Provider fails late', async () => {
    const t = await takenOver();
    t.fetch.respond('One two three.', { audio: null, error: 'network' });
    await t.clock.advance(0);
    expect(t.log.of('Error')).toEqual([]);
    expect(t.session.error).toBe(null);
  });
});
