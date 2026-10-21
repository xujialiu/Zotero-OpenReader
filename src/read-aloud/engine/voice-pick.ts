/**
 * A voice picked while a document is read goes through the Handoff
 * (core/engine/handoff.ts) instead of restarting the sentence: the player's
 * voice dropdown and the voice keys (issues #95, #108). While it is pending
 * the Player shows the voice it is to (`pendingVoice`, issue #225), and its
 * notice names the voice reading beside it.
 *
 * The manager's `selectVoice` is shadowed on the manager itself. A pick is
 * first resolved the manager's own way as a dry run: `_applyVoice`,
 * `_persistCurrentVoice` and `_stateChanged` held back, the choice fields
 * put back after. The voice it comes to is then prepared by the Engine
 * while the old one reads on, and once the new voice has the reading the
 * pick is replayed for real (`commit`): the manager selects the voice,
 * remembers it, and its rebuild of the controller carries on in the Engine.
 *
 * An entry or language picked in the Player picks no voice (issue #224):
 * `choose` keeps it as a draft beside the manager, pauses a reading, and
 * calls a pending switch off. The manager keeps its voice, paused, and
 * refuses Play, Retry and a jump until a voice of the draft is picked; that
 * pick is a fresh selection, not a Handoff, so nothing is asked for before
 * Play and Play reads the paused sentence from its start. Until #224 those
 * two picks were `selectTier` and `setLanguage`, shadowed here into the
 * Handoff too (issue #110).
 *
 * While a switch is pending, the manager's calls that call it off —
 * deactivate, a speed change, the memory re-applied —
 * cancel it first, and the Player says so; and its `pause` and `play` go
 * through the Handoff,
 * which decides where the new voice starts on Play. A skip or a jump keeps
 * it: the Engine applies the switch's rule where the reading lands
 * (core/engine/handoff.ts, issue #163; until then a skip took the switch at
 * once, #154, and a jump called it off).
 *
 * What moved out, with read-aloud/voice-switch.ts: the second controller of
 * Read Aloud's the switch was prepared in, and the sixteen of its fields it
 * was driven through (ADR 0005).
 */

import type { HandoffReport, VoiceNotice } from '../../core/engine/handoff';
import { adjacentVoice, entryVoices, playerVoices } from '../../core/voice-switch';
import { baseLanguage } from '../language-dropdown';
import type { AnyFn } from '../proto-patches';
import type { Engine } from './index';

export type { VoiceNotice } from '../../core/engine/handoff';

/**
 * What the Player is told, beyond the Handoff's own: a switch called off by
 * something other than a pick (`called-off`, issue #225), a reading paused
 * for a voice to be chosen (`paused`) and Play refused for want of one
 * (`choose`, issue #224).
 */
export type VoicePickNotice = VoiceNotice | 'called-off' | 'paused' | 'choose';

/** An entry and a language picked in the Player, no voice chosen yet (issue #224); `locale` null is no language either. */
export interface VoiceChoice {
  tier: string;
  locale: string | null;
}

export interface VoicePickDeps {
  engine: Engine;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  /** `reading`, with `preparing`: the voice that reads while the new one is prepared. */
  notice(reader: unknown, kind: VoicePickNotice, label: string, reading?: string): void;
  error(error: unknown): void;
  debug?(message: string): void;
  /** An AbortController of the reader's window: the sandbox has none. */
  newAbortController?(reader: any): { signal: unknown; abort(): void } | null;
}

export interface VoicePickReport extends HandoffReport {
  controlsAttached: boolean;
  notice?: VoicePickNotice;
  /** The Player's entry and language with no voice chosen (issue #224). */
  draft?: VoiceChoice | null;
  /** Successful explicit picks that rebuilt an absent or ended session while paused. */
  recoveries?: number;
}

export interface VoicePick {
  attach(reader: unknown): boolean;
  detach(reader: unknown): void;
  /** Whether a pick of this reader is being resolved as a dry run (memory-sync holds back meanwhile). */
  isPreviewing(reader: unknown): boolean;
  /** The voice keys: the previous or next voice of the player's list. */
  step(reader: unknown, direction: -1 | 1): void;
  /** The memory layer's own cross-language restore, as the final selection of a switch. */
  defer(reader: unknown, voiceID: string, selection: () => void): boolean;
  inspect(reader: unknown): VoicePickReport | null;
  /** The voices a pending switch is between (the reading guard, issue #121). */
  protectedVoices(reader: unknown): string[];
  /** The voice a pending switch is to, which the Player shows (issue #225); null with none. */
  pendingVoice(reader: unknown): string | null;
  /** The Player's entry or language pick (issue #224): no voice, a reading paused; false with no manager. */
  choose(reader: unknown, choice: VoiceChoice): boolean;
  /** The entry and language picked with no voice chosen yet, or null. */
  draft(reader: unknown): VoiceChoice | null;
  /** Whether Play must wait for a voice to be chosen; true says so over the document. */
  needsVoice(reader: unknown): boolean;
  dispose(): void;
}

/** The manager's calls that call a pending switch off, before they run. */
/**
 * Not `clearSegments`: Zotero's restart from a selection clears the segments
 * and rebuilds the same sentences, and the Engine keeps the switch over it
 * (session.ts `bind`, issue #163); segments that change call it off there.
 */
const CANCELLING = ['deactivate', 'applyPersistedVoices', 'setSpeed'];

/** The manager fields a dry-run resolution may move, put back after it. */
const CHOICE_FIELDS = ['_voiceID', '_lang', '_region', '_selectedTier', '_persistedVoices', '_pendingSetVoice'] as const;

/**
 * The manager's calls that would read in the old voice while the Player has
 * none chosen (issue #224): refused, with a notice. Not `deactivate`, which
 * ends the draft (`draftOf`), nor the skips, which move the place paused.
 */
const NEED_A_VOICE = ['play', 'retry', 'jumpTo', 'repositionTo'];

export function createVoicePick(deps: VoicePickDeps): VoicePick {
  const reports = new WeakMap<object, VoicePickReport>();
  const attached = new Map<any, { manager: any; undo: (() => void)[] }>();
  /** Per reader, the shadows a pending switch put on the manager. */
  const pendingUndo = new Map<unknown, (() => void)[]>();
  const previewing = new Set<unknown>();
  /** Per reader, the Player's entry and language with no voice chosen, and the shadows that hold Play back (issue #224). */
  const drafts = new Map<unknown, { manager: any; choice: VoiceChoice; wasActive: boolean; undo: (() => void)[] }>();
  /** The switches called off by a pick of the user's, whose cancel the Player is not told of (issue #225). */
  const quiet = new WeakSet<object>();
  let propagating = 0;
  const select = (fn: () => void) => {
    propagating++;
    try {
      fn();
    } finally {
      propagating--;
    }
  };
  const waive = <T>(value: T): T => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const exported = (fn: AnyFn, target: object) => (deps.exportFunction ? deps.exportFunction(fn, target) : fn);
  const managerOf = (reader: any) => waive(reader?._internalReader?._readAloudManager);
  const label = (voice: any) => String(voice?.label ?? voice?.id ?? '');

  function reportOf(reader: unknown): VoicePickReport | null {
    return reader && typeof reader === 'object' ? (reports.get(reader) ?? null) : null;
  }

  function notice(reader: unknown, kind: VoicePickNotice, text: string, reading?: string): void {
    const report = reportOf(reader);
    if (report) report.notice = kind;
    try {
      if (reading === undefined) deps.notice(reader, kind, text);
      else deps.notice(reader, kind, text, reading);
    } catch (e) {
      deps.error(e);
    }
  }

  /** A switch called off by the user's own pick: its cancel clears the notice and says nothing more. */
  function quietly(handoff: { cancel(): void } | null | undefined): void {
    if (!handoff) return;
    quiet.add(handoff);
    handoff.cancel();
  }

  function snapshot(manager: any): () => void {
    const descriptors = CHOICE_FIELDS.map((key) => Object.getOwnPropertyDescriptor(manager, key));
    return () =>
      CHOICE_FIELDS.forEach((key, i) => {
        if (descriptors[i]) Object.defineProperty(manager, key, descriptors[i]!);
        else delete manager[key];
      });
  }

  /** An own-property shadow on the manager; the undo restores the descriptor, absence included. */
  function shadow(object: any, name: string, fn: AnyFn): () => void {
    const previous = Object.getOwnPropertyDescriptor(object, name);
    object[name] = exported(fn, object);
    return () => {
      if (deps.isDead?.(object)) return;
      if (previous) Object.defineProperty(object, name, previous);
      else delete object[name];
    };
  }

  function attach(reader: unknown): boolean {
    const manager = managerOf(reader);
    if (!manager) return false;
    if (attached.get(reader)?.manager === manager) return true;
    detach(reader);
    const undo: (() => void)[] = [];
    attached.set(reader, { manager, undo });
    if (reader && typeof reader === 'object') {
      reports.set(reader, {
        ...(reports.get(reader) ?? { pending: null, stage: 'idle', prepared: [], last: null, wordDecision: null, audioReady: [] }),
        controlsAttached: true,
      });
    }
    try {
      const original = manager.selectVoice;
      if (typeof original === 'function') {
        undo.push(
          shadow(manager, 'selectVoice', function (this: any, ...args: any[]) {
            if (propagating || previewing.has(reader)) return Reflect.apply(original, manager, args);
            // A voice for the entry and language picked with none (issue #224)
            if (draftOf(reader)) {
              pickFromDraft(reader, args[0]);
              return;
            }
            // A pick while paused keeps the paused handoff of issue #108
            if (!manager.active) return Reflect.apply(original, manager, args);
            const restore = snapshot(manager);
            const suppress: (() => void)[] = [];
            let choice: (() => void) | undefined;
            let id: string | undefined;
            previewing.add(reader);
            try {
              // Native resolution and the language memory choose; no controller,
              // persistence or UI sees this dry run
              for (const method of ['_applyVoice', '_persistCurrentVoice', '_stateChanged']) {
                suppress.push(shadow(manager, method, () => {}));
              }
              Reflect.apply(original, manager, args);
              id = manager.selectedVoiceID;
              choice = snapshot(manager);
            } finally {
              for (const put of suppress.reverse()) put();
              restore();
              previewing.delete(reader);
            }
            const target = playerVoices<any>(manager.allVoices).find((v) => v.id === id);
            if (!target) {
              notice(reader, 'unavailable', '');
              return;
            }
            const selection = () => {
              choice!();
              // The manager's own selection: the voice, the tier, the memory, and a rebuild that carries on
              Reflect.apply(manager.selectVoice, manager, [id]);
            };
            const session = deps.engine.session(reader);
            if (id === manager.selectedVoiceID && session && !session.ended) {
              // A re-pick of the voice reading calls a pending switch off and restarts nothing
              quietly(deps.engine.session(reader)?.handoff);
              select(selection);
              notice(reader, 'selected', label(target));
              return;
            }
            begin(reader, target, selection);
          }),
        );
      }
      return true;
    } catch (e) {
      detach(reader);
      deps.error(e);
      return false;
    }
  }

  /** Take a pending switch's shadows off the manager; with `only`, just when they are that switch's. */
  function unwindPending(reader: unknown, only?: (() => void)[]): void {
    if (only && pendingUndo.get(reader) !== only) return;
    for (const undo of (pendingUndo.get(reader) ?? []).reverse()) {
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    pendingUndo.delete(reader);
  }

  /** Prepare `target` to take the reading over; false when there is no reading to switch. */
  function begin(reader: any, target: any, selection: () => void): boolean {
    const manager = managerOf(reader);
    const session = deps.engine.session(reader);
    const existing = session?.handoff;
    if (existing && existing.target.id === target.id) {
      existing.retarget(() => select(selection));
      return true;
    }
    if (!manager?.active) return false;
    if (!manager.segments?.length) {
      quietly(existing);
      notice(reader, 'unavailable', label(target));
      return true;
    }
    if (target.segmentGranularity !== manager.segmentGranularity) {
      quietly(existing);
      deps.error(new Error('OpenReader: pause before switching between different segment granularities'));
      notice(reader, 'failed', label(target));
      return true;
    }
    if (!session || session.ended) {
      quietly(existing);
      unwindPending(reader);
      try {
        // An open player can outlive its session (#149). This is a fresh
        // explicit selection, not a handoff: pause before rebuilding so even
        // a stale "playing" manager fetches nothing until the user presses Play.
        Reflect.apply(manager.pause, manager, []);
        if (!session && !deps.engine.attach(reader)) {
          notice(reader, 'unavailable', label(target));
          return true;
        }
        select(selection);
        if (!deps.engine.bound(reader) || manager.selectedVoiceID !== target.id) {
          // Do not leave a native fallback ready to play after a failed recovery.
          Reflect.apply(manager._destroyController, manager, []);
          notice(reader, 'failed', label(target));
          return true;
        }
        const report = reportOf(reader);
        if (report) report.recoveries = (report.recoveries ?? 0) + 1;
        notice(reader, 'selected', label(target));
      } catch (e) {
        deps.error(e);
        notice(reader, 'failed', label(target));
      }
      return true;
    }
    unwindPending(reader);
    const originalVoice = manager.selectedVoiceID;
    const catalog = manager.allVoices;
    const last = reportOf(reader)?.last ?? null;
    const report: VoicePickReport = {
      controlsAttached: attached.has(reader),
      pending: String(target.id),
      stage: 'preparing',
      prepared: [],
      last,
      wordDecision: null,
      audioReady: [],
    };
    if (reader && typeof reader === 'object') reports.set(reader, report);
    let abort: { signal: unknown; abort(): void } | null = null;
    try {
      abort = deps.newAbortController?.(reader) ?? null;
    } catch (e) {
      deps.error(e);
    }
    const undo: (() => void)[] = [];
    // The voice that reads on meanwhile, named beside the new one (issue #225)
    const reading = label(playerVoices<any>(catalog).find((v) => v.id === originalVoice) ?? { id: originalVoice ?? '' });
    let committed = false;
    let self: object | null = null;
    // The pick it gives way to replaces it: no called-off notice
    if (existing) quiet.add(existing);
    const handoff = session.prepareHandoff({
      target: deps.engine.voiceOf(target),
      commit: () => {
        committed = true;
        unwindPending(reader, undo);
        select(selection);
        // A voice the manager does not take (not in the current tier's list) leaves no controller
        return deps.engine.bound(reader);
      },
      valid: () => !deps.isDead?.(manager) && manager.active && manager.selectedVoiceID === originalVoice && manager.allVoices === catalog,
      notice: (kind) => {
        if (kind === 'cancelled' || kind === 'failed') unwindPending(reader, undo);
        // Called off by a speed change, Stop, the memory or the voice list, not by a pick: the Player's voice goes back, and says why
        const calledOff = kind === 'cancelled' && !committed && !(self && quiet.has(self));
        if (kind === 'preparing') notice(reader, kind, label(target), reading);
        else notice(reader, calledOff ? 'called-off' : kind, label(target));
      },
      abort,
      report,
    });
    self = handoff;
    if (!handoff) {
      notice(reader, 'unavailable', label(target));
      return true;
    }
    // Manual actions call the switch off before they change playback
    pendingUndo.set(reader, undo);
    try {
      for (const name of CANCELLING) {
        const original = manager[name];
        if (typeof original !== 'function') continue;
        undo.push(
          shadow(manager, name, function (this: unknown, ...args: unknown[]) {
            handoff.cancel();
            return Reflect.apply(original, this, args);
          }),
        );
      }
      const pause = manager.pause;
      if (typeof pause === 'function') {
        undo.push(
          shadow(manager, 'pause', function (this: unknown, ...args: unknown[]) {
            let result: unknown;
            handoff.pause(() => {
              result = Reflect.apply(pause, manager, args);
            });
            return result;
          }),
        );
      }
      const play = manager.play;
      if (typeof play === 'function') {
        undo.push(
          shadow(manager, 'play', function (this: unknown, ...args: unknown[]) {
            let result: unknown;
            handoff.play(() => {
              result = Reflect.apply(play, manager, args);
            });
            return result;
          }),
        );
      }
    } catch (e) {
      handoff.fail(e);
    }
    return true;
  }

  // ---- An entry or language picked with no voice (issue #224) -----------------

  /** The reader's draft while it stands: dropped when its manager went, stopped reading, or lost the entry. */
  function draftOf(reader: unknown): VoiceChoice | null {
    const entry = drafts.get(reader);
    if (!entry) return null;
    let valid = false;
    try {
      const manager = managerOf(reader);
      if (manager && manager === entry.manager && !deps.isDead?.(manager)) {
        if (manager.active) entry.wasActive = true;
        valid = !(entry.wasActive && !manager.active) && entryVoices(manager.allVoices, entry.choice.tier).length > 0;
      }
    } catch (e) {
      deps.error(e);
    }
    if (valid) return entry.choice;
    clearDraft(reader);
    return null;
  }

  function clearDraft(reader: unknown): void {
    const entry = drafts.get(reader);
    if (!entry) return;
    drafts.delete(reader);
    for (const undo of entry.undo.reverse()) {
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    const report = reportOf(reader);
    if (report) report.draft = null;
  }

  function choose(reader: unknown, choice: VoiceChoice): boolean {
    try {
      attach(reader);
      const manager = managerOf(reader);
      if (!manager) return false;
      // A switch still being prepared gives way, its notice with it
      quietly(deps.engine.session(reader)?.handoff);
      unwindPending(reader);
      if (drafts.get(reader)?.manager !== manager) clearDraft(reader);
      const playing = !!manager.active && !manager.paused;
      let entry = drafts.get(reader);
      if (entry) entry.choice = { ...choice };
      else {
        entry = { manager, choice: { ...choice }, wasActive: !!manager.active, undo: [] };
        drafts.set(reader, entry);
        for (const name of NEED_A_VOICE) {
          const original = manager[name];
          if (typeof original !== 'function') continue;
          entry.undo.push(
            shadow(manager, name, function (this: unknown, ...args: unknown[]) {
              if (!draftOf(reader)) return Reflect.apply(original, this, args);
              notice(reader, 'choose', '');
              return undefined;
            }),
          );
        }
      }
      const report = reportOf(reader);
      if (report) report.draft = { ...choice };
      if (playing) {
        Reflect.apply(manager.pause, manager, []);
        notice(reader, 'paused', '');
      }
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function pickFromDraft(reader: unknown, id: unknown): void {
    const choice = draftOf(reader);
    const manager = managerOf(reader);
    const target = choice ? entryVoices<any>(manager.allVoices, choice.tier, choice.locale).find((v) => v.id === id) : null;
    if (!target) {
      notice(reader, 'unavailable', '');
      return;
    }
    commitDraft(reader, manager, target);
  }

  /**
   * A voice of the draft, selected afresh while paused: the entry and the
   * language go in with it, and `_applyVoice` rebuilds the controller at the
   * paused sentence, so nothing is asked for before Play and Play reads that
   * sentence from its start. An idle manager takes it through its own pick.
   */
  function commitDraft(reader: unknown, manager: any, target: any): void {
    clearDraft(reader);
    const locale = typeof target.language === 'string' ? target.language : '';
    const base = baseLanguage(locale);
    const region = locale.length > base.length ? locale.slice(base.length + 1) : null;
    const selection = () => {
      if (base) {
        manager._lang = base;
        manager._region = region;
      }
      if (typeof target.tier === 'string') manager._selectedTier = target.tier;
      Reflect.apply(manager.selectVoice, manager, [target.id]);
    };
    const active = !!manager.active;
    const session = deps.engine.session(reader);
    // An open player can outlive its session (#149): its recovery selects and rebuilds, paused
    if (active && (!session || session.ended)) {
      begin(reader, target, selection);
      return;
    }
    try {
      if (active && !manager.paused) Reflect.apply(manager.pause, manager, []);
      select(selection);
    } catch (e) {
      deps.error(e);
      notice(reader, 'failed', label(target));
      return;
    }
    if (active && (manager.selectedVoiceID !== target.id || !deps.engine.bound(reader))) {
      notice(reader, 'failed', label(target));
      return;
    }
    notice(reader, 'selected', label(target));
  }

  function step(reader: unknown, direction: -1 | 1): void {
    try {
      attach(reader);
      const manager = managerOf(reader);
      if (!manager?.active) return;
      const choice = draftOf(reader);
      if (choice) {
        // No voice chosen (issue #224): the first or the last of the draft's list
        const list = playerVoices<any>(entryVoices<any>(manager.allVoices, choice.tier, choice.locale));
        const voice = direction === 1 ? list[0] : list[list.length - 1];
        if (voice) commitDraft(reader, manager, voice);
        else notice(reader, 'choose', '');
        return;
      }
      const list = playerVoices<any>(manager.voicesForLanguage);
      const requested = deps.engine.session(reader)?.handoff?.target.id;
      const selected = list.some((v) => v.id === requested) ? requested! : manager.selectedVoiceID;
      const voice = adjacentVoice(list, selected, direction);
      if (!voice) {
        if (!list.some((v) => v.id === selected)) notice(reader, 'unavailable', '');
        return;
      }
      if (voice.id === manager.selectedVoiceID) {
        quietly(deps.engine.session(reader)?.handoff);
        notice(reader, 'selected', label(voice));
        return;
      }
      const selection = () => Reflect.apply(manager.selectVoice, manager, [voice.id]);
      if (!begin(reader, voice, selection)) {
        select(selection);
        notice(reader, 'selected', label(voice));
      }
    } catch (e) {
      deps.error(e);
      notice(reader, 'failed', '');
    }
  }

  function detach(reader: unknown): void {
    const handoff = deps.engine.session(reader)?.handoff;
    quietly(handoff);
    unwindPending(reader);
    clearDraft(reader);
    const entry = attached.get(reader);
    if (!entry) return;
    if (!handoff) notice(reader, 'cancelled', '');
    for (const undo of entry.undo.reverse()) {
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    attached.delete(reader);
    const report = reportOf(reader);
    if (report) report.controlsAttached = false;
  }

  return {
    attach,
    detach,
    isPreviewing: (reader) => previewing.has(reader),
    step,
    defer(reader, voiceID, selection) {
      if (!propagating) return false;
      const manager = managerOf(reader);
      if (!manager?.active) return false;
      const voice = playerVoices<any>(manager.allVoices).find((v) => v.id === voiceID);
      return voice ? begin(reader, voice, selection) : false;
    },
    inspect(reader) {
      const report = reportOf(reader);
      if (report) report.draft = draftOf(reader);
      return report;
    },
    protectedVoices(reader) {
      const handoff = deps.engine.session(reader)?.handoff;
      return handoff?.pending ? handoff.voices : [];
    },
    pendingVoice(reader) {
      const handoff = deps.engine.session(reader)?.handoff;
      return handoff?.pending ? String(handoff.target.id) : null;
    },
    choose,
    draft: (reader) => {
      const choice = draftOf(reader);
      return choice ? { ...choice } : null;
    },
    needsVoice(reader) {
      if (!draftOf(reader)) return false;
      notice(reader, 'choose', '');
      return true;
    },
    dispose() {
      for (const reader of [...attached.keys()]) detach(reader);
      for (const reader of [...pendingUndo.keys()]) unwindPending(reader);
      for (const reader of [...drafts.keys()]) clearDraft(reader);
    },
  };
}
