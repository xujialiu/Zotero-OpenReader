import { withTimeout } from '../core/timeout';
import type { AnyFn } from './proto-patches';
import { isPlayerOpen } from './player-stop';
import type { Engine } from './engine';
import type { RemoteInterface } from './remote-interface';
import { decodeVoiceId, type VoiceCatalogSnapshot } from './voice-catalog';

interface LiveVoiceListDeps {
  readers(): readonly any[];
  /** A plain object in the reader compartment. Native loadVoices only needs
   * _options and its two completion callbacks (reader.js:82310-82322). */
  stage(reader: any): any;
  /** Opens a reader of a plugin voice id's tier, once per walk and never per voice (provider-tiers.ts, issue #125). */
  voiceTiers(): (id: string) => string | null;
  protectedVoices(reader: any): readonly string[];
  /**
   * Whether the reader's voices come through the plugin's interface. Such a
   * list is asked for signed out too: Zotero asks for its remote list only
   * with a Zotero account signed in (`loadVoices(this._state.loggedIn)`,
   * reader.js:84271), and every voice of the plugin's providers — none of
   * which needs an account — travels in it (issue #130). The interface
   * itself leaves Zotero's own voices out while signed out
   * (remote-interface.ts signedIn). Any other reader keeps Zotero's flag.
   */
  ownsInterface(reader: any): boolean;
  /** Neither enumeration nor promotion to a playable voice waits on Zotero's aggregate loader. */
  source?(reader: any): RemoteInterface | undefined;
  engine?(): Engine | null;
  savedVoice?(reader: any): string | null;
  catalogChanged?(reader: any, catalog: VoiceCatalogSnapshot): void;
  ended?(reader: any): void;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  promise?(reader: any, job: Promise<void>): any;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  error(error: unknown): void;
}

/** Discover on a separate receiver, then publish choices without touching
 * the active controller, voice, position, or persisted selection (#121). */
export function createLiveVoiceList(deps: LiveVoiceListDeps) {
  type Entry = { reader: any; manager: any; original: AnyFn; hook: AnyFn;
    revision: number; applied: number; loading: number; retained: number; undoEnd?: () => void;
    /** The last load: what Zotero asked for, and whether the remote list was loaded. */
    asked: boolean | null; remote: boolean | null; catalog?: VoiceCatalogSnapshot; appliedRevision?: number };
  const entries = new Map<any, Entry>();
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const exported = (fn: AnyFn, target: object) => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  let disposed = false;

  async function load(entry: Entry, asked: boolean, force = false): Promise<void> {
    // A Play in an already open Player can use what this discovery has offered.
    // Restart only for changed settings/account or a new attempt after a failure.
    const wanted: string | null = deps.savedVoice?.(entry.reader) ?? entry.manager.selectedVoiceID;
    if (!force && entry.catalog && asked === entry.asked && (wanted
      ? entry.catalog.sources[decodeVoiceId(wanted)?.provider ?? 'zotero'] === 'loading'
        || entry.catalog.offered.some(voice => voice.id === wanted)
      : entry.loading > 0)) return;
    const revision = ++entry.revision;
    entry.loading++;
    try {
      const remote = asked || deps.ownsInterface(entry.reader);
      entry.asked = asked;
      entry.remote = remote;
      const m = entry.manager;
      const source = deps.ownsInterface(entry.reader) ? deps.source?.(entry.reader) : undefined;
      const engine = source && deps.engine?.();
      const live = () => !disposed && revision === entry.revision && !deps.isDead?.(m) && isPlayerOpen(entry.reader);
      if (source && engine) {
        await source.discoverVoices(catalog => {
          if (!live()) return;
          const list = engine.catalogVoices(entry.reader, catalog);
          if (!list) return;
          entry.catalog = catalog;
          publish(entry, list, !!catalog.zotero?.devMode);
        });
        return;
      }
      const stage = waive(deps.stage(entry.reader));
      stage._options = m._options;
      stage._resolveVoice = exported(() => {}, stage);
      stage._stateChanged = exported(() => {}, stage);
      await withTimeout(Promise.resolve(Reflect.apply(entry.original, stage, [remote])), 45_000,
        () => new Error('OpenReader: voice list refresh timed out'));
      if (!live()) return;
      const list = stage._allVoices;
      // Once for the walk, never per voice (issue #125)
      const tierOf = deps.voiceTiers();
      // Walk native arrays by index; their callbacks cannot enter the sandbox.
      for (let i = list.length - 1; i >= 0; i--) {
        const voice = list[i], tier = tierOf(String(voice.id));
        if (tier && voice.impl) voice.impl.tier = tier;
        else if (!tier && voice.tier === 'local') Reflect.apply(list.splice, list, [i, 1]);
      }
      publish(entry, list, stage._devMode);
    } catch (error) {
      if (!disposed && !deps.isDead?.(entry.manager)) deps.error(error);
    } finally { entry.loading--; }
  }

  function publish(entry: Entry, list: any[], devMode: boolean): void {
    const m = entry.manager;
    let retained = 0;
    if (m.active) {
      const old = m._allVoices;
      const protectedIds = new Set(deps.protectedVoices(entry.reader));
      if (m._voice?.id) protectedIds.add(m._voice.id);
      for (const id of protectedIds) {
        let original: any = m._voice?.id === id ? m._voice : null;
        for (let i = 0; !original && i < old.length; i++) if (old[i].id === id) original = old[i];
        if (!original) continue;
        let at = -1;
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === id && list[i].language === original.language) { at = i; break; }
        }
        if (entry.catalog && original.provider?.remote) original.provider.remote = m._options.remoteInterface;
        if (at < 0) { Reflect.apply(list.push, list, [original]); retained++; }
        else list[at] = original;
      }
      // A prepared handoff holds this catalog by identity. Keep it and
      // both voice objects while publishing unrelated choices.
      Reflect.apply(old.splice, old, [0, old.length]);
      for (let i = 0; i < list.length; i++) Reflect.apply(old.push, old, [list[i]]);
    } else m._allVoices = list;
    m._devMode = devMode;
    if (entry.catalog) deps.catalogChanged?.(entry.reader, entry.catalog);
    if (!m.active) Reflect.apply(m._resolveVoice, m, []);
    Reflect.apply(m._stateChanged, m, []);
    if (entry.appliedRevision !== entry.revision) {
      entry.appliedRevision = entry.revision;
      entry.applied++;
    }
    entry.retained = retained;
  }

  /**
   * Zotero's own method, from the manager's class: Zotero never sets either
   * one on the manager itself (reader.js:82310), so whatever is there is a
   * hook — an earlier instance's, when the tab stayed open across an update.
   * Taken for Zotero's own, that one never fills the stage (issue #131).
   */
  function native(manager: any, name: string): AnyFn | null {
    for (let proto = Object.getPrototypeOf(manager); proto; proto = Object.getPrototypeOf(proto)) {
      const own = Object.getOwnPropertyDescriptor(proto, name);
      if (own) return typeof own.value === 'function' ? own.value : null;
    }
    return null;
  }

  function attach(reader: any): boolean {
    if (disposed || entries.has(reader)) return !disposed;
    const manager = waive(reader?._internalReader?._readAloudManager);
    const original = manager && native(manager, 'loadVoices');
    if (!original) return false;
    const entry: Entry = { reader, manager, original,
      hook: original, revision: 0, applied: 0, loading: 0, retained: 0, asked: null, remote: null };
    entry.hook = exported((asked: boolean) => {
      const job = load(entry, asked);
      return deps.promise ? deps.promise(reader, job) : job;
    }, manager);
    manager.loadVoices = entry.hook;
    const inner = native(manager, 'deactivate');
    if (inner) {
      const hook = exported(function (this: unknown, ...args: unknown[]) {
        const result = Reflect.apply(inner, this, args);
        entry.revision++;
        delete entry.catalog;
        void Promise.resolve().then(() => { if (!disposed) deps.ended?.(reader); }).catch(deps.error);
        return result;
      }, manager);
      manager.deactivate = hook;
      entry.undoEnd = () => {
        // Delete, never restore what was found: that is how a leftover hook
        // was carried to the next version (issue #131)
        if (waive(manager.deactivate) === waive(hook)) delete manager.deactivate;
      };
    }
    entries.set(reader, entry);
    return true;
  }

  async function refresh(): Promise<void> {
    await Promise.all(deps.readers().map(async reader => {
      if (!isPlayerOpen(reader) || !attach(reader)) return;
      const entry = entries.get(reader)!;
      await load(entry, !!reader._internalReader?._state?.loggedIn, true);
    }));
  }
  function inspect(reader: any) {
    const entry = entries.get(reader);
    return entry ? { applied: entry.applied, loading: entry.loading, retained: entry.retained, revision: entry.revision, asked: entry.asked, remote: entry.remote,
      sources: entry.catalog?.sources ?? null, offered: entry.catalog?.offered.length ?? null } : null;
  }
  function detach(reader: any) {
    const entry = entries.get(reader);
    if (!entry) return;
    entry.revision++;
    entries.delete(reader);
    if (deps.isDead?.(entry.manager)) return;
    entry.undoEnd?.();
    // Gecko can return a different wrapper when it reads back an exported hook.
    if (waive(entry.manager.loadVoices) === waive(entry.hook)) delete entry.manager.loadVoices;
  }
  return { attach, detach, refresh, inspect,
    catalog: (reader: any) => entries.get(reader)?.catalog ?? null,
    /** Do not expose stale plugin voices or let a native list start reading on disable. */
    prepareHandBack() {
      for (const entry of entries.values()) {
        if (!deps.ownsInterface(entry.reader) || deps.isDead?.(entry.manager)) continue;
        try {
          if (isPlayerOpen(entry.reader)) entry.reader._internalReader.toggleReadAloudPopup(false);
          const m = entry.manager;
          Reflect.apply(m._allVoices.splice, m._allVoices, [0, m._allVoices.length]);
          m._voice = null;
          m._voiceID = null;
          m._selectedTier = null;
          entry.revision++;
          delete entry.catalog;
        } catch (error) { deps.error(error); }
      }
    },
    invalidate() {
      for (const entry of entries.values()) {
        entry.revision++;
        delete entry.catalog;
        if (deps.isDead?.(entry.manager)) { entries.delete(entry.reader); continue; }
        if (!isPlayerOpen(entry.reader)) {
          // A warm reopen resolves the cached list before discovery lands.
          // After settings changed, that list must not start an old voice.
          const m = entry.manager;
          Reflect.apply(m._allVoices.splice, m._allVoices, [0, m._allVoices.length]);
          m._voice = null;
          m._voiceID = null;
        }
      }
    },
    dispose() {
      disposed = true;
      for (const reader of [...entries.keys()]) detach(reader);
    },
  };
}
