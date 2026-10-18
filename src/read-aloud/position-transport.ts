import { createSingleFlight } from '../core/single-flight';
import { WebDAVError } from '../core/webdav';
import { mergePositions, parsePositions, POSITIONS_FILENAME, PositionsFileError, serializePositions } from './position-file';
import type { PositionEntry } from './read-aloud-position';

/**
 * Carries the reading-position store over the user's WebDAV server (#40):
 * the automatic side of "the bookmarks follow the user between computers".
 *
 * Every sync is read-merge-write against the one shared file
 * (position-file.ts): download, merge with this machine's entries — per
 * attachment, newest `ts` wins — offer every merged entry the local library
 * actually holds to the sampler (`adopt`, which takes only what is strictly
 * newer and writes through the store's own queue), and upload the union
 * back only when it differs from what came down. Entries for documents this
 * machine does not have stay in the file untouched: the file is the union
 * of every machine's bookmarks, not this machine's view.
 *
 * An entry's `lib` is the writer's own library number, and a group library
 * is numbered per computer (#187): an entry this machine cannot find under
 * that number is matched by its item key in this machine's own My Library
 * and groups, and adopted under the number this machine gives it
 * (`entryHere`). The file keeps it as its writer numbered it, so a group
 * numbered differently on two computers holds one entry per numbering.
 *
 * Event-driven, no timer: the wiring pokes it at startup, when a reader
 * opens, when a tab closes, and flushes it once at shutdown. Pokes are
 * fire-and-forget and single-flight — a burst of tab opens coalesces into
 * the running sync plus one trailing one — so nothing ever blocks a tab.
 *
 * The one thing that leaves the file is a bookmark of a document this
 * machine permanently deleted (#51): the store's tombstone for it, stamped
 * when the deletion was learned of, drops every entry stamped no later than
 * that from the merge — out of the adopt loop and out of the upload — so the
 * next sync takes the orphan out of the file instead of keeping it forever.
 * Tombstones never travel: every machine that held the bookmark hears the
 * same deletion through Zotero's own sync and drops the entry on its own,
 * and a machine that never held it never re-adds it.
 *
 * Failures follow the store's pattern (#14): report once per window, back
 * off, and never treat a failed write as done — the local store is the
 * source of truth and the next healthy sync carries everything. Two remote
 * conditions part ways deliberately: a malformed file is treated as absent
 * and healed by the next upload, but a file of a newer version is left
 * strictly alone — a downgrade must not eat what a newer build wrote.
 */

/** A failed sync retries at most once per window, and says so once per window. */
export const SYNC_RETRY_MS = 60_000;

/** The switch's pref as Zotero.Prefs.registerObserver wants it: relative to `extensions.zotero.`. */
export const SYNC_POSITIONS_OBSERVER = 'zotero-tts.webdav.syncPositions';

/** The slice of core/webdav's client the transport drives. */
export interface PositionsClient {
  download(name: string): Promise<string>;
  upload(name: string, text: string): Promise<void>;
}

/**
 * This computer's libraries, as far as finding an entry's attachment needs
 * them (#187). Every call may throw; the caller decides what a throw costs.
 */
export interface LibraryLookup {
  /** `Zotero.Libraries.exists`. */
  libraryExists(lib: number): boolean;
  /** `Zotero.Items.getIDFromLibraryAndKey` — only entries this machine can resolve are adopted. */
  itemExists(lib: number, key: string): boolean;
  /**
   * The libraries an item key can travel between computers in: My Library
   * and the groups, never a feed (a feed is local to one computer).
   */
  syncedLibraries(): number[];
}

/**
 * The entry as this computer holds it (#187), or null when it holds no
 * such attachment. Under its own number when that names an attachment
 * here; otherwise under the one synced library here that holds its key —
 * a group library is numbered per computer, an item key is the same on
 * every computer that syncs the library. Several libraries holding the key
 * answer null: an attachment not identified is not guessed at. Throws what
 * the lookup throws.
 */
export function entryHere(entry: PositionEntry, lookup: LibraryLookup): PositionEntry | null {
  if (lookup.libraryExists(entry.lib) && lookup.itemExists(entry.lib, entry.key)) return entry;
  let found: number | null = null;
  for (const lib of lookup.syncedLibraries()) {
    if (lib === entry.lib || lib === found || !lookup.itemExists(lib, entry.key)) continue;
    if (found !== null) return null;
    found = lib;
  }
  return found === null ? null : { ...entry, lib: found };
}

/** The same lookup, reading the libraries at most once: one sync, one import. */
export function withLibrariesOnce(lookup: LibraryLookup): LibraryLookup {
  let libraries: number[] | null = null;
  return {
    libraryExists: (lib) => lookup.libraryExists(lib),
    itemExists: (lib, key) => lookup.itemExists(lib, key),
    syncedLibraries: () => (libraries ??= lookup.syncedLibraries()),
  };
}

export interface PositionTransportDeps extends LibraryLookup {
  /** The webdav.syncPositions switch, read per sync so the checkbox applies at once. */
  enabled(): boolean;
  /** A client for the settings as they are now; throws WebDAVError('config') for an unusable URL. */
  client(): PositionsClient;
  /** Every bookmark this machine holds — the sampler's map, store-backed. */
  local(): PositionEntry[];
  /** Offer one remote entry, under this machine's library number, to the sampler and store; true when strictly newer and taken. */
  adopt(entry: PositionEntry): boolean;
  /**
   * When this machine permanently deleted the attachment — the store's
   * tombstone (#51) — or null. An entry stamped no later than that is
   * dropped from the merge.
   */
  deletedAt(lib: number, key: string): number | null;
  now(): number;
  error(e: unknown): void;
  debug(message: string): void;
  /** After every completed sync, skipped ones excepted — the pane's status line (ui/sync-status-rows.ts, #68). */
  onSynced?(): void;
}

export interface PositionTransportStats {
  /** Sync attempts, skipped ones included. */
  syncs: number;
  lastOutcome: 'ok' | 'skipped' | 'error' | null;
  lastTrigger: string | null;
  lastAt: number | null;
  lastError: string | null;
  /** The last completed sync's numbers; null before one completes. */
  remoteEntries: number | null;
  adopted: number | null;
  /** Of those, the ones taken under another library number than the file's (#187). */
  remapped: number | null;
  /** Entries dropped from the file for this machine's tombstones (#51). */
  dropped: number | null;
  uploaded: boolean | null;
  /** The last sync that took bookmarks from other computers — when, how many; null before one (the pane's line, #68). */
  lastAdoption: { at: number; count: number } | null;
  running: boolean;
}

export interface PositionTransport {
  /** Schedule a sync; never blocks, a burst coalesces into one trailing run. */
  poke(trigger: string): void;
  /** One awaited sync — shutdown's final push; runs even inside the failure window. */
  flush(trigger: string): Promise<void>;
  stats(): PositionTransportStats;
}

export function createPositionTransport(deps: PositionTransportDeps): PositionTransport {
  let syncs = 0;
  let lastOutcome: PositionTransportStats['lastOutcome'] = null;
  let lastTrigger: string | null = null;
  let lastAt: number | null = null;
  let lastError: string | null = null;
  let remoteEntries: number | null = null;
  let adoptedCount: number | null = null;
  let remappedCount: number | null = null;
  let droppedCount: number | null = null;
  let uploadedFlag: boolean | null = null;
  let lastAdoption: PositionTransportStats['lastAdoption'] = null;
  let lastFailureAt = Number.NEGATIVE_INFINITY;
  let lastReportAt = Number.NEGATIVE_INFINITY;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  /** One report per window: a down server says so once a minute, not once per closed tab. */
  function reportGated(e: unknown): void {
    const at = deps.now();
    if (at - lastReportAt < SYNC_RETRY_MS) return;
    lastReportAt = at;
    report(e);
  }

  /** The pane hears every completed sync; its listener must never be the thing that fails one. */
  function notify(): void {
    try {
      deps.onSynced?.();
    } catch (e) {
      reportGated(e);
    }
  }

  /** Never throws: outcome and error land in the stats and the gated report. */
  async function sync(trigger: string, force: boolean): Promise<void> {
    syncs++;
    lastTrigger = trigger;
    lastAt = deps.now();
    if (!deps.enabled()) {
      lastOutcome = 'skipped';
      return;
    }
    if (!force && deps.now() - lastFailureAt < SYNC_RETRY_MS) {
      lastOutcome = 'skipped';
      return;
    }
    try {
      const client = deps.client();
      let remoteText: string | null = null;
      try {
        remoteText = await client.download(POSITIONS_FILENAME);
      } catch (e) {
        // No file yet is the ordinary first run, not a failure
        if (!(e instanceof WebDAVError) || e.kind !== 'not-found') throw e;
      }
      let remote: PositionEntry[] = [];
      if (remoteText !== null) {
        try {
          remote = parsePositions(remoteText);
        } catch (e) {
          // A newer build's file is left strictly alone; a broken one is
          // treated as absent, and the upload below heals it
          if (e instanceof PositionsFileError && e.kind === 'newer') throw e;
          reportGated(e);
          remoteText = null;
        }
      }
      // This machine's tombstones (#51): an entry stamped no later than the
      // deletion leaves the file here. The check failing keeps the entry —
      // a wrongly kept orphan costs bytes, a wrongly dropped one is a bookmark
      let dropped = 0;
      const merged = mergePositions(deps.local(), remote).filter((entry) => {
        let gone = false;
        try {
          const at = deps.deletedAt(entry.lib, entry.key);
          gone = at !== null && entry.ts <= at;
        } catch (e) {
          reportGated(e);
        }
        if (gone) dropped++;
        return !gone;
      });
      let adopted = 0;
      let remapped = 0;
      // The libraries are read once per sync, and only when an entry's own
      // number finds nothing here
      const lookup = withLibrariesOnce(deps);
      for (const entry of merged) {
        // Only bookmarks this machine can resolve go into its store, under
        // its own library number (#187); the check failing keeps the entry
        // out of the store, never out of the file
        let here: PositionEntry | null = null;
        try {
          here = entryHere(entry, lookup);
        } catch (e) {
          reportGated(e);
        }
        if (here && deps.adopt(here)) {
          adopted++;
          if (here.lib !== entry.lib) remapped++;
        }
      }
      const text = serializePositions(merged);
      let uploaded = false;
      if (remoteText === null ? merged.length > 0 : text !== remoteText) {
        await client.upload(POSITIONS_FILENAME, text);
        uploaded = true;
      }
      remoteEntries = remote.length;
      adoptedCount = adopted;
      remappedCount = remapped;
      droppedCount = dropped;
      uploadedFlag = uploaded;
      if (adopted > 0) lastAdoption = { at: deps.now(), count: adopted };
      lastOutcome = 'ok';
      lastError = null;
      lastFailureAt = Number.NEGATIVE_INFINITY;
      deps.debug(`position sync (${trigger}): ${remote.length} remote, ${merged.length} merged, ${adopted} adopted${remapped ? ` (${remapped} under this computer's library number)` : ''}, ${dropped} dropped${uploaded ? ', uploaded' : ''}`);
      notify();
    } catch (e) {
      lastOutcome = 'error';
      lastError = String(e);
      lastFailureAt = deps.now();
      reportGated(e);
      notify();
    }
  }

  // One sync in flight and at most one waiting behind it (core/single-flight.ts, shared with the settings sync since #68)
  const flight = createSingleFlight(sync);

  return {
    poke: flight.poke,
    flush: flight.flush,
    stats: () => ({
      syncs,
      lastOutcome,
      lastTrigger,
      lastAt,
      lastError,
      remoteEntries,
      adopted: adoptedCount,
      remapped: remappedCount,
      dropped: droppedCount,
      uploaded: uploadedFlag,
      lastAdoption,
      running: flight.running(),
    }),
  };
}
