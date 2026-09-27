import { describe, expect, it } from 'vitest';
import { ClipStore } from '../../../src/core/engine/clips';
import { FakeAudio, FakeFetch, VirtualClock, voice } from './harness';
import { RemainingTime } from '../../../src/core/engine/remaining-time';

const pauses = { sentence: { enabled: true, ms: 1000 }, paragraph: { enabled: true, ms: 2000 } };
describe('estimated remaining reading time', () => {
  it('uses known audio, learns pace for unread text, includes each gap once and scales with speed', () => {
    const time = new RemainingTime([
      { text: 'One two three.' }, { text: 'Four five six.' }, { text: 'Seven eight nine.', anchor: 'paragraphStart' },
    ]);
    expect(time.seconds(0, 3, 1, pauses)).toBeNull();
    time.record(0, 6); time.record(1, 6); time.record(2, 6);
    expect(time.seconds(0, 3, 1, pauses)).toBe(21);
    expect(time.seconds(0, 3, 2, pauses, 2)).toBe(9.5);
    expect(time.seconds(1, 2, 1, pauses)).toBe(6);
  });
});


it('handles mixed scripts and does not rescan text during repeated position or speed updates', () => {
  let reads = 0;
  const segments = Array.from({ length: 10000 }, () => ({ get text() { reads++; return '中文测试文字 One two three four five six seven eight.'; } }));
  const time = new RemainingTime(segments);
  for (let i = 0; i < 3; i++) time.record(i, 4);
  expect(time.seconds(9999, 10000, 1, pauses)).toBeCloseTo(4);
  const initialReads = reads;
  for (let i = 0; i < 1000; i++) time.seconds(i, 10000, 2, pauses);
  expect(reads).toBe(initialReads);
});

it('keeps measured silence without learning it as speaking pace, and rejects invalid ranges', () => {
  const time = new RemainingTime([{ text: 'One two three.' }, { text: 'Four five six.' }]);
  time.record(0, 0.001);
  expect(time.seconds(1, 2, 1, pauses)).toBeNull();
  expect(time.calibration.ready).toBe(false);
  time.record(1, 1);
  expect(time.seconds(0, 2, 1, pauses)).toBeCloseTo(2.001);
  expect(time.seconds(-1, 2, 1, pauses)).toBeNull();
  expect(time.seconds(0, 3, 1, pauses)).toBeNull();
});


it('retains measured durations after decoded audio eviction without fetching for the estimate', async () => {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const segments = Array.from({ length: 40 }, () => ({ text: 'One two three.' }));
  const store = new ClipStore({ segments, voice: voice(), clock, fetch: fetch.fetch, decode: audio.decode });
  await store.get(0);
  const time = store.remainingTime;
  for (let i = 1; i < 40; i++) await store.get(i);
  expect(store.cached(0)).toBeUndefined();
  expect(time.seconds(0, 1, 1, pauses)).toBeCloseTo(0.7);
  expect(fetch.requests).toHaveLength(40);
});

it('waits for measured representative audio instead of extrapolating titles and numbers', () => {
  const prose = 'One two three four five six seven eight nine.';
  const time = new RemainingTime([{ text: 'Contents' }, { text: '123456789' }, ...Array.from({ length: 5 }, () => ({ text: prose }))]);
  expect(time.seconds(0, 7, 1, pauses)).toBeNull();
  time.record(0, 2);
  time.record(1, 2);
  expect(time.seconds(0, 7, 1, pauses)).toBeNull();
  time.record(2, 3); time.record(3, 3);
  expect(time.seconds(0, 7, 1, pauses)).toBeNull();
  time.record(4, 3);
  expect(time.seconds(0, 7, 1, pauses)).toBe(25);
});

it('learns CJK pace and retains exact short ranges without inventing audio', () => {
  const time = new RemainingTime(Array.from({ length: 4 }, () => ({ text: '这是一个用来测试中文朗读速度的完整句子。' })));
  for (let i = 0; i < 3; i++) time.record(i, 4);
  expect(time.seconds(0, 4, 1, { sentence: { enabled: false, ms: 0 }, paragraph: { enabled: false, ms: 0 } })).toBeCloseTo(16);
  const short = new RemainingTime([{ text: 'Title' }]);
  expect(short.seconds(0, 1, 1, pauses)).toBeNull();
  short.record(0, 2);
  expect(short.seconds(0, 1, 1, pauses)).toBe(2);
});

it('requires enough measured audio and resists a single slow outlier', () => {
  const time = new RemainingTime(Array.from({ length: 50 }, () => ({ text: 'One two three four five six seven eight nine.' })));
  for (let i = 0; i < 3; i++) time.record(i, 0.1);
  expect(time.seconds(20, 50, 1, pauses)).toBeNull();
  for (let i = 3; i < 19; i++) time.record(i, 3);
  const before = time.seconds(20, 50, 1, pauses)!;
  time.record(19, 300);
  expect(time.seconds(20, 50, 1, pauses)!).toBeLessThan(before * 1.05);
});
