import { findReplacements, needsWorker, type ReplacedSpan, type Replacement } from '../core/replacements';

/**
 * Runs a Segment's replacement rows (issue #237) where a pattern cannot
 * freeze Zotero (ADR 0024): Zotero lets chrome code run unbounded
 * (`dom.max_chrome_script_run_time` 0), so a backtracking regular
 * expression on the main thread would hang it. A list with a
 * regular-expression row runs in one worker, one Segment at a time, under a
 * time limit; a list of exact rows runs on the spot.
 *
 * The worker says which row it starts before each pattern row.
 * When the limit passes, the worker is terminated, a new one started, and
 * the Segment run again without the row it was in. The skip holds for that
 * Segment only: a pattern slow on one sentence still serves the others.
 */

export const REPLACEMENT_LIMIT_MS = 250;

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: any }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface ReplacementRunnerDeps {
  createWorker(): WorkerLike;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  limitMs?: number;
  log?(e: unknown): void;
  debug?(message: string): void;
}

export interface RunResult {
  spans: ReplacedSpan[];
  /** Rows set aside for this Segment: they ran out of time, or no worker could run them. */
  skipped: number[];
  /** Of those, the rows that ran out of time on it: what the Player reports. */
  timedOut?: number[];
}

export interface RunnerReport {
  workers: number;
  jobs: number;
  timeouts: number;
  failures: number;
  lastMs: number | null;
  lastSkipped: number[];
  queued: number;
}

interface Job {
  id: number;
  text: string;
  rows: Replacement[];
  skip: Set<number>;
  resolve(result: RunResult): void;
  /** The last pattern row the worker said it started. */
  row: number | null;
  started: number;
  timedOut: number[];
}

const patternRows = (rows: readonly Replacement[]): number[] => rows.flatMap((row, i) => (row.mode === 'regex' ? [i] : []));

export function createReplacementRunner(deps: ReplacementRunnerDeps) {
  const limit = deps.limitMs ?? REPLACEMENT_LIMIT_MS;
  let worker: WorkerLike | null = null;
  let ready = false;
  let broken = false;
  let disposed = false;
  let current: Job | null = null;
  let timer: unknown = null;
  let nextId = 1;
  const queue: Job[] = [];
  const report: RunnerReport = { workers: 0, jobs: 0, timeouts: 0, failures: 0, lastMs: null, lastSkipped: [], queued: 0 };

  /** What can be done without a worker: the exact rows, every other row skipped. */
  function exactOnly(job: Pick<Job, 'text' | 'rows' | 'skip'> & { timedOut?: number[] }): RunResult {
    const skip = new Set([...job.skip, ...patternRows(job.rows)]);
    const result: RunResult = { spans: findReplacements(job.text, job.rows, { skip }).spans, skipped: [...skip].sort((a, b) => a - b) };
    if (job.timedOut?.length) result.timedOut = [...job.timedOut];
    return result;
  }

  function finish(job: Job, result: RunResult): void {
    report.lastMs = Date.now() - job.started;
    report.lastSkipped = result.skipped;
    job.resolve(result);
  }

  function stopTimer(): void {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
  }

  function dropWorker(): void {
    stopTimer();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try { worker.terminate(); } catch (e) { deps.log?.(e); }
    }
    worker = null;
    ready = false;
  }

  function startWorker(): void {
    let made: WorkerLike;
    try {
      made = deps.createWorker();
    } catch (e) {
      deps.log?.(e);
      fail();
      return;
    }
    worker = made;
    report.workers++;
    made.onmessage = (event) => receive(made, event.data);
    made.onerror = (event) => {
      if (worker !== made) return;
      deps.log?.(event);
      fail();
    };
  }

  /** No worker will run: what is waiting gets the exact rows alone, and so does every later Segment. */
  function fail(): void {
    report.failures++;
    broken = true;
    dropWorker();
    const waiting = [...(current ? [current] : []), ...queue.splice(0)];
    current = null;
    for (const job of waiting) finish(job, exactOnly(job));
  }

  function receive(from: WorkerLike, data: any): void {
    if (from !== worker || !data || typeof data !== 'object') return;
    if (data.type === 'ready') {
      ready = true;
      pump();
      return;
    }
    const job = current;
    if (!job || data.id !== job.id) return;
    if (data.type === 'row' && typeof data.row === 'number') {
      job.row = data.row;
      return;
    }
    if (data.type === 'done' && Array.isArray(data.spans)) {
      stopTimer();
      current = null;
      const result: RunResult = { spans: data.spans as ReplacedSpan[], skipped: [...job.skip].sort((a, b) => a - b) };
      if (job.timedOut.length) result.timedOut = [...job.timedOut];
      finish(job, result);
      pump();
      return;
    }
    if (data.type === 'error') {
      // A throw inside the passes: this Segment gets the exact rows alone
      deps.log?.(new Error('replacements worker: ' + String(data.message)));
      stopTimer();
      current = null;
      finish(job, exactOnly(job));
      pump();
    }
  }

  function post(job: Job): void {
    current = job;
    job.row = null;
    report.jobs++;
    worker!.postMessage({ id: job.id, text: job.text, rows: job.rows, skip: [...job.skip] });
    timer = deps.setTimeout(() => expire(job), limit);
  }

  /** The worker is stuck in a row: a new worker runs the Segment again without it. */
  function expire(job: Job): void {
    timer = null;
    if (current !== job) return;
    report.timeouts++;
    const remaining = patternRows(job.rows).filter((row) => !job.skip.has(row));
    const row = job.row ?? remaining[0];
    deps.debug?.(`replacements: row ${row} ran out of ${limit} ms on ${job.text.length} chars; skipped for this sentence`);
    if (row !== undefined) {
      job.skip.add(row);
      job.timedOut.push(row);
    }
    current = null;
    dropWorker();
    if (!patternRows(job.rows).some((r) => !job.skip.has(r))) {
      finish(job, exactOnly(job));
    } else {
      queue.unshift(job);
    }
    pump();
  }

  function pump(): void {
    if (disposed || current) return;
    if (broken) {
      for (const job of queue.splice(0)) finish(job, exactOnly(job));
      return;
    }
    if (!queue.length) return;
    if (!worker) {
      startWorker();
      if (!worker) return;
    }
    if (!ready) return;
    post(queue.shift()!);
  }

  return {
    /** The spans of `text` under `rows`: at once for exact rows, else the worker's answer. */
    run(text: string, rows: readonly Replacement[]): RunResult | Promise<RunResult> {
      const list = [...rows];
      if (!needsWorker(list)) {
        const spans = findReplacements(text, list).spans;
        return { spans, skipped: [] };
      }
      if (disposed || broken) return exactOnly({ text, rows: list, skip: new Set() });
      return new Promise<RunResult>((resolve) => {
        queue.push({ id: nextId++, text, rows: list, skip: new Set(), resolve, row: null, started: Date.now(), timedOut: [] });
        pump();
      });
    },
    report(): RunnerReport {
      return { ...report, lastSkipped: [...report.lastSkipped], queued: queue.length + (current ? 1 : 0) };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const waiting = [...(current ? [current] : []), ...queue.splice(0)];
      current = null;
      dropWorker();
      for (const job of waiting) finish(job, exactOnly(job));
    },
  };
}

export type ReplacementRunner = ReturnType<typeof createReplacementRunner>;
