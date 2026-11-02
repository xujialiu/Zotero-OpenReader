import { findReplacements } from '../core/replacements';

/**
 * The replacement passes off the main thread (ADR 0024,
 * read-aloud/replacement-runner.ts): one job at a time, saying which
 * wildcard or pattern row it starts, so a row that never ends is known.
 */
declare const self: { postMessage(message: unknown): void; onmessage: ((event: { data: any }) => void) | null };

self.onmessage = (event) => {
  const { id, text, rows, skip } = event.data ?? {};
  try {
    const { spans } = findReplacements(String(text), rows, {
      skip: new Set<number>(skip),
      onRow: (row) => self.postMessage({ type: 'row', id, row }),
    });
    self.postMessage({ type: 'done', id, spans });
  } catch (e) {
    self.postMessage({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
};

self.postMessage({ type: 'ready' });
