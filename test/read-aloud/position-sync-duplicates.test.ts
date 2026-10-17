import { describe, expect, it } from 'vitest';
import { createPositionSync } from '../../src/read-aloud/position-sync';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

const position = (pageIndex: number) => ({ pageIndex, rects: [[10, 20, 30, 40]] });
const point = (pageIndex: number) => ({ pageIndex, rects: [[20, 30, 20, 30]] });
const KEY = 'DUPL0001';

interface Reader {
  lib: number;
  key: string;
  active: boolean;
  paused: boolean;
  saved: unknown;
}

const reader = (page: number, over: Partial<Reader> = {}): Reader => ({
  lib: 1, key: KEY, active: true, paused: false, saved: position(page), ...over,
});

function harness(readers: Reader[]) {
  const writes: PositionEntry[] = [];
  const errors: unknown[] = [];
  let pauses = 0;
  const sync = createPositionSync({
    initial: [],
    save: (entry) => void writes.push(entry),
    retryWrites() {},
    readers: () => readers,
    attachmentOf: (r) => ({ lib: (r as Reader).lib, key: (r as Reader).key }),
    managerOf: (r) => r as Reader,
    savedPositionOf: (r) => (r as Reader).saved,
    onPauseOrStop: () => void pauses++,
    setTimeout: () => 0,
    clearTimeout() {},
    now: () => 1000,
    error: (e) => void errors.push(e),
  });
  return { sync, writes, errors, pauses: () => pauses, held: () => sync.entryOf(1, KEY) };
}

// The real sampler with multiple callers for the same attachment: neither a
// single-reader test nor a transport-only merge test reaches this bug (#206).
describe.each([false, true])('duplicate readers, reversed list: %s', (reversed) => {
  const ordered = (one: Reader, two: Reader) => reversed ? [two, one] : [one, two];

  it('records the speaking reader once, never the paused duplicate', () => {
    const speaking = reader(9);
    const paused = reader(1, { paused: true });
    const h = harness(ordered(speaking, paused));
    for (let pass = 0; pass < 3; pass++) h.sync.sample();
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.writes).toHaveLength(1);
    expect(h.pauses()).toBe(0);
    // A stale duplicate cannot take over when the speaking sentence is unchanged.
    paused.saved = position(2);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.writes).toHaveLength(1);
  });

  it('announces only real pauses and a disappearing speaker, with an idle duplicate present', () => {
    const speaking = reader(9);
    const idle = reader(1, { active: false, paused: true });
    const readers = ordered(speaking, idle);
    const h = harness(readers);
    for (let pass = 0; pass < 3; pass++) h.sync.sample();
    expect(h.pauses()).toBe(0);
    speaking.paused = true;
    h.sync.sample();
    h.sync.sample();
    expect(h.pauses()).toBe(1);
    speaking.paused = false;
    h.sync.sample();
    readers.splice(readers.indexOf(speaking), 1);
    h.sync.sample();
    h.sync.sample();
    expect(h.pauses()).toBe(2);
  });

  it('preserves a remote position while two paused readers do not move, then records a real paused skip', () => {
    const one = reader(1, { paused: true });
    const two = reader(9, { paused: true });
    const h = harness(ordered(one, two));
    h.sync.sample();
    expect(h.sync.adopt({ lib: 1, key: KEY, pos: point(40), ts: 1_000_000 })).toBe(true);
    const writes = h.writes.length;
    for (let pass = 0; pass < 3; pass++) h.sync.sample();
    expect(h.held()).toMatchObject({ pos: point(40), ts: 1_000_000 });
    expect(h.writes).toHaveLength(writes);
    one.saved = position(2);
    h.sync.sample();
    expect(h.held()).toMatchObject({ pos: point(2), ts: 1_000_001 });
    h.sync.sample();
    expect(h.writes).toHaveLength(writes + 1);
  });

  it('takes a newly speaking reader even when its previously paused sentence did not change', () => {
    const one = reader(9);
    const two = reader(1, { paused: true });
    const h = harness(ordered(one, two));
    h.sync.sample();
    one.paused = true;
    two.paused = false;
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(1));
    h.sync.sample();
    expect(h.writes).toHaveLength(2);
    expect(h.pauses()).toBe(1);
  });

  it('captures the closing speaker once and ignores its lingering state and the paused survivor', () => {
    const speaking = reader(9);
    const paused = reader(1, { paused: true });
    const readers = ordered(speaking, paused);
    const h = harness(readers);
    h.sync.sample();
    speaking.saved = position(10);
    h.sync.captureClose(speaking);
    // Both close hooks can fire, and teardown can leave active=true behind.
    speaking.saved = position(8);
    h.sync.captureClose(speaking);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(10));
    readers.splice(readers.indexOf(speaking), 1);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(10));
    expect(h.writes).toHaveLength(2);
    paused.saved = position(2);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(2));
  });

  it('does not let closing a never-played duplicate borrow another reader\'s session history', () => {
    const speaking = reader(9);
    const idle = reader(1, { active: false, paused: true });
    const h = harness(ordered(speaking, idle));
    h.sync.sample();
    h.sync.captureClose(idle);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.writes).toHaveLength(1);
    expect(h.pauses()).toBe(0);
  });

  it('does not let a stale paused close overwrite a speaking sibling', () => {
    const speaking = reader(9);
    const paused = reader(1, { paused: true });
    const h = harness(ordered(speaking, paused));
    h.sync.sample();
    paused.active = false;
    paused.saved = position(2);
    h.sync.captureClose(paused);
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.writes).toHaveLength(1);
  });

  it('uses the speaking reader for the final shutdown capture', () => {
    const speaking = reader(9);
    const paused = reader(1, { paused: true });
    const h = harness(ordered(speaking, paused));
    h.sync.start();
    h.sync.sample();
    speaking.saved = position(10);
    paused.active = false;
    paused.saved = position(2);
    h.sync.stop();
    expect(h.held()?.pos).toEqual(point(10));
    expect(h.writes).toHaveLength(2);
  });
});

describe('reader identity is separate from attachment identity', () => {
  it('does not promote a newly observed paused duplicate over an existing position', () => {
    const first = reader(9, { paused: true });
    const readers = [first];
    const h = harness(readers);
    h.sync.sample();
    readers.push(reader(1, { paused: true }));
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.writes).toHaveLength(1);
  });

  it('keeps an adopted position across duplicate close and shutdown without a new sentence', () => {
    const one = reader(1, { paused: true });
    const two = reader(9, { paused: true });
    const h = harness([one, two]);
    h.sync.start();
    h.sync.sample();
    h.sync.adopt({ lib: 1, key: KEY, pos: point(40), ts: 1_000_000 });
    const writes = h.writes.length;
    h.sync.captureClose(one);
    h.sync.stop();
    expect(h.held()?.pos).toEqual(point(40));
    expect(h.writes).toHaveLength(writes);
  });

  it('a reopened document has a new reader handle and can record normally', () => {
    const original = reader(9);
    const readers = [original];
    const h = harness(readers);
    h.sync.sample();
    h.sync.captureClose(original);
    readers.length = 0;
    h.sync.sample();
    // The late uninit backstop must not revive the old handle after it left the list.
    original.saved = position(1);
    h.sync.captureClose(original);
    expect(h.held()?.pos).toEqual(point(9));
    readers.push(reader(10));
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(10));
  });

  it('still suppresses every reader of a permanently removed attachment', () => {
    const readers = [reader(9), reader(1, { paused: true })];
    const h = harness(readers);
    h.sync.sample();
    h.sync.remove(1, KEY);
    readers[0].saved = position(10);
    readers[1].saved = position(2);
    h.sync.sample();
    h.sync.captureClose(readers[0]);
    expect(h.held()).toBeNull();
    expect(h.sync.adopt({ lib: 1, key: KEY, pos: point(40), ts: 1_000_000 })).toBe(false);
  });

  it('does not combine identical item keys from different libraries', () => {
    const h = harness([reader(9), reader(1, { lib: 2, paused: true })]);
    h.sync.sample();
    expect(h.held()?.pos).toEqual(point(9));
    expect(h.sync.entryOf(2, KEY)?.pos).toEqual(point(1));
    expect(h.writes).toHaveLength(2);
  });
});
