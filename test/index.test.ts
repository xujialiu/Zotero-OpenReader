import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishBundle } from './setup';

/**
 * The plugin's own startup() — every step of src/index.ts, not a module on
 * its own — run against a stand-in Zotero. Issue #143: a reader window
 * closed by a script's `reader._window.close()` skips Zotero's
 * `reader.close()`, so the reader stays in Zotero.Reader._readers with its
 * internal reader and iframe window dead. Six startup steps walked the
 * readers with no guard per reader and stopped at it, and the shortcuts
 * step never registered the listener that attaches readers opened later.
 * A walk a new step adds is only seen by a test of the whole startup.
 */

const DEAD = new WeakSet<object>();

/** A wrapper into a nuked compartment: every touch throws, as Gecko's does. */
function deadWrapper(): object {
  const fail = (): never => {
    throw new TypeError("can't access dead object");
  };
  const wrapper = new Proxy({}, { get: fail, set: fail, has: fail, ownKeys: fail, getOwnPropertyDescriptor: fail, defineProperty: fail, deleteProperty: fail, getPrototypeOf: fail });
  DEAD.add(wrapper);
  return wrapper;
}

/** ReaderInstance's Proxy (xpcom/reader.js 76-89): a property the instance lacks is read off its internal reader. */
function readerInstance(fields: Record<string, unknown>): any {
  const proto = {
    get type() { return (this as any)._type; },
    get itemID() { return (this as any)._item?.id; },
  };
  return new Proxy(Object.assign(Object.create(proto), fields), {
    get(target, prop) {
      if (target[prop] === undefined && target._internalReader && target._internalReader[prop] !== undefined) {
        if (typeof target._internalReader[prop] === 'function') {
          return (...args: unknown[]) => target._internalReader[prop](...args);
        }
        return target._internalReader[prop];
      }
      return target[prop];
    },
    set(original, prop, value) {
      let target = original;
      if (!Object.prototype.hasOwnProperty.call(original, prop) && original._internalReader && target._internalReader[prop] !== undefined) {
        target = original._internalReader;
      }
      target[prop] = value;
      return true;
    },
  });
}

/**
 * A ReaderWindow after `reader._window.close()`: uninit never ran, the
 * reader content's compartment is nuked, and the chrome window is closed
 * but, living in the system compartment, not dead.
 */
function goneReaderWindow(): any {
  return readerInstance({
    stateFileName: '.zotero-reader-state',
    annotationItemIDs: [],
    _item: { id: 1, libraryID: 1, key: 'GONE0001' },
    _window: { closed: true, addEventListener() {}, removeEventListener() {} },
    _iframe: { contentWindow: null },
    _iframeWindow: deadWrapper(),
    _internalReader: deadWrapper(),
    _isReaderInitialized: true,
    _isUninitialized: false,
    _type: 'pdf',
  });
}

/** A live reader with nothing the plugin looks for: what each step reads of it is the trace of its visit. */
function spyReader(): { reader: object; reads: Set<string> } {
  const reads = new Set<string>();
  const internal = new Proxy({}, { get: (_target, prop) => void reads.add(String(prop)) });
  return { reader: { _internalReader: internal }, reads };
}

/** Anything: every property, call and construction answers another; never a thenable, an empty iterable, an exhausted enumerator. */
function anything(): any {
  const own = new Map<PropertyKey, unknown>();
  return new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') return () => '';
      if (prop === 'length') return 0;
      if (prop === 'hasMoreElements') return () => false;
      if (!own.has(prop)) own.set(prop, anything());
      return own.get(prop);
    },
    apply: () => anything(),
    construct: () => anything(),
    set: (_target, prop, value) => (own.set(prop, value), true),
  });
}

/** The given members, and anything for the rest. */
function stub(members: Record<PropertyKey, unknown>): any {
  return new Proxy(members, {
    get(target, prop) {
      if (!(prop in target)) target[prop as string] = prop === 'then' ? undefined : anything();
      return target[prop as string];
    },
  });
}

/** Fluent's Localization over the en-US file, sync, for the `strings` step. */
class Localization {
  private readonly bundle = englishBundle();
  formatValueSync(id: string, args?: Record<string, string | number>) {
    const message = this.bundle.getMessage(id);
    return message?.value ? this.bundle.formatPattern(message.value, args) : null;
  }
}

const ADDON_UPGRADE = 7;
let running: any = null;

/** A fresh bundle, started as Zotero starts it, with `readers` open; `setup` adds prefs and Zotero members. */
async function start(readers: unknown[], setup: { prefs?: Record<string, unknown>; zotero?: Record<string, unknown> } = {}) {
  vi.resetModules();
  const prefs = new Map<string, unknown>(Object.entries(setup.prefs ?? {}));
  const listeners: string[] = [];
  const errors: unknown[] = [];
  const Zotero = stub({
    Prefs: stub({
      get: (key: string) => prefs.get(key),
      set: (key: string, value: unknown) => void prefs.set(key, value),
      clear: (key: string) => void prefs.delete(key),
      prefHasUserValue: (key: string) => prefs.has(key),
      registerObserver: () => Symbol('observer'),
      unregisterObserver: () => {},
    }),
    Reader: stub({
      _readers: readers,
      registerEventListener: (type: string) => void listeners.push(type),
      unregisterEventListener: () => {},
    }),
    logError: (e: unknown) => void errors.push(e),
    debug: () => {},
    locale: 'en-US',
    ...setup.zotero,
  });
  Object.assign(globalThis, {
    Zotero,
    Components: stub({
      utils: stub({
        isDeadWrapper: (value: unknown) => DEAD.has(value as object),
        exportFunction: (fn: unknown) => fn,
        waiveXrays: (value: unknown) => value,
        cloneInto: (value: unknown) => value,
      }),
    }),
    Services: stub({ wm: stub({ getEnumerator: () => ({ hasMoreElements: () => false }), getMostRecentWindow: () => null }) }),
    ChromeUtils: anything(),
    IOUtils: anything(),
    PathUtils: anything(),
    Localization,
    ADDON_DISABLE: 4,
    ADDON_UNINSTALL: 6,
  });
  await import('../src/index');
  running = Zotero.ZoteroTTS;
  await running.startup({ id: 'zotero-tts@xujialiu.top', version: '0.0.0-test', rootURI: 'file:///plugin/' });
  const report = JSON.parse(running.diagnostics.startup()) as { failed: string[] };
  return { report, listeners, errors, diagnostics: running.diagnostics };
}

afterEach(async () => {
  await running?.shutdown(ADDON_UPGRADE);
  running = null;
});

describe('startup with a reader whose window is gone (issue #143)', () => {
  it('starts every step with no reader open: the stand-in is enough for all of them', async () => {
    const { report, listeners } = await start([]);
    expect(report.failed).toEqual([]);
    expect(listeners).toContain('renderToolbar');
  });

  it('starts every step, and still listens for the readers opened later', async () => {
    const { report, listeners } = await start([goneReaderWindow()]);
    expect(report.failed).toEqual([]);
    expect(listeners).toContain('renderToolbar');
  });

  it('attaches a reader listed after it exactly as a reader open alone', async () => {
    const alone = spyReader();
    await start([alone.reader]);
    await running.shutdown(ADDON_UPGRADE);
    const after = spyReader();
    await start([goneReaderWindow(), after.reader]);
    expect(alone.reads.size).toBeGreaterThan(0);
    expect([...after.reads].sort()).toEqual([...alone.reads].sort());
  });

  it('logs nothing about it', async () => {
    const { errors } = await start([goneReaderWindow()]);
    expect(errors.map(String).filter((e) => e.includes('dead object'))).toEqual([]);
  });

  it('keeps the per-reader diagnostics answering, its own row marked gone', async () => {
    const { diagnostics } = await start([goneReaderWindow(), spyReader().reader]);
    for (const name of ['highlight', 'autoScroll', 'sentenceInView', 'skippedLines', 'textSettings', 'playerVoiceList']) {
      const rows = JSON.parse(diagnostics[name]());
      expect({ name, rows: rows.length, gone: rows[0] }).toEqual({ name, rows: 2, gone: { gone: true } });
    }
  });
});

describe('a voice list that lands after its tab closed (issue #165)', () => {
  it('is planned against nothing: the closed reader is not read, and nothing is logged', async () => {
    const manager = { active: false, paused: true };
    const reader = readerInstance({ _item: { id: 7, libraryID: 1, key: 'LIST0001' }, _internalReader: { _readAloudManager: manager }, _iframeWindow: { addEventListener() {}, removeEventListener() {} }, _type: 'pdf' });
    const { errors } = await start([reader]);
    const iface = reader._getReadAloudRemoteInterface({ Promise });
    const listed = iface.getVoices();
    // The tab closes while the list is on its way: what the reader held dies with its window
    reader._internalReader = deadWrapper();
    reader._iframeWindow = deadWrapper();
    await Promise.race([listed, new Promise((resolve) => setTimeout(resolve, 2000))]);
    expect(errors.map((e) => String((e as Error)?.message ?? e)).filter((e) => e.includes('dead object'))).toEqual([]);
  });
});

describe('a pause sends both positions files up at once (issue #161)', () => {
  const FOLDER = 'https://dav.test/positions/';
  const FILES = ['zotero-tts-positions.json', 'xujialiu-positions.json'];

  /** A WebDAV folder in memory: GET answers what the last PUT left, or 404; every request is logged with the clock. */
  function davFolder() {
    const files = new Map<string, string>();
    const log: { method: string; name: string; at: number }[] = [];
    const fetch = async (target: string, init: { method: string; body?: string }) => {
      const name = target.slice(FOLDER.length);
      log.push({ method: init.method, name, at: Date.now() });
      if (init.method === 'PUT') {
        files.set(name, init.body ?? '');
        return new Response(null, { status: 201 });
      }
      const text = files.get(name);
      return text === undefined ? new Response(null, { status: 404 }) : new Response(text, { status: 200 });
    };
    return { fetch, log };
  }

  /** A PDF reader with an open Read Aloud session, speaking, at a sentence of page 1. */
  function speakingReader() {
    const manager = { active: true, paused: false };
    const internal = { _readAloudManager: manager, _state: { readAloudState: { savedPosition: { pageIndex: 0, rects: [[10, 20, 30, 40]] } } } };
    const reader = readerInstance({ _item: { id: 5 }, _internalReader: internal, _type: 'pdf' });
    return { reader, manager };
  }

  const realFetch = globalThis.fetch;
  afterEach(async () => {
    await running?.shutdown(ADDON_UPGRADE);
    running = null;
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('requests both files within one sampler tick of the pause, not after a quiet period', async () => {
    vi.useFakeTimers();
    const dav = davFolder();
    globalThis.fetch = dav.fetch as never;
    const item = { id: 5, libraryID: 1, key: 'PAUSE001', attachmentContentType: 'application/pdf' };
    const { reader, manager } = speakingReader();
    const { diagnostics } = await start([reader], {
      prefs: {
        'extensions.zotero.zotero-tts.webdav.url': FOLDER,
        'extensions.zotero.zotero-tts.webdav.syncPositions': true,
      },
      zotero: {
        Items: stub({ get: (id: number) => (id === 5 ? item : null), getIDFromLibraryAndKey: (lib: number, key: string) => (lib === 1 && key === item.key ? 5 : false) }),
        Libraries: stub({ exists: (lib: number) => lib === 1, userLibraryID: 1 }),
      },
    });
    // The startup syncs settle and the sampler records the sentence being spoken
    await vi.advanceTimersByTimeAsync(5000);
    const sync = JSON.parse(diagnostics.positionSync());
    expect({ native: sync.transport.lastOutcome, shared: sync.shared.transport.lastOutcome, rows: sync.localEntries }).toEqual({ native: 'ok', shared: 'ok', rows: 1 });

    manager.paused = true;
    const pausedAt = Date.now();
    await vi.advanceTimersByTimeAsync(1000);
    const after = dav.log.filter((request) => request.at >= pausedAt && FILES.includes(request.name));
    expect(FILES.map((name) => after.some((request) => request.method === 'GET' && request.name === name))).toEqual([true, true]);
  });
});
