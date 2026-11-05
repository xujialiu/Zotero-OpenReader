/** Keep initial segment requests from consuming a one-shot start twice (#234). */
import { type AnyFn, createProtoPatches, type ProtoPatchDeps } from './proto-patches';
import { ownerOf } from './system-voices';

interface NativeReader {
  _readAloudManager?: { active: boolean; segments: unknown; segmentGranularity: unknown };
}

interface Preparation {
  pending: boolean;
  queued: boolean;
  result?: unknown;
  started: number;
  coalesced: number;
  retried: number;
}

export function createSegmentPreparation(deps: ProtoPatchDeps & { waiveXrays?<T>(value: T): T }) {
  const patches = createProtoPatches(deps);
  const states = new WeakMap<object, Preparation>();
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  let disposed = false;

  function run(self: NativeReader, receiver: unknown, original: AnyFn, args: unknown[], state: Preparation): unknown {
    // Set before calling native code: a voice update may synchronously reenter.
    state.pending = true;
    state.queued = false;
    state.started++;
    let result: unknown;
    try {
      result = Reflect.apply(original, receiver, args);
      state.result = result;
    } catch (error) {
      state.pending = false;
      state.queued = false;
      state.result = undefined;
      throw error;
    }
    void Promise.resolve(result).then(() => {
      state.pending = false;
      const queued = state.queued;
      state.queued = false;
      state.result = undefined;
      if (disposed || deps.isDead?.(self)) return;
      const manager = waive(self._readAloudManager);
      // Native code abandons a request when granularity changes during its
      // SDT wait. Closing/reopening can also clear segments just before this
      // continuation. Retry only an actually queued, still-unfulfilled start;
      // never recompute installed segments and consume the target a second time.
      if (queued && manager?.active && !manager.segments && manager.segmentGranularity) {
        state.retried++;
        run(self, receiver, original, args, state);
      }
    }, error => {
      state.pending = false;
      state.queued = false;
      state.result = undefined;
      if (!disposed && !deps.isDead?.(self)) deps.error(error);
    }).catch(deps.error);
    // Return the original reader-realm promise, never a sandbox promise.
    return result;
  }

  function attach(reader: { _internalReader?: NativeReader } | null): boolean {
    if (disposed) return false;
    try {
      const internal = waive(reader?._internalReader);
      const proto = internal && ownerOf(internal, '_requestReadAloudSegments');
      if (!proto) return false;
      patches.shadow(proto, '_requestReadAloudSegments', original => function (this: unknown, ...args: unknown[]) {
        const self = waive(this) as NativeReader;
        const manager = waive(self._readAloudManager);
        // Scope the guard to initial preparation. Selection changes and later
        // segment recomputation keep Zotero's native behavior.
        if (disposed || !manager?.active || manager.segments) return Reflect.apply(original, this, args);
        let state = states.get(self);
        if (!state) {
          state = { pending: false, queued: false, started: 0, coalesced: 0, retried: 0 };
          states.set(self, state);
        }
        if (state.pending) {
          state.queued = true;
          state.coalesced++;
          return state.result;
        }
        return run(self, this, original, args, state);
      });
      return true;
    } catch (error) { deps.error(error); return false; }
  }

  return {
    attach,
    inspect(reader: { _internalReader?: NativeReader } | null) {
      const internal = waive(reader?._internalReader);
      if (!internal) return null;
      const proto = ownerOf(internal, '_requestReadAloudSegments');
      const state = states.get(internal);
      return {
        patched: !!proto && patches.has(proto, '_requestReadAloudSegments'),
        pending: state?.pending ?? false,
        started: state?.started ?? 0,
        coalesced: state?.coalesced ?? 0,
        retried: state?.retried ?? 0,
      };
    },
    patchCounts: patches.counts,
    dispose() { disposed = true; patches.restoreAll(); },
  };
}
