import { describe, expect, it } from 'vitest';
import { findReplacements, type Replacement } from '../../src/core/replacements';
import { createReplacementRunner, type WorkerLike } from '../../src/read-aloud/replacement-runner';

const exact = (text: string, readAs: string): Replacement => ({ text, readAs, mode: 'exact', matchCase: true });
const regex = (text: string, readAs: string): Replacement => ({ text, readAs, mode: 'regex', matchCase: true });

/**
 * A worker that runs the same passes, one message at a time, and hangs in a
 * row whose pattern contains "SLOW", the way a backtracking pattern hangs
 * the real one: it has said which row it started, and says nothing more.
 */
class FakeWorker implements WorkerLike {
  static made: FakeWorker[] = [];
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  jobs = 0;
  constructor(private readonly broken = false) {
    FakeWorker.made.push(this);
    queueMicrotask(() => (broken ? this.onerror?.({ message: 'failed to load' }) : this.reply({ type: 'ready' })));
  }
  private reply(data: unknown) {
    if (!this.terminated) this.onmessage?.({ data });
  }
  postMessage(job: any) {
    this.jobs++;
    queueMicrotask(() => {
      let hung = false;
      const result = findReplacements(job.text, job.rows, {
        skip: new Set(job.skip),
        onRow: (row) => {
          if (hung) return;
          this.reply({ type: 'row', id: job.id, row });
          if (job.rows[row].text.includes('SLOW')) hung = true;
        },
      });
      if (!hung) this.reply({ type: 'done', id: job.id, spans: result.spans });
    });
  }
  terminate() {
    this.terminated = true;
  }
}

function setup(options: { broken?: boolean } = {}) {
  FakeWorker.made = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const runner = createReplacementRunner({
    createWorker: () => new FakeWorker(options.broken),
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer: any) => {
      if (timer) timer.cleared = true;
    },
    limitMs: 250,
  });
  /** Let the worker's messages land, then fire every timer still armed. */
  const expire = async () => {
    await flush();
    for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn();
    await flush();
  };
  return { runner, timers, expire };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the replacement runner (ADR 0024)', () => {
  it('runs a list of exact rows on the spot, with no worker', () => {
    const s = setup();
    const result = s.runner.run('IL-6 rose', [exact('IL-6', 'interleukin six')]);
    expect(result).toEqual({ spans: [{ from: 0, to: 4, text: 'interleukin six', row: 0 }], skipped: [] });
    expect(FakeWorker.made).toHaveLength(0);
  });

  it('runs a list with a pattern in one worker, kept for the next sentences', async () => {
    const s = setup();
    const rows = [regex('IL-(\\d+)', 'interleukin $1')];
    const first = await s.runner.run('IL-6 rose', rows);
    const second = await s.runner.run('IL-7 fell', rows);
    expect(first.spans[0].text).toBe('interleukin 6');
    expect(second.spans[0].text).toBe('interleukin 7');
    expect(FakeWorker.made).toHaveLength(1);
    expect(s.timers.every((t) => t.ms === 250)).toBe(true);
  });

  it('answers sentences asked for together, in turn', async () => {
    const s = setup();
    const rows = [regex('(\\d+)', '<$1>')];
    const [a, b] = await Promise.all([s.runner.run('1 a', rows), s.runner.run('2 b', rows)]);
    expect([a.spans[0].text, b.spans[0].text]).toEqual(['<1>', '<2>']);
    expect(FakeWorker.made[0].jobs).toBe(2);
  });

  it('skips a row that runs out of time for that sentence, in a new worker, and says which', async () => {
    const s = setup();
    const rows = [exact('IL', 'I L'), regex('SLOW(a+)+$', 'x'), regex('rose', 'went up')];
    const pending = s.runner.run('IL rose', rows);
    await s.expire();
    const result = await pending;
    expect(result.skipped).toEqual([1]);
    expect(result.timedOut).toEqual([1]);
    expect(result.spans.map((span) => span.text)).toEqual(['I L', 'went up']);
    expect(FakeWorker.made[0].terminated).toBe(true);
    expect(FakeWorker.made).toHaveLength(2);
    expect(s.runner.report()).toMatchObject({ timeouts: 1, lastSkipped: [1] });
  });

  it('does not hold a skip over to the next sentence', async () => {
    const s = setup();
    const rows = [regex('SLOW', 'x'), regex('rose', 'went up')];
    const first = s.runner.run('rose', rows);
    await s.expire();
    expect((await first).skipped).toEqual([0]);
    const second = s.runner.run('rose', rows);
    await s.expire();
    expect((await second).skipped).toEqual([0]);
    expect(s.runner.report().timeouts).toBe(2);
  });

  it('applies the exact rows alone when no worker can start, and says which rows it could not run', async () => {
    const s = setup({ broken: true });
    const rows = [exact('IL', 'I L'), regex('rose', 'went up')];
    const result = await s.runner.run('IL rose', rows);
    expect(result).toEqual({ spans: [{ from: 0, to: 2, text: 'I L', row: 0 }], skipped: [1] });
    expect(result.timedOut).toBeUndefined();
  });

  it('answers what is pending with the exact rows when disposed', async () => {
    const s = setup();
    const rows = [exact('IL', 'I L'), regex('SLOW', 'x')];
    const pending = s.runner.run('IL', rows);
    await flush();
    s.runner.dispose();
    expect(await pending).toEqual({ spans: [{ from: 0, to: 2, text: 'I L', row: 0 }], skipped: [1] });
    expect(FakeWorker.made[0].terminated).toBe(true);
  });
});
