import { describe, expect, it, vi } from 'vitest';
import { createDaemon, MAX_STARTS, type DaemonProcess } from '../../../../src/core/providers/system/daemon';
import { listSystemVoiceRecords } from '../../../../src/core/providers/system';
import type { SystemVoiceRecord } from '../../../../src/core/providers/system/protocol';
import { runConnectionCheck } from '../../../../src/ui/prefs-pane';
import { decodeFrameBody, decodeFrameLength, type SystemResponse } from '../../../../src/core/providers/system/protocol';

/**
 * A helper process on two byte queues. `read(length)` resolves only once
 * that many bytes are there, exactly as Subprocess's pipe does, so the
 * framing in protocol.ts is exercised for real rather than mocked away.
 */
function fakeProcess() {
  let out: number[] = [];
  const waiting: { length: number; resolve(bytes: Uint8Array): void; reject(e: unknown): void }[] = [];
  const written: unknown[] = [];
  let closed: Error | null = null;
  let killed = 0;

  const pump = () => {
    while (waiting.length && out.length >= waiting[0].length) {
      const next = waiting.shift()!;
      next.resolve(new Uint8Array(out.splice(0, next.length)));
    }
    if (closed) for (const w of waiting.splice(0)) w.reject(closed);
  };

  const process: DaemonProcess = {
    write: async (bytes) => {
      const length = decodeFrameLength(bytes.slice(0, 4));
      written.push(JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + length))));
    },
    read: (length) =>
      new Promise<Uint8Array>((resolve, reject) => {
        waiting.push({ length, resolve, reject });
        pump();
      }),
    kill: () => {
      killed += 1;
      closed = new Error('killed');
      pump();
    },
  };

  return {
    process,
    written,
    killed: () => killed,
    /** Queue one reply, framed the way the helper frames it. */
    reply(response: SystemResponse | Record<string, unknown>) {
      const body = new TextEncoder().encode(JSON.stringify(response));
      const head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, body.length, true);
      out = [...out, ...head, ...body];
      pump();
    },
    /** Half a header, to prove a partial read is not mistaken for a message. */
    raw(bytes: number[]) {
      out = [...out, ...bytes];
      pump();
    },
    die() {
      closed = new Error('the helper exited');
      pump();
    },
  };
}

const HELLO = { id: 0, ok: true, ready: true };

/** Polls fast: the default interval is 50 ms, long enough to outlast a deliberately short deadline. */
const until = (check: () => void) => vi.waitFor(check, { interval: 1, timeout: 2000 });

/**
 * A rejection has to be claimed on the tick it happens, or Node reports it
 * unhandled while the test is still setting up. So every test that expects
 * one attaches its assertion here, before anything is awaited.
 */
const rejects = (promise: Promise<unknown>, pattern: RegExp) => expect(promise).rejects.toThrow(pattern);

function setup(options: { spawn?: () => Promise<DaemonProcess>; timeoutMs?: number } = {}) {
  const fake = fakeProcess();
  const spawn = vi.fn(options.spawn ?? (async () => fake.process));
  const debug = vi.fn((_m: string) => {});
  const daemon = createDaemon({ spawn, timeoutMs: options.timeoutMs ?? 5000, debug, log: () => {} });
  return { fake, spawn, debug, daemon };
}

describe('createDaemon', () => {
  it('starts nothing until the first request, then waits for the handshake before sending', async () => {
    const t = setup();
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.daemon.state()).toMatchObject({ running: false, starts: 0, sent: 0 });

    const pending = t.daemon.send({ op: 'voices' });
    await Promise.resolve();
    expect(t.fake.written).toEqual([]);

    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toEqual([{ id: 1, op: 'voices' }]));
    t.fake.reply({ id: 1, ok: true, voices: [] });
    await expect(pending).resolves.toMatchObject({ id: 1, ok: true });
    expect(t.daemon.state()).toMatchObject({ running: true, starts: 1, sent: 1, queued: 0 });
    // The Windows backend, with word marks from both APIs (backend.ts)
    expect(t.daemon.platform).toBe('win');
    expect(t.daemon.wordTimestamps).toBe(true);
  });

  it('refuses to start when the helper cannot be spawned, and says why', async () => {
    const t = setup({ spawn: async () => Promise.reject(new Error('Executable not found')) });
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/Cannot start the Windows speech helper: Executable not found/);
    expect(t.daemon.state()).toMatchObject({ running: false, starts: 1 });
  });

  it('treats a first message that is not the handshake as a failed start and kills the process', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /handshake/);
    t.fake.reply({ id: 0, ok: true });
    await asserted;
    expect(t.fake.killed()).toBe(1);
  });

  it('gives up after MAX_STARTS and repeats the last reason, rather than spawning a process per sentence', async () => {
    const t = setup({ spawn: async () => Promise.reject(new Error('blocked by policy')) });
    for (let i = 0; i < MAX_STARTS; i++) await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/blocked by policy/);
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS);
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/failed to start 3 times: blocked by policy/);
    // Still three: the fourth request never reached spawn
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS);
    t.daemon.reset();
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/blocked by policy/);
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS + 1);
  });

  it('runs requests one at a time, in order, however many are asked for at once', async () => {
    const t = setup();
    const a = t.daemon.send({ op: 'ping' });
    const b = t.daemon.send({ op: 'voices' });
    const c = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);

    await until(() => expect(t.fake.written).toHaveLength(1));
    expect(t.daemon.state().queued).toBe(3);
    t.fake.reply({ id: 1, ok: true });
    await until(() => expect(t.fake.written).toHaveLength(2));
    t.fake.reply({ id: 2, ok: true, voices: [] });
    await until(() => expect(t.fake.written).toHaveLength(3));
    t.fake.reply({ id: 3, ok: true });

    await expect(Promise.all([a, b, c])).resolves.toHaveLength(3);
    expect(t.fake.written.map((w: any) => w.id)).toEqual([1, 2, 3]);
    // One start for the three of them
    expect(t.spawn).toHaveBeenCalledTimes(1);
  });

  it('keeps the helper when it reports an error: it answered in step and can take the next request', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'speak', voice: 'sapi5/nope', text: 'x', file: 'f' }), /no such voice: nope/);
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 1, ok: false, error: 'no such voice: nope' });
    await asserted;
    expect(t.daemon.state()).toMatchObject({ running: true, sent: 1 });
    expect(t.fake.killed()).toBe(0);

    const second = t.daemon.send({ op: 'ping' });
    await until(() => expect(t.fake.written).toHaveLength(2));
    t.fake.reply({ id: 2, ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it('drops the helper when it answers the wrong request: the stream is out of step', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /answered request 99 while 1 was in flight/);
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 99, ok: true });
    await asserted;
    expect(t.daemon.state().running).toBe(false);
    expect(t.fake.killed()).toBe(1);
  });

  it('kills a helper that misses its deadline, rather than waiting for a reply that would land on the next request', async () => {
    const t = setup({ timeoutMs: 20 });
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /did not answer within/);
    t.fake.reply(HELLO);
    await asserted;
    expect(t.fake.written).toEqual([{ id: 1, op: 'ping' }]);
    expect(t.fake.killed()).toBe(1);
    expect(t.daemon.state()).toMatchObject({ running: false, lastError: expect.stringMatching(/did not answer/) });
  });

  it('starts a new helper for the next request after one dies mid-session', async () => {
    const first = fakeProcess();
    const second = fakeProcess();
    const spawn = vi.fn(async () => (spawn.mock.calls.length === 1 ? first.process : second.process));
    const daemon = createDaemon({ spawn, timeoutMs: 5000 });

    const asserted = rejects(daemon.send({ op: 'ping' }), /speech helper failed/);
    first.reply(HELLO);
    await until(() => expect(first.written).toHaveLength(1));
    first.die();
    await asserted;
    expect(daemon.state().running).toBe(false);

    const b = daemon.send({ op: 'ping' });
    second.reply(HELLO);
    await until(() => expect(second.written).toEqual([{ id: 2, op: 'ping' }]));
    second.reply({ id: 2, ok: true });
    await expect(b).resolves.toMatchObject({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('waits for a whole frame: a half-written header is not a message', async () => {
    const t = setup();
    const pending = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    const body = new TextEncoder().encode(JSON.stringify({ id: 1, ok: true }));
    const head = new Uint8Array(4);
    new DataView(head.buffer).setUint32(0, body.length, true);
    t.fake.raw([head[0], head[1]]);
    await new Promise((r) => setTimeout(r, 5));
    expect(t.daemon.state().sent).toBe(0);
    t.fake.raw([head[2], head[3], ...body]);
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('stops on demand and starts again on the next request', async () => {
    const t = setup();
    const a = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 1, ok: true });
    await a;
    t.daemon.stop();
    expect(t.fake.killed()).toBe(1);
    expect(t.daemon.state().running).toBe(false);
    // The budget is untouched, so a later request may still start one — and
    // this fake is closed, so the handshake fails at once
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow();
    expect(t.spawn).toHaveBeenCalledTimes(2);
  });

  // Issue #191: a request queued before stop() used to start a fresh helper
  // right behind the kill, one nothing held any more, so a powershell.exe
  // outlived the plugin until Zotero exited
  it('ends the requests queued before stop() without starting a helper for them', async () => {
    const t = setup();
    const a = rejects(t.daemon.send({ op: 'speak', voice: 'onecore/X', text: 'one', file: 'a' }), /speech helper failed|shutting down/);
    const b = rejects(t.daemon.send({ op: 'speak', voice: 'onecore/X', text: 'two', file: 'b' }), /shutting down/);
    const c = rejects(t.daemon.send({ op: 'speak', voice: 'onecore/X', text: 'three', file: 'c' }), /shutting down/);
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));

    t.daemon.stop();
    await Promise.all([a, b, c]);
    expect(t.spawn).toHaveBeenCalledTimes(1);
    expect(t.fake.written).toHaveLength(1);
    expect(t.daemon.state()).toMatchObject({ running: false, queued: 0 });
  });

  it('kills a helper whose start stop() overtook, rather than keeping it on a stopped daemon', async () => {
    let started!: (p: DaemonProcess) => void;
    const t = setup({ spawn: () => new Promise<DaemonProcess>((resolve) => (started = resolve)) });
    const a = rejects(t.daemon.send({ op: 'ping' }), /shutting down/);
    await until(() => expect(t.spawn).toHaveBeenCalledTimes(1));

    t.daemon.stop();
    started(t.fake.process);
    await a;
    expect(t.fake.killed()).toBe(1);
    expect(t.daemon.state().running).toBe(false);
  });

  it('kills a helper stop() overtook during its handshake', async () => {
    const t = setup();
    const a = rejects(t.daemon.send({ op: 'ping' }), /shutting down/);
    await until(() => expect(t.spawn).toHaveBeenCalledTimes(1));

    t.daemon.stop();
    t.fake.reply(HELLO);
    await a;
    expect(t.fake.killed()).toBe(1);
    expect(t.fake.written).toEqual([]);
    expect(t.daemon.state().running).toBe(false);
  });

  it('still serves a request sent after stop(), with a helper of its own', async () => {
    const t = setup();
    const queued = rejects(t.daemon.send({ op: 'ping' }), /shutting down/);
    t.daemon.stop();
    await queued;
    // The queued request never reached spawn
    expect(t.spawn).not.toHaveBeenCalled();

    const after = t.daemon.send({ op: 'ping' });
    await until(() => expect(t.spawn).toHaveBeenCalledTimes(1));
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: (t.fake.written[0] as { id: number }).id, ok: true });
    await expect(after).resolves.toMatchObject({ ok: true });
  });

  it('frames what it writes so the helper can read it back', async () => {
    const t = setup();
    const pending = t.daemon.send({ op: 'speak', voice: 'onecore/X', text: '朗读', file: 'C:\\a.wav' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    expect(t.fake.written[0]).toEqual({ id: 1, op: 'speak', voice: 'onecore/X', text: '朗读', file: 'C:\\a.wav' });
    t.fake.reply({ id: 1, ok: true, ms: 900, words: [{ t: 10, c: 0, n: 2 }] });
    await expect(pending).resolves.toMatchObject({ ms: 900 });
  });
});

describe('refreshing the installed Windows voices (#241)', () => {
  const david: SystemVoiceRecord = { id: 'sapi5/TTS_MS_EN-US_DAVID_11.0', name: 'Microsoft David Desktop', desc: 'Microsoft David Desktop', lang: 'en-US' };
  const andrew: SystemVoiceRecord = { id: 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1', name: 'Microsoft Andrew', desc: 'Microsoft Andrew (Natural HD)', lang: 'en-US' };

  /** Each helper holds the snapshot System.Speech takes when that process first lists voices. */
  function voiceProcess(voices: SystemVoiceRecord[]) {
    const fake = fakeProcess();
    const write = fake.process.write;
    fake.process.write = async (bytes) => {
      await write(bytes);
      const request = JSON.parse(new TextDecoder().decode(bytes.slice(4)));
      fake.reply(request.op === 'voices'
        ? { id: request.id, ok: true, voices }
        : { id: request.id, ok: true, ms: 1000, words: [{ t: 10, c: 0, n: 4 }] });
    };
    fake.reply(HELLO);
    return fake;
  }

  function changingVoices(first = voiceProcess([david])) {
    const fresh = voiceProcess([david, andrew]);
    const spawn = vi.fn(async () => spawn.mock.calls.length === 1 ? first.process : fresh.process);
    const daemon = createDaemon({ spawn, timeoutMs: 1000 });
    return { first, fresh, spawn, daemon, list: () => listSystemVoiceRecords({ backend: daemon, tempFile: async () => '', readFile: async () => new Uint8Array(), removeFile: async () => {} }) };
  }

  it('Test connection replaces an old process snapshot and reports the newly installed voice', async () => {
    const t = changingVoices();
    expect(await t.list()).toEqual([david]);
    const result = await runConnectionCheck({ get: () => undefined, set: () => {} }, 'system', {
      fetch: async () => { throw new Error('No network request is needed'); },
      getWebSocket: () => { throw new Error('No WebSocket is needed'); },
      newRequestId: () => 'unused',
      system: { backend: t.daemon, tempFile: async () => 'probe.wav', readFile: async () => new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), removeFile: async () => {} },
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 voices available');
    expect(await t.list()).toEqual([david, andrew]);
    expect(t.first.killed()).toBe(1);
    expect(t.spawn).toHaveBeenCalledTimes(2);
    // Listing twice and probing during the check, and later discovery, reuse this fresh helper.
    expect(t.fresh.killed()).toBe(0);
    expect(t.daemon.state()).toMatchObject({ starts: 1, lastError: null, queued: 0 });
    t.daemon.stop();
  });

  it('finishes in-flight and already queued synthesis before replacing the helper', async () => {
    const first = fakeProcess();
    const t = changingVoices(first);
    const one = t.daemon.send({ op: 'speak', voice: david.id, text: 'one', file: 'one.wav' });
    const two = t.daemon.send({ op: 'speak', voice: david.id, text: 'two', file: 'two.wav' });
    first.reply(HELLO);
    await until(() => expect(first.written).toHaveLength(1));
    t.daemon.reset();
    const listed = t.list();
    expect(first.killed()).toBe(0);
    expect(t.spawn).toHaveBeenCalledTimes(1);
    first.reply({ id: 1, ok: true, ms: 100 });
    await until(() => expect(first.written).toHaveLength(2));
    expect(first.killed()).toBe(0);
    first.reply({ id: 2, ok: true, ms: 200 });
    await expect(one).resolves.toMatchObject({ ms: 100 });
    await expect(two).resolves.toMatchObject({ ms: 200 });
    await expect(listed).resolves.toEqual([david, andrew]);
    expect(first.written).toHaveLength(2);
    expect(first.killed()).toBe(1);
    expect(t.spawn).toHaveBeenCalledTimes(2);
    t.daemon.stop();
  });

  it('does not interrupt a helper still starting when reset is requested', async () => {
    const first = fakeProcess();
    const t = changingVoices(first);
    const before = t.daemon.send({ op: 'ping' });
    await until(() => expect(t.spawn).toHaveBeenCalledTimes(1));
    t.daemon.reset();
    const listed = t.list();
    expect(first.killed()).toBe(0);
    first.reply(HELLO);
    await until(() => expect(first.written).toHaveLength(1));
    first.reply({ id: 1, ok: true });
    await expect(before).resolves.toMatchObject({ ok: true });
    await expect(listed).resolves.toEqual([david, andrew]);
    expect(first.killed()).toBe(1);
    t.daemon.stop();
  });

  it('refreshes after an earlier request fails, and clears its last error', async () => {
    const first = fakeProcess();
    const t = changingVoices(first);
    const before = rejects(t.daemon.send({ op: 'ping' }), /old voice failed/);
    first.reply(HELLO);
    await until(() => expect(first.written).toHaveLength(1));
    t.daemon.reset();
    const listed = t.list();
    first.reply({ id: 1, ok: false, error: 'old voice failed' });
    await before;
    await expect(listed).resolves.toEqual([david, andrew]);
    expect(t.daemon.state()).toMatchObject({ starts: 1, lastError: null, queued: 0 });
    t.daemon.stop();
  });

  it('leaves a newer helper alone when shutdown overtakes a queued reset', async () => {
    const first = fakeProcess();
    const fresh = voiceProcess([david, andrew]);
    let finishStart!: (process: DaemonProcess) => void;
    const spawn = vi.fn(async () => spawn.mock.calls.length === 1
      ? new Promise<DaemonProcess>(resolve => { finishStart = resolve; })
      : fresh.process);
    const daemon = createDaemon({ spawn, timeoutMs: 1000 });
    const before = rejects(daemon.send({ op: 'ping' }), /shutting down/);
    await until(() => expect(spawn).toHaveBeenCalledTimes(1));
    daemon.reset();
    daemon.stop();
    const after = daemon.send({ op: 'voices' });
    await expect(after).resolves.toMatchObject({ voices: [david, andrew] });
    finishStart(first.process);
    await before;
    // Await the old queue's refresh callback too, not just the rejected request.
    await Promise.resolve();
    await Promise.resolve();
    expect(first.killed()).toBe(1);
    expect(fresh.killed()).toBe(0);
    expect(daemon.state()).toMatchObject({ running: true, starts: 2 });
    await expect(daemon.send({ op: 'ping' })).resolves.toMatchObject({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(2);
    daemon.stop();
  });

  it('keeps repeated resets lazy and starts only one helper for the next request', async () => {
    const t = changingVoices();
    t.daemon.reset();
    t.daemon.reset();
    t.daemon.reset();
    await Promise.resolve();
    expect(t.spawn).not.toHaveBeenCalled();
    await expect(t.list()).resolves.toEqual([david]);
    expect(t.spawn).toHaveBeenCalledTimes(1);
    t.daemon.stop();
  });
});

describe('the fake process itself', () => {
  it('frames replies the way the client decodes them', () => {
    const body = new TextEncoder().encode('{"id":1,"ok":true}');
    expect(decodeFrameBody(body)).toEqual({ id: 1, ok: true });
  });
});
