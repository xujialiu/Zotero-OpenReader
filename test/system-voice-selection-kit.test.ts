import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const P = 'extensions.zotero.zotero-tts.';
const WEB = P + 'webdav.enabled';
const VOL = P + 'readAloud.volume';
const MEMORY = P + 'readAloud.memory';
const DOC = P + 'documentVoices.user/OWNER123';
const kit = new URL('./zotero-dev/scripts/system-voice-selection/', import.meta.url);

/** Execute real kit scripts against inert preference/reader boundaries. */
function environment(folder = true, busy = false) {
  type Value = string | number | boolean;
  const defaults = new Map<string, Value>([[VOL, 37], [P + 'readAloud.favoritesOnly', false]]);
  const users = new Map<string, Value>([
    [WEB, folder], [P + 'system.enabled', true], [MEMORY, 'original memory'],
    [P + 'readAloud.defaultVoice', 'original default'], [DOC, 'original document'],
    ['extensions.zotero.reader.readAloudVoices', 'original native'],
  ]);
  const get = (name: string, fallback?: unknown) => users.get(name) ?? defaults.get(name) ?? fallback;
  const writes: { name: string; value: unknown }[] = [];
  const set = (name: string, value: Value) => { writes.push({ name, value }); users.set(name, value); };
  const clear = (name: string) => { users.delete(name); writes.push({ name, value: get(name) }); };
  const prefs = {
    getPrefType: (name: string) => typeof get(name) === 'string' ? 32 : typeof get(name) === 'number' ? 64 : typeof get(name) === 'boolean' ? 128 : 0,
    prefHasUserValue: (name: string) => users.has(name),
    getStringPref: get, getIntPref: get, getBoolPref: get,
    setStringPref: set, setIntPref: set, setBoolPref: set, clearUserPref: clear,
    getBranch: (prefix: string) => ({ getChildList: () => [...users.keys()].filter(n => n.startsWith(prefix)).map(n => n.slice(prefix.length)) }),
  };
  const state: Record<string, any> = {};
  const win = { windowState: 2, Zotero_Tabs: { selectedID: 'original', _tabs: [], select() {}, close() {} }, minimize() { this.windowState = 2; } };
  const diagnostics = {
    position: () => JSON.stringify({ database: { rows: 75 }, legacyPref: null }),
    positionSync: () => JSON.stringify({ folder: get(WEB), transport: { running: false, lastOutcome: 'ok' }, shared: { transport: { running: false, lastOutcome: 'ok' } } }),
    settingsSync: () => JSON.stringify({ transport: { running: false, pendingChange: false, lastOutcome: 'ok' } }),
    settingsUpload: () => JSON.stringify({ autoUpload: { pending: busy, lastOutcome: 'ok', uploads: 0 } }),
  };
  const context = {
    Zotero: {
      ZoteroTTSRun: { state, params: {} }, ZoteroTTS: { diagnostics },
      Debug: { storing: false, setStore() {} }, getErrors: () => [],
      getMainWindow: () => win, Reader: { _readers: [] }, Items: { get: () => null },
    },
    Services: { prefs, wm: { getMostRecentWindow: () => null } },
    setTimeout: (fn: () => void) => queueMicrotask(fn),
  };
  const run = async (name: string) => JSON.parse(await runInNewContext(readFileSync(new URL(name, kit), 'utf8'), context));
  const snapshot = () => {
    const names = [WEB, P + 'system.enabled', VOL, MEMORY, P + 'readAloud.defaultVoice', 'extensions.zotero.reader.readAloudVoices'];
    state.svsPrefs = Object.fromEntries(names.map(name => [name, {
      user: users.has(name), value: users.has(name) ? get(name) : null, effective: get(name),
      type: prefs.getPrefType(name) === 128 ? 'bool' : prefs.getPrefType(name) === 64 ? 'int' : 'string',
    }]));
    state.svsPrefs.__documentVoices = { 'user/OWNER123': users.get(DOC) };
    state.svsRowsBaseline = 75;
    state.svsFixtureItemID = 7;
    state.svsFixtureDocVoiceKey = P + 'documentVoices.user/FIXTURE7';
    state.svsWindow = { selectedID: 'original' };
    state.svsDebugStoring = false;
  };
  const dirty = () => { set(WEB, false); set(VOL, 0); set(MEMORY, 'temporary memory'); writes.length = 0; };
  return { defaults, users, get, writes, context, state, run, snapshot, dirty };
}

describe('System voice selection kit isolation and restoration', () => {
  it('turns an initially enabled folder off before muting', async () => {
    const e = environment();
    const result = await e.run('01-baseline-isolate.js');
    expect(result.folderOff.confirmed).toBe(true);
    expect(e.writes.filter(w => w.name === WEB || w.name === VOL)).toEqual([
      { name: WEB, value: false }, { name: VOL, value: 0 },
    ]);
    expect(e.state.svsPrefs[VOL]).toMatchObject({ user: false, effective: 37 });
  });

  it('refuses a busy fourth transport before any preference write', async () => {
    const e = environment(false, true);
    await expect(e.run('01-baseline-isolate.js')).rejects.toThrow();
    expect(e.writes).toEqual([]);
  });

  it('keeps the folder off through reading-pref restoration and restores it last', async () => {
    const e = environment(); e.snapshot(); e.dirty();
    await e.run('09-cleanup-restore.js');
    const on = e.writes.findIndex(w => w.name === WEB && w.value === true);
    const memory = e.writes.findIndex(w => w.name === MEMORY);
    const volume = e.writes.findIndex(w => w.name === VOL);
    expect(on).toBeGreaterThan(memory);
    expect(on).toBeGreaterThan(volume);
    expect(e.get(VOL)).toBe(37);
    expect(e.users.has(VOL)).toBe(false);
  });

  it('restores an originally disabled folder rather than hard-coding true', async () => {
    const e = environment(false); e.snapshot(); e.dirty();
    await e.run('09-cleanup-restore.js');
    expect(e.get(WEB)).toBe(false);
    expect(e.writes.some(w => w.name === WEB && w.value === true)).toBe(false);
  });

  it('compares document-record contents, not merely the key set', async () => {
    const e = environment(); e.snapshot(); e.dirty();
    e.users.set(DOC, 'concurrent document change');
    const result = await e.run('09-cleanup-restore.js');
    expect(result.docVoicesMatchBaseline).toBe(false);
    expect(e.get(WEB)).toBe(false);
    expect(e.users.get(DOC)).toBe('concurrent document change');
  });
});
