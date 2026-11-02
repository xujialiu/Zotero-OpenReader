import type { HandoffReport } from '../core/engine/handoff';
import type { EngineSession } from '../core/engine/session';
import type { EngineClip } from '../core/engine/types';

/**
 * A replacement edit reaching a reading in progress (issue #237): which of
 * the sentences the session holds or is reading now have a different
 * speech text under the rows in effect, and the session's own answer to
 * that (core/engine/session.ts `refreshText`): ask again ahead, or hand the
 * sentence being read over like a voice switch.
 *
 * A clip still on its way counts as changed: it was asked for before the
 * edit, and asking again for the same text is shared with it by the
 * interface (the single flight of the same audio).
 */

export type RefreshOutcome = 'none' | 'dropped' | 'handoff';

export interface RefreshRecord {
  outcome: RefreshOutcome;
  changed: number[];
  at: number;
  report: HandoffReport;
}

export interface ReplacementRefreshDeps {
  session(reader: unknown): EngineSession<EngineClip> | null;
  /** The text a voice would be given for `text` now: replacements and bracket removal applied. */
  speechText(reader: unknown, text: string): Promise<string> | string;
  now?(): number;
  log?(e: unknown): void;
  debug?(message: string): void;
}

export function createReplacementRefresh(deps: ReplacementRefreshDeps) {
  const records = new WeakMap<object, RefreshRecord>();
  const now = deps.now ?? (() => Date.now());

  async function refresh(reader: unknown): Promise<RefreshOutcome> {
    const session = deps.session(reader);
    const store = session?.store;
    const segments = session?.segments;
    if (!session || session.ended || !store || !segments) return 'none';
    const changed = new Set<number>();
    try {
      const indices = new Set<number>([session.position, ...store.clips.keys(), ...store.inflight.keys()]);
      for (const index of [...indices].sort((a, b) => a - b)) {
        if (store.inflight.has(index)) {
          changed.add(index);
          continue;
        }
        const segment = segments[index];
        if (!segment) continue;
        const speech = await deps.speechText(reader, String(segment.text));
        if (store.speech.get(index) !== speech) changed.add(index);
      }
    } catch (e) {
      // A tab closed while the worker answered: nothing to refresh
      deps.log?.(e);
      return 'none';
    }
    // The reading moved on or ended meanwhile: what it asks for from here has the new text anyway
    if (deps.session(reader) !== session || session.store !== store || session.ended) return 'none';
    const report: HandoffReport = { pending: null, stage: 'none', prepared: [], last: null, wordDecision: null, audioReady: [] };
    const outcome = session.refreshText(changed, report);
    if (reader && typeof reader === 'object') records.set(reader, { outcome, changed: [...changed], at: now(), report });
    deps.debug?.(`replacements edited: ${outcome}${changed.size ? `, sentences ${[...changed].join(', ')}` : ''}`);
    return outcome;
  }

  return {
    refresh,
    /** The reader's last refresh, for diagnostics.replacements(). */
    last(reader: unknown): RefreshRecord | null {
      return reader && typeof reader === 'object' ? records.get(reader) ?? null : null;
    },
  };
}

export type ReplacementRefresh = ReturnType<typeof createReplacementRefresh>;
