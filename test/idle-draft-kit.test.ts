import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const kit = new URL('./zotero-dev/scripts/entry-language-picks/', import.meta.url);
const P = 'extensions.zotero.zotero-tts.';
const NATIVE = 'extensions.zotero.reader.readAloudVoices';
const OWNER_NATIVE = '{ "en": {"voice":"owner-native"}, "fr":{"voice":"owner-french"} }\n';

/** Real script execution over the external Gecko preference/reader interface; no live profile. */
function environment(options: { systemUser?: boolean; defaultOnly?: boolean; version?: string } = {}) {
  type Value = string | number | boolean;
  const defaults = new Map<string, Value>([
    [P + 'system.enabled', false], [P + 'webdav.enabled', false], [P + 'readAloud.volume', 37],
    [P + 'readAloud.memory', 'OWNER_MEMORY'], [NATIVE, OWNER_NATIVE],
  ]);
  const users = new Map<string, Value>([
    [P + 'readAloud.speedPercent', 157], [P + 'documentVoiceChanged', '41'],
    [P + 'readAloud.defaultVoice', 'OWNER_DEFAULT'], [P + 'documentVoices.user/OWNER123', 'OWNER_RECORD'],
  ]);
  if (!options.defaultOnly) {
    users.set(P + 'readAloud.volume', 37); users.set(P + 'readAloud.memory', 'OWNER_MEMORY'); users.set(NATIVE, OWNER_NATIVE);
  }
  if (options.systemUser) users.set(P + 'system.enabled', true);
  const get = (n: string, fallback?: unknown) => users.get(n) ?? defaults.get(n) ?? fallback;
  const writes: string[] = [];
  let refuseVolumeRestore = false;
  const set = (n: string, v: Value) => { writes.push(n); users.set(n, refuseVolumeRestore && n === P + 'readAloud.volume' && v === 37 ? 99 : v); };
  const prefs = {
    getPrefType: (n: string) => ({ string: 32, number: 64, boolean: 128 }[typeof get(n) as 'string' | 'number' | 'boolean'] ?? 0),
    getStringPref: get, getIntPref: get, getBoolPref: get, prefHasUserValue: (n: string) => users.has(n),
    setStringPref: set, setIntPref: set, setBoolPref: set,
    clearUserPref: (n: string) => { writes.push(n); users.delete(n); },
    getChildList: (prefix: string) => [...new Set([...defaults.keys(), ...users.keys()])].filter(n => n.startsWith(prefix)).sort(),
    getBranch(prefix: string): any {
      return Object.fromEntries(Object.entries(prefs).filter(([k]) => k !== 'getBranch').map(([k, fn]) => [k,
        k === 'getChildList' ? (name: string) => prefs.getChildList(prefix + name).map(n => n.slice(prefix.length))
          : (name: string, ...args: unknown[]) => Reflect.apply(fn, prefs, [prefix + name, ...args]),
      ]));
    },
  };
  const state: Record<string, any> = {};
  const items = new Map<number, any>();
  const ownerManager = { active: false, paused: true, selectedVoiceID: 'owner-voice' };
  const readers: any[] = [{ itemID: 1, tabID: 'owner', _internalReader: { _readAloudManager: ownerManager } }];
  const closed: number[] = [];
  const win = {
    windowState: 2, outerWidth: 900, outerHeight: 700, screenX: 10, screenY: 20,
    minimize: vi.fn(), Zotero_Tabs: {
      selectedID: 'owner',
      select(id: string) { this.selectedID = id; },
      close(id: string) { const i = readers.findIndex(r => r.tabID === id); if (i >= 0) { closed.push(readers[i].itemID); readers.splice(i, 1); } },
    },
  };
  const debug = { storing: true, setStore: vi.fn() };
  const consoleRows: { timeStamp: number }[] = [];
  const context = {
    Zotero: {
      version: '10.0.6', isMac: true, ZoteroTTSRun: { state, params: { expectedVersion: '1.16.16-beta2' } },
      getErrors: () => [], Debug: debug, getMainWindow: () => win, Reader: { _readers: readers },
      Items: { get: (id: number) => items.get(id) },
      ZoteroTTS: { diagnostics: {
        startup: () => JSON.stringify({ version: options.version ?? '1.16.16-beta2', failed: [], steps: [] }),
        positionSync: () => JSON.stringify({ folder: get(P + 'webdav.enabled'), transport: { pending: 0 } }),
        position: () => JSON.stringify({ database: { rows: 78 + items.size }, legacyPref: null }),
      } },
    },
    Services: { prefs, console: { getMessageArray: () => consoleRows }, wm: { getMostRecentWindow: () => null } },
    Components: { utils: { waiveXrays: (v: unknown) => v }, interfaces: { nsIScriptError: {} } },
    setTimeout: (fn: () => void) => queueMicrotask(fn),
  };
  const run = async (name: string) => JSON.parse(await runInNewContext(readFileSync(new URL(name, kit), 'utf8'), context));
  const baseline = async () => { await run('232-00-baseline.js'); return run('232-01-isolate.js'); };
  const fixture = () => {
    const manager = { active: true, paused: true };
    items.set(7, { key: 'FIXTURE7', eraseTx: async () => { items.delete(7); } });
    readers.push({ itemID: 7, tabID: 'fixture', _internalReader: {
      _readAloudManager: manager, toggleReadAloudPopup: () => { manager.active = false; },
    } });
    users.set(P + 'documentVoices.user/FIXTURE7', 'FIXTURE_RECORD');
    state.ep232.fixture = { itemID: 7, key: 'FIXTURE7', title: 'fixture', created: true };
    state.ep232.fixtureRecordKey = 'documentVoices.user/FIXTURE7';
    win.Zotero_Tabs.selectedID = 'fixture';
    users.set(NATIVE, '{"en":{"voice":"fixture"}}');
    users.set(P + 'readAloud.memory', 'FIXTURE_MEMORY'); users.set(P + 'readAloud.speedPercent', 200);
    users.set(P + 'system.enabled', true); users.set(P + 'documentVoiceChanged', '42');
  };
  return { users, defaults, get, writes, state, readers, ownerManager, debug, win, closed, run, baseline, fixture, context, consoleRows,
    refuseRestore: () => { refuseVolumeRestore = true; } };
}

describe('idle-draft kit exact-leaf snapshots and cleanup', () => {
  it.each(['232-02-fixture.js', '232-03-plant.js', '232-04-open.js', '232-05-draft.js', '232-06-choose.js'])('%s rejects an unvalidated run before writing preferences', async name => {
    const e = environment();
    expect((await e.run(name)).ok).toBe(false);
    expect(e.writes).toEqual([]);
    expect(e.closed).toEqual([]);
  });

  it('plants only a fresh run-owned key, uses the controlled native lane, and does not bump the pulse', async () => {
    const e = environment(); await e.baseline();
    e.state.ep232.fixture = { itemID: 7, key: 'FIXTURE7', created: true };
    expect((await e.run('232-03-plant.js')).ok).toBe(true);
    expect(JSON.parse(String(e.get(P + 'documentVoices.user/FIXTURE7')))).toMatchObject({ voice: { id: 'ztts-232-missing-voice', lang: 'en' }, manual: true });
    expect(e.get(P + 'documentVoiceChanged')).toBe('41');
    expect(e.state.ep232.prefs.nativeVoices.value).toBe(OWNER_NATIVE);
  });

  it('refuses to overwrite an existing fixture-key record before enabling System', async () => {
    const e = environment(); await e.baseline();
    e.state.ep232.fixture = { itemID: 7, key: 'FIXTURE7', created: true };
    e.users.set(P + 'documentVoices.user/FIXTURE7', 'PREEXISTING'); e.writes.length = 0;
    expect((await e.run('232-03-plant.js')).ok).toBe(false);
    expect(e.get(P + 'documentVoices.user/FIXTURE7')).toBe('PREEXISTING');
    expect(e.writes).toEqual([]);
  });

  it('reads the real native entry and pauses immediately without treating console movement as a refusal', async () => {
    const e = environment(); await e.baseline(); e.fixture();
    const W = 'system::second', V = 'system::first';
    const reader = e.readers.find(r => r.itemID === 7), m = reader._internalReader._readAloudManager;
    m.pause = vi.fn(() => { m.paused = true; });
    const commands: unknown[][] = [];
    reader._iframeWindow = { document: { querySelectorAll: () => [{ contentWindow: {
      zttsCommand: async (...args: unknown[]) => {
        commands.push(args); m.active = true; m.paused = false; m.selectedVoiceID = W;
        e.users.set(NATIVE, JSON.stringify({ en: { voice: W, region: 'US', tierVoices: { system: W } } }));
        e.consoleRows.push({ timeStamp: 100 });
      },
    } }] } };
    e.state.ep232.fixture.created = true; e.state.ep232.reader = { index: 1 }; e.state.ep232.W = W; e.state.ep232.V = V;
    Object.assign(e.context.Zotero.ZoteroTTS.diagnostics, {
      voiceSwitch: () => JSON.stringify({ readers: [{ index: 1, selected: m.selectedVoiceID, paused: m.paused,
        player: { provider: 'system', locale: 'en-US', voice: W, chooseVoice: false }, handoff: { draft: null, notice: 'selected' } }] }),
      documentVoices: () => JSON.stringify({ readers: [{ key: 'user/FIXTURE7', saved: { voice: { id: W, lang: 'en' }, manual: true } }] }),
    });
    const result = await e.run('232-06-choose.js');
    expect(result.ok).toBe(true);
    expect(result.nativeEntry.voice).toBe(W);
    expect(result.newConsoleSinceCommit).toBe(true);
    expect(m.pause).toHaveBeenCalledOnce();
    expect(commands).toEqual([['voice', W]]);
  });

  it('captures the actual native/volume leaves and registered defaults before mutation', async () => {
    const e = environment();
    expect((await e.baseline()).ok).toBe(true);
    expect(e.state.ep232.prefs.nativeVoices.value).toBe(OWNER_NATIVE);
    expect(e.state.ep232.prefs.volume.value).toBe(37);
    expect(e.state.ep232.prefs.systemEnabled).toMatchObject({ type: 'bool', value: false, hasUser: false });
    expect(e.writes.some(n => n.endsWith('.'))).toBe(false);
  });

  it('rejects the wrong installed build before changing debug, window or prefs', async () => {
    const e = environment({ version: '1.16.16-beta' });
    expect((await e.run('232-00-baseline.js')).ok).toBe(false);
    expect(e.writes).toEqual([]);
    expect(e.debug.setStore).not.toHaveBeenCalled();
    expect(e.win.minimize).not.toHaveBeenCalled();
  });

  it.each([false, true])('restores exact values and user flags without hardcoded recovery values (System user: %s)', async systemUser => {
    const e = environment({ systemUser }); await e.baseline(); e.fixture();
    expect((await e.run('232-99-cleanup.js')).ok).toBe(true);
    expect(e.get(NATIVE)).toBe(OWNER_NATIVE);
    expect(e.get(P + 'readAloud.volume')).toBe(37);
    expect(e.get(P + 'readAloud.memory')).toBe('OWNER_MEMORY');
    expect(e.get(P + 'readAloud.speedPercent')).toBe(157);
    expect(e.get(P + 'documentVoiceChanged')).toBe('41');
    expect(e.get(P + 'system.enabled')).toBe(systemUser);
    expect(e.users.has(P + 'system.enabled')).toBe(systemUser);
    expect(e.closed).toEqual([7]);
    expect(e.readers.map(r => r.itemID)).toEqual([1]);
    expect(e.users.get(P + 'documentVoices.user/OWNER123')).toBe('OWNER_RECORD');
  });

  it('clears test user values to recover default-only strings and volume without manufacturing user values', async () => {
    const e = environment({ defaultOnly: true }); await e.baseline(); e.fixture();
    expect((await e.run('232-99-cleanup.js')).ok).toBe(true);
    for (const key of [NATIVE, P + 'readAloud.volume', P + 'readAloud.memory']) expect(e.users.has(key)).toBe(false);
    expect(e.get(NATIVE)).toBe(OWNER_NATIVE);
    expect(e.get(P + 'readAloud.volume')).toBe(37);
  });

  it('does not replace a captured baseline on a resumed isolation step', async () => {
    const e = environment(); await e.baseline();
    const original = e.state.ep232.prefs;
    e.users.set(P + 'readAloud.volume', 53); e.writes.length = 0;
    expect((await e.run('232-01-isolate.js')).ok).toBe(false);
    expect(e.state.ep232.prefs).toBe(original);
    expect(e.state.ep232.prefs.volume.value).toBe(37);
    expect(e.get(P + 'readAloud.volume')).toBe(53);
    expect(e.writes).toEqual([]);
  });

  it('refuses incomplete snapshots before restoring or guessing preferences', async () => {
    const e = environment(); await e.baseline();
    e.state.ep232.prefs = { ...e.state.ep232.prefs, memory: undefined }; e.writes.length = 0;
    expect((await e.run('232-99-cleanup.js')).ok).toBe(false);
    expect(e.writes).toEqual([]);
  });

  it('rejects a malformed snapshot value before any preference write', async () => {
    const e = environment(); await e.baseline();
    e.state.ep232.prefs = { ...e.state.ep232.prefs, nativeVoices: { type: 'string', value: null, hasUser: true } };
    e.writes.length = 0;
    expect((await e.run('232-99-cleanup.js')).ok).toBe(false);
    expect(e.writes).toEqual([]);
  });

  it('does not replace owner-record evidence or restore global prefs over a concurrent owner change', async () => {
    const e = environment(); await e.baseline(); e.fixture();
    const frozen = e.state.ep232.docVoiceRecords;
    e.users.set(P + 'documentVoices.user/OWNER123', 'OWNER_CHANGED'); e.writes.length = 0;
    expect((await e.run('232-99-cleanup.js')).ok).toBe(false);
    expect(e.state.ep232.docVoiceRecords).toBe(frozen);
    expect(e.users.get(P + 'documentVoices.user/OWNER123')).toBe('OWNER_CHANGED');
    expect(e.writes).not.toContain(NATIVE);
    expect(e.writes).not.toContain(P + 'documentVoiceChanged');
  });

  it('refuses a corrupted fixture identity that points to a baseline owner reader', async () => {
    const e = environment(); await e.baseline();
    e.state.ep232.fixture = { itemID: 1, key: 'OWNER123', created: true }; e.writes.length = 0;
    expect((await e.run('232-99-cleanup.js')).ok).toBe(false);
    expect(e.closed).toEqual([]);
    expect(e.readers.map(r => r.itemID)).toEqual([1]);
    expect(e.writes).toEqual([]);
  });

  it('detects a value overwritten by an observer even when type and user flag still match', async () => {
    const e = environment(); await e.baseline(); e.fixture(); e.refuseRestore();
    expect((await e.run('232-99-cleanup.js')).ok).toBe(false);
  });
});
