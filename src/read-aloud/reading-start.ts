import { isPlayerOpen } from './player-stop';
import type { AnyFn, ProtoPatchDeps } from './proto-patches';
import type { VoiceChoice } from './read-aloud-memory';
import { decodeVoiceId, type CatalogSource, type VoiceCatalogSnapshot } from './voice-catalog';

export type StartProblem =
  | { kind: 'no-voice' }
  | { kind: 'unavailable'; id: string }
  | { kind: 'key' | 'unreachable' | 'timeout'; source: CatalogSource };

export const voiceSource = (id: string): CatalogSource => decodeVoiceId(id)?.provider ?? 'zotero';

/** A failed listing says nothing about whether the Provider removed this voice. */
export function listingProblem(snapshot: VoiceCatalogSnapshot | null, source: CatalogSource): StartProblem | null {
  if (snapshot?.sources[source] !== 'failed') return null;
  return { kind: source !== 'zotero' && snapshot.rejectedKeys.includes(source) ? 'key' : 'unreachable', source };
}

interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
interface ReadingStartDeps extends ProtoPatchDeps {
  waiveXrays?<T>(value: T): T;
  cloneForReader?(reader: unknown, value: object): unknown;
  ownsCatalog(reader: unknown): boolean;
  choice(reader: unknown): VoiceChoice | null;
  catalog(reader: unknown): VoiceCatalogSnapshot | null;
  readers(): readonly unknown[];
  cancelResume?(reader: unknown): void;
  resuming?(reader: unknown): boolean;
  report(reader: unknown, problem: StartProblem): void;
  timeoutMs?: number;
  clock?: Clock;
}

/** A Play is permission for one document, one voice and one initial position. */
export function createReadingStart(deps: ReadingStartDeps) {
  type Entry = { internal: any; undo: (() => void)[]; captured?: { position: unknown }; error?: StartProblem };
  type Attempt = { reader: unknown; choice: VoiceChoice; armed: boolean; delayed: boolean; timer?: unknown };
  const entries = new Map<unknown, Entry>();
  const clock: Clock = deps.clock ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  let pending: Attempt | null = null;
  let latest: { reader: unknown; token: number } | null = null;
  let sequence = 0;
  let continuing: unknown = null;
  let disposed = false;

  function retire(): void {
    const attempt = pending;
    pending = null;
    if (attempt?.timer != null) clock.clearTimeout(attempt.timer);
  }

  function cancel(reader: unknown): void {
    if (pending?.reader === reader) retire();
    if (latest?.reader === reader) latest = null;
    deps.cancelResume?.(reader);
  }

  function fail(reader: unknown, problem: StartProblem): void {
    cancel(reader);
    const entry = entries.get(reader);
    if (entry) entry.error = problem;
    deps.report(reader, problem);
  }

  function takeOver(reader: unknown): number {
    retire();
    const token = ++sequence;
    latest = { reader, token };
    const entry = entries.get(reader);
    if (entry) delete entry.error;
    for (const other of deps.readers()) if (other !== reader) {
      try {
        deps.cancelResume?.(other);
        const manager = (other as any)?._internalReader?._readAloudManager;
        if (manager?.active && !manager.paused) manager.pause();
      } catch (error) { deps.error(error); }
    }
    return token;
  }

  function reserve(reader: unknown): number {
    const token = takeOver(reader);
    const choice = deps.choice(reader);
    if (!choice) return token;
    const attempt: Attempt = { reader, choice: { ...choice }, armed: false, delayed: false };
    pending = attempt;
    attempt.timer = clock.setTimeout(() => {
      if (pending === attempt) fail(reader, { kind: 'timeout', source: voiceSource(choice.id) });
    }, deps.timeoutMs ?? 30_000);
    return token;
  }

  function readiness(attempt: Attempt): 'ready' | 'waiting' | StartProblem {
    const snapshot = deps.catalog(attempt.reader);
    if (snapshot?.offered.some(voice => voice.id === attempt.choice.id)) return 'ready';
    const source = voiceSource(attempt.choice.id);
    if (!snapshot || snapshot.sources[source] === 'loading') return 'waiting';
    return listingProblem(snapshot, source) ?? { kind: 'unavailable', id: attempt.choice.id };
  }

  function sameVoice(attempt: Attempt, choice: VoiceChoice | null): boolean {
    return !!choice && attempt.choice.id === choice.id && attempt.choice.lang === choice.lang;
  }

  function catalogChanged(reader: unknown): void {
    const attempt = pending;
    if (!attempt || attempt.reader !== reader || !attempt.armed) return;
    if (!sameVoice(attempt, deps.choice(reader))) { cancel(reader); return; }
    const state = readiness(attempt);
    if (typeof state !== 'string') fail(reader, state);
  }

  /** Called only for an inactive manager's activation. Publication itself does not grant it. */
  function mayActivate(reader: unknown, choice: VoiceChoice | null): boolean {
    const attempt = pending;
    const entry = entries.get(reader);
    if (!entry || !attempt?.armed || attempt.reader !== reader || !sameVoice(attempt, choice)
      || readiness(attempt) !== 'ready') return false;
    const manager = entry.internal._readAloudManager;
    if (manager.selectedVoiceID !== attempt.choice.id || !manager._voice) return false;
    if (attempt.delayed) entry.captured = { position: manager.targetPosition ?? null };
    retire();
    return true;
  }

  function attach(reader: any): boolean {
    if (disposed || !deps.ownsCatalog(reader)) return false;
    const internal = waive(reader?._internalReader);
    if (typeof internal?.startReadAloudAtPosition !== 'function') return false;
    const previous = entries.get(reader);
    if (previous?.internal === internal) return true;
    if (previous) detach(reader);
    const entry: Entry = { internal, undo: [] };
    entries.set(reader, entry);
    function shadow(target: any, name: string, wrap: (original: AnyFn, self: unknown, args: unknown[]) => unknown) {
      const original = target?.[name];
      if (typeof original !== 'function') return;
      const own = Object.getOwnPropertyDescriptor(target, name);
      const call = function(this: unknown, ...args: unknown[]) { return wrap(original, this, args); };
      const hook = deps.exportFunction ? deps.exportFunction(call, target) : call;
      target[name] = hook;
      entry.undo.push(() => {
        if (deps.isDead?.(target) || target[name] !== hook) return;
        if (own) Object.defineProperty(target, name, own);
        else delete target[name];
      });
    }
    shadow(internal, 'startReadAloudAtPosition', (original, self, args) => {
      const manager = internal._readAloudManager;
      if (internal._enableReadAloud === false) return Reflect.apply(original, self, args);
      if (manager?.active) {
        if (continuing !== reader) takeOver(reader);
        return Reflect.apply(original, self, args);
      }
      if (!pending || pending.reader !== reader || pending.armed) reserve(reader);
      const attempt = pending;
      delete entry.captured;
      if (attempt) {
        attempt.delayed = readiness(attempt) !== 'ready';
        attempt.armed = true;
      }
      if (internal._state?.readAloudFirstRunPopup) internal._updateState?.(deps.cloneForReader?.(reader, { readAloudFirstRunPopup: false }) ?? { readAloudFirstRunPopup: false });
      const result = Reflect.apply(original, self, args);
      if (!attempt) fail(reader, { kind: 'no-voice' });
      else {
        catalogChanged(reader);
        // Reusing a ready catalog need not emit a new voice-list update.
        if (pending === attempt && readiness(attempt) === 'ready') manager?._stateChanged?.();
      }
      return result;
    });
    shadow(internal, 'toggleReadAloudPopup', (original, self, args) => {
      const opening = args[0] === undefined ? !isPlayerOpen(reader) : !!args[0];
      if (opening && !internal._readAloudManager?.active && internal._enableReadAloud !== false) {
        return Reflect.apply(internal.startReadAloudAtPosition, self, []);
      }
      if (!opening) { cancel(reader); delete entry.captured; delete entry.error; }
      return Reflect.apply(original, self, args);
    });
    shadow(internal, 'toggleReadAloudPaused', (original, self, args) => {
      const manager = internal._readAloudManager;
      if (manager?.active && manager.paused && args[0] !== true && !deps.resuming?.(reader)) takeOver(reader);
      return Reflect.apply(original, self, args);
    });
    shadow(waive(internal._readAloudManager), 'play', (original, self, args) => {
      // The hidden native media element can report a late 'playing' after we
      // have paused this reader. An explicit Player command takes over above.
      if (pending && pending.reader !== reader && internal._readAloudManager.paused) return;
      return Reflect.apply(original, self, args);
    });
    shadow(internal, '_captureReadAloudStart', (original, self, args) => {
      const captured = entry.captured;
      if (!captured) return Reflect.apply(original, self, args);
      delete entry.captured;
      internal._readAloudManager.consumeTargetPosition();
      return captured.position;
    });
    return true;
  }

  function detach(reader: unknown): void {
    cancel(reader);
    const entry = entries.get(reader);
    entries.delete(reader);
    for (const undo of entry?.undo.reverse() ?? []) {
      try { undo(); } catch (error) { deps.error(error); }
    }
  }

  return {
    attach, detach, cancel, catalogChanged, mayActivate,
    /** Reserve before an asynchronous reading-position lookup so a newer Play can supersede it. */
    prepare(reader: unknown): void { if (attach(reader)) reserve(reader); },
    /** A position pull belonging to an already accepted Play is not a new user action. */
    continueAt(reader: unknown, start: () => void): void {
      const previous = continuing;
      continuing = reader;
      try { start(); } finally { continuing = previous; }
    },
    token(reader: unknown): number | null { return latest && latest.reader === reader ? latest.token : null; },
    current(reader: unknown, token: number | null): boolean {
      return !disposed && (token === null ? !deps.ownsCatalog(reader) : !!latest && latest.reader === reader && latest.token === token);
    },
    waiting(reader: unknown): CatalogSource | null {
      return pending && pending.reader === reader && pending.armed && readiness(pending) === 'waiting' ? voiceSource(pending.choice.id) : null;
    },
    error: (reader: unknown) => entries.get(reader)?.error ?? null,
    clearError(reader: unknown) { const entry = entries.get(reader); if (entry) delete entry.error; },
    dispose() { disposed = true; retire(); latest = null; for (const reader of [...entries.keys()]) detach(reader); },
  };
}
