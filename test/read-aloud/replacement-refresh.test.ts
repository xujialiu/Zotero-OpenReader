import { describe, expect, it } from 'vitest';
import { EngineSession } from '../../src/core/engine/session';
import type { EngineSegment, FetchResult } from '../../src/core/engine/types';
import { createReplacementRefresh } from '../../src/read-aloud/replacement-refresh';
import { EventLog, FakeAudio, FakeFetch, segments, VirtualClock, voice, type FakeClip } from '../core/engine/harness';

function setup() {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  let rows: Record<string, string> = {};
  const speak = (text: string) => Object.entries(rows).reduce((out, [from, to]) => out.split(from).join(to), text);
  fetch.answer = (segment: EngineSegment): FetchResult => ({ audio: { name: speak(segment.text), duration: 1 }, timestamps: null, speechText: speak(segment.text) } as FetchResult);
  const session = new EngineSession<FakeClip>({
    clock, audio, fetch: fetch.fetch, held: fetch.held,
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    emit: new EventLog().emit,
  });
  session.bind({ voice: voice(), segments: segments('One.', 'Two IL.', 'Three.'), backwardStopIndex: 0, forwardStopIndex: null });
  const reader = {};
  let live: EngineSession<FakeClip> | null = session;
  const asked: string[] = [];
  const refresh = createReplacementRefresh({
    session: () => live as any,
    speechText: async (_reader, text) => {
      asked.push(text);
      return speak(text);
    },
  });
  return { clock, session, reader, refresh, asked, setRows: (next: Record<string, string>) => (rows = next), end: () => (live = null) };
}

describe('a replacement edit reaching a reading (issue #237)', () => {
  it('compares each sentence the session holds with its text under the new rows, and lets the session act', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(100);
    t.setRows({ IL: 'interleukin' });
    expect(await t.refresh.refresh(t.reader)).toBe('dropped');
    expect(t.asked).toContain('Two IL.');
    expect(t.refresh.last(t.reader)).toMatchObject({ outcome: 'dropped', changed: [1] });
  });

  it('does nothing without a reading', async () => {
    const t = setup();
    t.end();
    expect(await t.refresh.refresh(t.reader)).toBe('none');
    expect(t.asked).toEqual([]);
  });

  it('does nothing when the edit changes no sentence held', async () => {
    const t = setup();
    t.session.setPaused(false);
    await t.clock.advance(100);
    t.setRows({ nowhere: 'x' });
    expect(await t.refresh.refresh(t.reader)).toBe('none');
  });
});
