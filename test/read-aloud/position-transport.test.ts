import { describe, expect, it } from 'vitest';
import { WebDAVError } from '../../src/core/webdav';
import { POSITIONS_FILENAME, POSITIONS_FORMAT, POSITIONS_VERSION, serializePositions } from '../../src/read-aloud/position-file';
import { createPositionSync } from '../../src/read-aloud/position-sync';
import { createPositionTransport, entryHere, SYNC_RETRY_MS, type LibraryLookup, type PositionTransportDeps } from '../../src/read-aloud/position-transport';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

const entry = (over: Partial<PositionEntry> = {}): PositionEntry => ({
  lib: 1,
  key: 'ABCD1234',
  pos: { pageIndex: 3, rects: [[20, 30, 20, 30]] },
  ts: 1000,
  ...over,
});

/** Lets queued microtasks (a skipped or failed sync completes in one) run out. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(over: Partial<PositionTransportDeps> = {}) {
  const uploads: { name: string; text: string }[] = [];
  const downloads: string[] = [];
  const adopted: PositionEntry[] = [];
  const errors: unknown[] = [];
  let clock = 0;
  /** What the server holds: null → not-found, an Error → thrown, text → returned. */
  let remote: string | Error | null = null;
  let local: PositionEntry[] = [];
  let adoptTakes = true;
  /** Gates for successive downloads; a missing gate resolves at once. */
  const gates: Promise<void>[] = [];

  const deps: PositionTransportDeps = {
    enabled: () => true,
    client: () => ({
      download: async (name) => {
        downloads.push(name);
        await gates.shift();
        if (remote instanceof Error) throw remote;
        if (remote === null) throw new WebDAVError('not-found', 'no file yet', 404);
        return remote;
      },
      upload: async (name, text) => {
        uploads.push({ name, text });
      },
    }),
    local: () => local,
    adopt: (e) => {
      adopted.push(e);
      return adoptTakes;
    },
    itemExists: () => true,
    libraryExists: () => true,
    syncedLibraries: () => [1],
    deletedAt: () => null,
    now: () => clock,
    error: (e) => errors.push(e),
    debug: () => {},
    ...over,
  };
  const transport = createPositionTransport(deps);
  return {
    transport,
    uploads,
    downloads,
    adopted,
    errors,
    setRemote: (v: string | Error | null) => (remote = v),
    setLocal: (v: PositionEntry[]) => (local = v),
    setAdopt: (v: boolean) => (adoptTakes = v),
    tick: (ms: number) => (clock += ms),
    gate: (p: Promise<void>) => gates.push(p),
  };
}

describe('createPositionTransport', () => {
  it('does nothing while the switch is off', async () => {
    const h = harness({ enabled: () => false });
    h.setLocal([entry()]);
    await h.transport.flush('startup');
    expect(h.downloads).toEqual([]);
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats().lastOutcome).toBe('skipped');
  });

  it('uploads this machine’s entries when the server has no file yet', async () => {
    const h = harness();
    const mine = entry();
    h.setLocal([mine]);
    await h.transport.flush('startup');
    expect(h.downloads).toEqual([POSITIONS_FILENAME]);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteEntries: 0, uploaded: true });
  });

  it('uploads nothing when there is no file and nothing local', async () => {
    const h = harness();
    await h.transport.flush('startup');
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', uploaded: false });
  });

  it('adopts a newer remote entry and skips the upload when nothing changed', async () => {
    const h = harness();
    const older = entry({ ts: 1000 });
    const newer = entry({ ts: 2000, pos: { pageIndex: 9, rects: [[9, 9, 9, 9]] } });
    h.setLocal([older]);
    h.setRemote(serializePositions([newer]));
    await h.transport.flush('reader-open');
    expect(h.adopted).toEqual([newer]);
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteEntries: 1, adopted: 1, uploaded: false });
  });

  it('uploads the merged union when this machine holds the newer entry', async () => {
    const h = harness();
    h.setAdopt(false); // the sampler refuses what is not strictly newer
    const newer = entry({ ts: 2000 });
    const older = entry({ ts: 1000, pos: { pageIndex: 1, rects: [[1, 1, 1, 1]] } });
    const theirs = entry({ lib: 2, key: 'THEIRS01', ts: 500 });
    h.setLocal([newer]);
    h.setRemote(serializePositions([older, theirs]));
    await h.transport.flush('reader-close');
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([newer, theirs]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', adopted: 0, uploaded: true });
  });

  it('keeps a foreign entry in the file but out of the store', async () => {
    const h = harness({ itemExists: (_lib, key) => key !== 'FOREIGN1' });
    const mine = entry({ ts: 2000 });
    const foreign = entry({ key: 'FOREIGN1', ts: 3000 });
    h.setLocal([mine]);
    h.setRemote(serializePositions([foreign]));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([mine]); // the foreign entry is never offered to the sampler
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine, foreign]) }]);
  });

  it('hands adopt the parsed, normalized position', async () => {
    const h = harness();
    const text = JSON.stringify({
      format: POSITIONS_FORMAT,
      version: POSITIONS_VERSION,
      items: [entry({ ts: 2000, pos: { pageIndex: 3, rects: [[10, 20, 30, 40]] } })],
    });
    h.setRemote(text);
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([entry({ ts: 2000, pos: { pageIndex: 3, rects: [[20, 30, 20, 30]] } })]);
  });

  it('treats a broken remote file as absent and heals it, reporting once', async () => {
    const h = harness();
    const mine = entry();
    h.setLocal([mine]);
    h.setRemote('<html>maintenance</html>');
    await h.transport.flush('startup');
    expect(h.errors).toHaveLength(1);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine]) }]);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });

  it('leaves a newer build’s file strictly alone', async () => {
    const h = harness();
    h.setLocal([entry()]);
    h.setRemote(JSON.stringify({ format: POSITIONS_FORMAT, version: POSITIONS_VERSION + 1, items: [] }));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([]);
    expect(h.uploads).toEqual([]);
    const stats = h.transport.stats();
    expect(stats.lastOutcome).toBe('error');
    expect(stats.lastError).toContain(`version ${POSITIONS_VERSION + 1}`);
  });

  it('backs off after a failure and retries once the window passes', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup');
    expect(h.transport.stats().lastOutcome).toBe('error');
    expect(h.downloads).toHaveLength(1);

    h.transport.poke('reader-open'); // inside the window: no request at all
    await settle();
    expect(h.downloads).toHaveLength(1);
    expect(h.transport.stats().lastOutcome).toBe('skipped');

    h.tick(SYNC_RETRY_MS);
    h.setRemote(null);
    h.transport.poke('reader-open');
    await settle();
    expect(h.downloads).toHaveLength(2);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });

  it('reports a persisting failure once per window, not once per attempt', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup');
    h.tick(1000);
    await h.transport.flush('shutdown'); // forced through the back-off, still fails
    expect(h.downloads).toHaveLength(2);
    expect(h.errors).toHaveLength(1);
    h.tick(SYNC_RETRY_MS);
    await h.transport.flush('shutdown');
    expect(h.errors).toHaveLength(2);
  });

  it('reports an unusable configuration instead of hanging or throwing', async () => {
    const h = harness({
      client: () => {
        throw new WebDAVError('config', 'Set the WebDAV URL first.');
      },
    });
    await h.transport.flush('startup');
    expect(h.errors).toHaveLength(1);
    expect(h.transport.stats().lastOutcome).toBe('error');
  });

  it('coalesces a burst of pokes into the running sync plus one trailing one', async () => {
    const h = harness();
    let release!: () => void;
    h.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const first = h.transport.flush('one');
    h.transport.poke('two');
    h.transport.poke('three');
    h.transport.poke('four');
    expect(h.downloads).toHaveLength(1);
    release();
    await first;
    await settle();
    expect(h.downloads).toHaveLength(2); // one in flight, one trailing — never four
    expect(h.transport.stats().syncs).toBe(2);
    expect(h.transport.stats().lastTrigger).toBe('four');
  });

  it('a flush behind a running sync still forces its own', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup'); // opens the failure window
    h.setRemote(null);
    let release!: () => void;
    h.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const running = h.transport.flush('reader-close');
    const behind = h.transport.flush('shutdown');
    release();
    await running;
    await behind;
    // Both forced through: the running one and the trailing shutdown flush
    expect(h.downloads).toHaveLength(3);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });

  // #51: a tombstone on this machine takes the entry out of the shared file
  it('drops an entry this machine deleted from the adopt loop and the file', async () => {
    const h = harness({ deletedAt: (_lib, key) => (key === 'GONE0000' ? 5000 : null) });
    const gone = entry({ key: 'GONE0000', ts: 4000 });
    const kept = entry({ ts: 3000 });
    h.setLocal([kept]);
    h.setRemote(serializePositions([gone, kept]));
    await h.transport.flush('delete');
    expect(h.adopted).toEqual([kept]);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([kept]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', dropped: 1, uploaded: true });
  });

  it('an entry stamped exactly at the deletion is dropped too', async () => {
    const h = harness({ deletedAt: () => 5000 });
    h.setRemote(serializePositions([entry({ ts: 5000 })]));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([]);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([]) }]);
    expect(h.transport.stats().dropped).toBe(1);
  });

  it('keeps an entry stamped after the deletion — a document restored and read again', async () => {
    const h = harness({ deletedAt: () => 5000 });
    const revived = entry({ ts: 5001 });
    h.setRemote(serializePositions([revived]));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([revived]);
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats().dropped).toBe(0);
  });

  it('tells the pane after every completed sync and remembers the last adoption', async () => {
    const synced: number[] = [];
    const h = harness({ onSynced: () => synced.push(1) });
    h.setRemote(serializePositions([entry({ ts: 2000 })]));
    h.setLocal([entry({ ts: 1000 })]);
    h.transport.poke('reader-open');
    await settle();
    expect(synced).toHaveLength(1);
    expect(h.transport.stats().lastAdoption).toEqual({ at: 0, count: 1 });
    h.setLocal([entry({ ts: 2000 })]);
    h.setAdopt(false);
    h.transport.poke('reader-close');
    await settle();
    expect(synced).toHaveLength(2);
    expect(h.transport.stats()).toMatchObject({ adopted: 0, lastAdoption: { at: 0, count: 1 } });
    h.setRemote(new Error('down'));
    h.transport.flush('shutdown');
    await settle();
    expect(synced).toHaveLength(3);
    // The switch off: skipped, and the pane is not told
    const off: number[] = [];
    const quiet = harness({ enabled: () => false, onSynced: () => off.push(1) });
    quiet.transport.poke('reader-open');
    await settle();
    expect(off).toEqual([]);
  });

  it('a tombstone check that throws keeps the entry and reports once — never drop on an error', async () => {
    const h = harness({
      deletedAt: () => {
        throw new Error('store closed');
      },
    });
    const mine = entry();
    h.setLocal([mine]);
    await h.transport.flush('startup');
    expect(h.errors).toHaveLength(1);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', dropped: 0 });
  });
});

/**
 * A lookup over one computer's libraries, `items` as `libraryID/key`;
 * `libraries` are the ones that sync (My Library and the groups), every
 * library number in `items` exists here.
 */
function lookupOver(items: string[], libraries: number[] = [1, ...items.map((i) => Number(i.split('/')[0]))]): LibraryLookup {
  const here = new Set([1, ...items.map((i) => Number(i.split('/')[0]))]);
  return {
    libraryExists: (lib) => here.has(lib),
    itemExists: (lib, key) => items.includes(lib + '/' + key),
    syncedLibraries: () => [...new Set(libraries)],
  };
}

describe('entryHere: the entry under this computer’s library number (issue #187)', () => {
  it('keeps an entry whose library and key name an attachment here as it is', () => {
    const e = entry({ lib: 2, key: 'K0LABPDF' });
    expect(entryHere(e, lookupOver(['2/K0LABPDF']))).toBe(e);
  });

  it('moves an entry to the one library here that holds its key, when its own number is not a library here', () => {
    expect(entryHere(entry({ lib: 2, key: 'K0LABPDF' }), lookupOver(['3/K0LABPDF']))).toEqual(entry({ lib: 3, key: 'K0LABPDF' }));
  });

  it('moves it as well when its number is another library here that lacks the key', () => {
    // Library 2 is a feed on this computer; the group holding the key is 3
    const lookup = lookupOver(['2/OTHER001', '3/K0LABPDF'], [1, 3]);
    expect(entryHere(entry({ lib: 2, key: 'K0LABPDF' }), lookup)).toEqual(entry({ lib: 3, key: 'K0LABPDF' }));
  });

  it('never looks for the key in a library that does not sync, a feed', () => {
    const lookup = lookupOver(['4/K0LABPDF'], [1]);
    expect(entryHere(entry({ lib: 2, key: 'K0LABPDF' }), lookup)).toBeNull();
  });

  it('answers null when no library here holds the key', () => {
    expect(entryHere(entry({ lib: 2, key: 'K0LABPDF' }), lookupOver(['3/OTHER001']))).toBeNull();
  });

  it('answers null when several libraries here hold the key: not identified, never guessed', () => {
    expect(entryHere(entry({ lib: 2, key: 'K0LABPDF' }), lookupOver(['3/K0LABPDF', '5/K0LABPDF']))).toBeNull();
  });

  it('lets a lookup that throws throw: the caller keeps the entry out of the store', () => {
    const lookup: LibraryLookup = {
      ...lookupOver([]),
      syncedLibraries: () => {
        throw new Error('Zotero.Libraries cache is not initialized');
      },
    };
    expect(() => entryHere(entry({ lib: 2 }), lookup)).toThrow('not initialized');
  });
});

describe('the transport adopts under this computer’s library number (issue #187)', () => {
  it('offers the sampler the entry under its library here, and counts it remapped', async () => {
    const h = harness(lookupOver(['3/K0LABPDF']));
    const theirs = entry({ lib: 2, key: 'K0LABPDF', ts: 2000 });
    h.setRemote(serializePositions([theirs]));
    await h.transport.flush('reader-open');
    expect(h.adopted).toEqual([{ ...theirs, lib: 3 }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', adopted: 1, remapped: 1 });
    // The file keeps the entry as its writer numbered it
    expect(h.uploads).toEqual([]);
  });

  it('counts nothing remapped for an entry taken under its own number', async () => {
    const h = harness();
    h.setRemote(serializePositions([entry({ ts: 2000 })]));
    await h.transport.flush('reader-open');
    expect(h.transport.stats()).toMatchObject({ adopted: 1, remapped: 0 });
  });

  it('reads the libraries once per sync, not once per entry', async () => {
    let reads = 0;
    const lookup = lookupOver([]);
    const h = harness({ ...lookup, syncedLibraries: () => (reads++, lookup.syncedLibraries()) });
    h.setRemote(serializePositions([entry({ lib: 2, key: 'AAAA0001' }), entry({ lib: 2, key: 'AAAA0002' }), entry({ lib: 3, key: 'AAAA0003' })]));
    await h.transport.flush('reader-open');
    expect(reads).toBe(1);
  });

  it('a lookup that throws keeps the entry out of the store and in the file, and reports once', async () => {
    const h = harness({
      libraryExists: () => false,
      syncedLibraries: () => {
        throw new Error('Zotero.Libraries cache is not initialized');
      },
    });
    const theirs = entry({ lib: 2, key: 'K0LABPDF', ts: 2000 });
    const mine = entry({ ts: 1000 });
    h.setLocal([mine]);
    h.setRemote(serializePositions([theirs]));
    await h.transport.flush('reader-open');
    expect(h.adopted).toEqual([]);
    expect(h.errors).toHaveLength(1);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine, theirs]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', adopted: 0, remapped: 0 });
  });
});

describe('a group library numbered differently on two computers (issue #187)', () => {
  // One PDF in the group "Lab": the same item key on both computers, but
  // Zotero numbers a group when an install first meets it (MAX + 1), so
  // "Lab" is library 2 on A and library 3 on B
  const KEY = 'K0LABPDF';
  const AT_A = { pageIndex: 4, rects: [[100, 200, 100, 200]] };
  const AT_B = { pageIndex: 9, rects: [[10, 20, 10, 20]] };

  /** The user's WebDAV folder: both computers read and write the same file. */
  function folder() {
    const server: { text: string | null } = { text: null };
    const client = {
      download: async () => {
        if (server.text === null) throw new WebDAVError('not-found', 'no file yet', 404);
        return server.text;
      },
      upload: async (_name: string, text: string) => {
        server.text = text;
      },
    };
    return { server, client };
  }

  /** One computer, its sampler and its transport over the shared folder; the PDF is `lib/KEY` here. */
  function computer(shared: ReturnType<typeof folder>, lib: number) {
    let reading: { pos: unknown; speaking: boolean } | null = null;
    let now = 0;
    const reader = {};
    const sync = createPositionSync({
      initial: [],
      save: () => {},
      retryWrites: () => {},
      readers: () => (reading ? [reader] : []),
      attachmentOf: () => ({ lib, key: KEY }),
      managerOf: () => ({ active: true, paused: !reading?.speaking }),
      savedPositionOf: () => reading?.pos ?? null,
      setTimeout: () => 0,
      clearTimeout: () => {},
      now: () => now,
      error: (e) => {
        throw e;
      },
    });
    const transport = createPositionTransport({
      ...lookupOver([`${lib}/${KEY}`]),
      enabled: () => true,
      client: () => shared.client,
      local: () => sync.list(),
      adopt: (e) => sync.adopt(e),
      deletedAt: () => null,
      now: () => now,
      error: (e) => {
        throw e;
      },
      debug: () => {},
    });
    return {
      sync,
      transport,
      /** Reads the PDF up to `pos` at `at`, and pauses there. */
      readTo: async (pos: unknown, at: number) => {
        now = at;
        reading = { pos, speaking: true };
        sync.sample();
        reading = { pos, speaking: false };
        sync.sample();
        await transport.flush('pause');
      },
    };
  }

  it('resumes on B where A stopped, and on A where B then stopped', async () => {
    const shared = folder();
    const a = computer(shared, 2);
    const b = computer(shared, 3);
    await a.readTo(AT_A, 1000);
    // Shift+Space on B pulls first, then asks the sampler for B's own attachment
    await b.transport.flush('resume');
    expect(b.sync.entryOf(3, KEY)?.pos).toEqual(AT_A);
    await b.readTo(AT_B, 2000);
    await a.transport.flush('resume');
    expect(a.sync.entryOf(2, KEY)?.pos).toEqual(AT_B);
  });

  it('settles the file after one round: each numbering keeps its entry, and nothing goes back and forth', async () => {
    const shared = folder();
    const a = computer(shared, 2);
    const b = computer(shared, 3);
    await a.readTo(AT_A, 1000);
    await b.transport.flush('resume');
    await b.readTo(AT_B, 2000);
    await a.transport.flush('resume');
    await a.transport.flush('reader-close');
    await b.transport.flush('reader-close');
    const settled = shared.server.text;
    for (let i = 0; i < 3; i++) {
      await a.transport.flush('reader-open');
      await b.transport.flush('reader-open');
    }
    expect(shared.server.text).toBe(settled);
    const items = (JSON.parse(settled!) as { items: PositionEntry[] }).items;
    expect(items.map((e) => ({ id: `${e.lib}/${e.key}`, ts: e.ts, pos: e.pos }))).toEqual([
      { id: `2/${KEY}`, ts: 2000, pos: AT_B },
      { id: `3/${KEY}`, ts: 2000, pos: AT_B },
    ]);
  });
});
