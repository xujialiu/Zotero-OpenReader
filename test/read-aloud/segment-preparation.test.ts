import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createSegmentPreparation } from '../../src/read-aloud/segment-preparation';
import { loadZoteroReadAloud, voicesResponse } from './engine/zotero';

const source = readFileSync(new URL('../fixtures/engine/read-aloud-start-10.0.7.js', import.meta.url), 'utf8');
const target = { index: 7 };
const saved = { index: 1 };
const sdt = { structure: {} };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function setup(patched = true) {
  let release!: (value: typeof sdt | null) => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<typeof sdt | null>((yes, no) => { release = yes; reject = no; });
  const build = vi.fn(() => ({ segments: Array.from({ length: 12 }, (_, index) => ({ index })) }));
  const Reader = new Function('sdt_segments_getSDTLang', 'sdt_segments_buildSDTReadAloudSegments', `${source}\nreturn NativeStartReader;`)(() => 'en', build);
  const internal = new Reader();
  const requests: unknown[] = [];
  const { ReadAloudManager } = loadZoteroReadAloud();
  const manager = new ReadAloudManager({
    remoteInterface: { getVoices: async () => ({ voices: voicesResponse(['system::test']) }) },
    onStateChange() {}, onSetVoice() {},
    onRequestSegments: () => requests.push(internal._requestReadAloudSegments()),
  });
  // Keep the native manager's apply/activate/setSegments paths; audio and
  // document analysis are separate dependencies, not part of this race.
  const starts: number[] = [];
  manager._createController = () => starts.push(manager._backwardStopIndex);
  await manager.loadVoices(true);
  manager.setLanguage('en');
  internal._readAloudManager = manager;
  internal._loadSDT = vi.fn(() => ready);
  internal._state = { readAloudState: { savedPosition: saved } };
  internal._lastView = { getSelectionPosition: vi.fn(() => null), clearSelection: vi.fn() };
  internal._activePrimaryView = { isPositionNearView: () => true };
  internal._findReadAloudStartIndex = (_segments: unknown, position: { index: number }) => position.index;
  internal._findFirstVisibleSegmentIndex = () => 0;
  internal._materializeSourcePositions = vi.fn();
  const consume = vi.spyOn(manager, 'consumeTargetPosition');
  const reader = { _internalReader: internal };
  let dead = false;
  const error = vi.fn();
  const patch = createSegmentPreparation({ error, isDead: () => dead });
  if (patched) patch.attach(reader);
  const start = () => { manager.setTargetPosition(target); manager.activate(); };
  return { internal, manager, reader, patch, error, release, reject, ready, requests, starts, consume, build, start, die: () => { dead = true; } };
}

describe('overlapping native segment preparation (#234)', () => {
  it('control: native persisted-voice refresh consumes the target twice and overwrites its index', async () => {
    const f = await setup(false);
    f.start();
    f.manager.applyPersistedVoices({});
    f.release(sdt);
    await flush();
    expect(f.starts).toEqual([7, 1]);
    expect(f.consume).toHaveBeenCalledTimes(2);
  });

  it('does not consume the explicit target twice when persisted voices refresh during the SDT wait', async () => {
    const f = await setup();
    f.start();
    f.manager.applyPersistedVoices({});
    f.release(sdt);
    await flush();
    expect(f.starts).toEqual([7]);
    expect(f.consume).toHaveBeenCalledOnce();
    expect(f.patch.inspect(f.reader)).toMatchObject({ patched: true, pending: false, coalesced: 1 });
  });

  it('coalesces synchronous reentry while the first native call is being invoked', async () => {
    const f = await setup();
    let injected = false;
    f.internal._loadSDT.mockImplementation(() => {
      if (!injected) { injected = true; f.manager.applyPersistedVoices({}); }
      return f.ready;
    });
    f.start(); f.release(sdt); await flush();
    expect(f.starts).toEqual([7]);
    expect(f.internal._loadSDT).toHaveBeenCalledOnce();
  });

  it('returns the original native promise for coalesced callers', async () => {
    const f = await setup();
    f.start(); f.manager.applyPersistedVoices({});
    expect(f.requests[0]).toBe(f.requests[1]);
    f.release(sdt); await flush();
  });

  it('clears the pending marker after a synchronous native-boundary failure', async () => {
    const f = await setup(false);
    const proto = Object.getPrototypeOf(f.internal);
    const native = proto._requestReadAloudSegments;
    let fail = true;
    proto._requestReadAloudSegments = function (...args: unknown[]) {
      if (fail) throw new Error('boundary failure');
      return Reflect.apply(native, this, args);
    };
    f.patch.attach(f.reader);
    expect(() => f.start()).toThrow('boundary failure');
    expect(f.patch.inspect(f.reader)).toMatchObject({ pending: false });
    fail = false;
    f.internal._requestReadAloudSegments(); f.release(sdt); await flush();
    expect(f.starts).toEqual([7]);
  });

  it('keeps ordinary later recomputation native rather than remembering a stale target', async () => {
    const f = await setup();
    f.start(); f.release(sdt); await flush();
    await f.internal._requestReadAloudSegments(); await flush();
    expect(f.starts).toEqual([7, 1]);
  });

  it('retries a queued request when a new granularity invalidates the pending one', async () => {
    const f = await setup();
    f.start();
    f.manager._segmentGranularity = 'paragraph';
    f.internal._requestReadAloudSegments();
    f.release(sdt); await flush();
    expect(f.starts).toEqual([7]);
    expect(f.build).toHaveBeenCalledOnce();
    expect(f.build.mock.calls[0]).toEqual([sdt.structure, 'paragraph', 'en']);
    expect(f.patch.inspect(f.reader)).toMatchObject({ retried: 1, pending: false });
  });

  it('uses the newest target when the player closes and reopens during the same SDT wait', async () => {
    const f = await setup();
    f.start(); f.manager.deactivate();
    f.manager.setTargetPosition({ index: 10 }); f.manager.activate();
    f.release(sdt); await flush();
    expect(f.starts).toEqual([10]);
    expect(f.consume).toHaveBeenCalledOnce();
  });

  it('does not lose a reopen after native completion but before the pending marker clears', async () => {
    const f = await setup();
    f.start();
    // Resolving the gate schedules native completion first; this continuation
    // reopens before the wrapper's completion handler runs.
    void f.ready.then(() => {
      f.manager.deactivate();
      f.manager.setTargetPosition({ index: 10 }); f.manager.activate();
    });
    f.release(sdt); await flush();
    expect(f.starts).toEqual([7, 10]);
    expect(f.patch.inspect(f.reader)).toMatchObject({ retried: 1 });
  });

  it('does not retry a closed session', async () => {
    const f = await setup();
    f.start(); f.manager.applyPersistedVoices({}); f.manager.deactivate();
    f.release(sdt); await flush();
    expect(f.starts).toEqual([]);
    expect(f.internal._loadSDT).toHaveBeenCalledOnce();
  });

  it('does not starve a retry after a rejected request', async () => {
    const f = await setup();
    f.start(); f.manager.applyPersistedVoices({});
    const failure = new Error('SDT failed'); f.reject(failure); await flush();
    expect(f.error).toHaveBeenCalledWith(failure);
    expect(f.patch.inspect(f.reader)).toMatchObject({ pending: false });
    f.internal._loadSDT.mockResolvedValue(sdt);
    await f.internal._requestReadAloudSegments(); await flush();
    expect(f.starts).toEqual([7]);
  });

  it('keeps pending state per reader even when instances share a prototype', async () => {
    const f = await setup();
    const other = Object.assign(Object.create(Object.getPrototypeOf(f.internal)), f.internal);
    other._loadSDT = vi.fn(async () => null);
    f.start(); await other._requestReadAloudSegments(); await flush();
    expect(other._loadSDT).toHaveBeenCalledOnce();
    expect(f.patch.inspect(f.reader)).toMatchObject({ pending: true });
    f.release(sdt); await flush();
  });

  it.each(['dispose', 'dead'])('does not launch a queued retry after %s', async (how) => {
    const f = await setup();
    const original = Object.getPrototypeOf(f.internal)._requestReadAloudSegments;
    f.start(); f.manager._segmentGranularity = 'paragraph'; f.internal._requestReadAloudSegments();
    if (how === 'dispose') f.patch.dispose(); else f.die();
    f.release(sdt); await flush();
    expect(f.internal._loadSDT).toHaveBeenCalledOnce();
    if (how === 'dispose') expect(Object.getPrototypeOf(f.internal)._requestReadAloudSegments).not.toBe(original);
  });

  it('attaches idempotently and leaves readers without the native method alone', async () => {
    const f = await setup();
    expect(f.patch.attach({})).toBe(false);
    f.patch.attach(f.reader);
    expect(f.patch.patchCounts()).toEqual({ total: 1, live: 1 });
    f.start(); f.release(sdt); await flush();
    expect(f.starts).toEqual([7]);
  });
});
