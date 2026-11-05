import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = new URL('./zotero-dev/scripts/shared-anchor-integrity/', import.meta.url);
const prefix = 'extensions.zotero.zotero-tts.';
const folder = prefix + 'webdav.enabled';
const switches = ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings'];

function setup(enabled = true, busy = false) {
  type Value = string | number | boolean;
  const names = ['webdav.enabled', ...switches, 'webdav.url', 'webdav.username', 'webdav.password', 'webdav.syncState', 'readAloud.volume', 'readAloud.memory', 'reader.readAloudVoices', 'readAloud.defaultVoice', 'webdav.enabledMigrated'];
  const full = (name: string) => name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
  const defaults = new Map<string, Value>([[prefix + 'readAloud.volume', 19]]);
  const users = new Map<string, Value>(names.map(name => [full(name), name === 'webdav.enabled' ? enabled : switches.includes(name) || name === 'webdav.enabledMigrated' ? true : `${name}-original`]));
  users.delete(prefix + 'readAloud.volume');
  const get = (key: string) => users.get(key) ?? defaults.get(key);
  const type = (value: unknown) => typeof value === 'boolean' ? 128 : typeof value === 'number' ? 64 : typeof value === 'string' ? 32 : 0;
  const baseline = Object.fromEntries(names.map(name => [name, { key: full(name), user: users.has(full(name)), type: type(get(full(name))), value: get(full(name)) }]));
  users.set(folder, false);
  for (const name of switches) users.set(full(name), false);
  users.set(full('webdav.url'), 'test-destination'); users.set(full('readAloud.volume'), 0);
  const writes: { key: string; value: unknown }[] = [];
  const set = (key: string, value: Value) => { users.set(key, value); writes.push({ key, value }); };
  let ignored: string | null = null;
  const prefs = {
    PREF_BOOL: 128, PREF_INT: 64, PREF_STRING: 32,
    getPrefType: (key: string) => type(get(key)), prefHasUserValue: (key: string) => users.has(key),
    getBoolPref: get, getStringPref: get, getIntPref: get,
    getBranch: (branch: string) => ({ getChildList: () => [...users.keys()].filter(key => key.startsWith(branch)).map(key => key.slice(branch.length)) }),
    setBoolPref: (key: string, value: Value) => { if (key !== ignored) set(key, value); },
    setStringPref: (key: string, value: Value) => { if (key !== ignored) set(key, value); },
    setIntPref: (key: string, value: Value) => { if (key !== ignored) set(key, value); },
    clearUserPref: (key: string) => { if (key !== ignored) { users.delete(key); writes.push({ key, value: get(key) }); } },
  };
  const state: Record<string, any> = { baselinePrefs: baseline, documentVoicesBefore: {}, cleanupVerified: true, debugStoringAtStart: false, baselineTabs: [], host: { selectedTabID: 'original' } };
  const win = { windowState: 2, minimize() {}, Zotero_Tabs: { selectedID: 'original', select() {} } };
  let time = 0;
  const context = {
    Date: class extends Date { static now() { return time += 10_000; } },
    setTimeout: (fn: () => void) => queueMicrotask(fn),
    Services: { prefs, wm: { getMostRecentWindow: () => win } },
    Zotero: {
      ZoteroTTSRun: { state, params: {} }, Debug: { storing: false, setStore() {} },
      getMainWindow: () => win, Reader: { _readers: [] }, getErrors: () => [],
      ZoteroTTS: { diagnostics: {
        position: () => JSON.stringify({ store: { queued: 0, writing: false } }),
        positionSync: () => JSON.stringify({ folder: get(folder), transport: { running: false }, shared: { transport: { running: false } } }),
        settingsSync: () => JSON.stringify({ transport: { running: false, pendingChange: false } }),
        settingsUpload: () => JSON.stringify({ autoUpload: { pending: busy } }),
      } },
    },
  };
  const run = async () => JSON.parse(await runInNewContext(readFileSync(new URL('62-cleanup-prefs-restore.js', root), 'utf8'), context));
  return { state, users, get, writes, run, ignore: (key: string) => { ignored = key; } };
}

describe('shared anchor kit restoration gates', () => {
  it('refuses restoration without a verified data cleanup gate', async () => {
    const e = setup(); e.state.cleanupVerified = false;
    expect((await e.run()).ok).toBe(false);
    expect(e.writes).toEqual([]);
  });
  it('refuses a busy fourth transport before any preference write', async () => {
    const e = setup(true, true);
    expect((await e.run()).ok).toBe(false);
    expect(e.writes).toEqual([]);
  });
  it('restores the destination and reading state before switches, and the folder last', async () => {
    const e = setup(); const r = await e.run();
    expect(r.ok).toBe(true);
    const destination = e.writes.findIndex(w => w.key === prefix + 'webdav.url');
    const memory = e.writes.findIndex(w => w.key === prefix + 'readAloud.memory');
    const enable = e.writes.findIndex(w => w.key === folder && w.value === true);
    for (const name of switches) expect(e.writes.findIndex(w => w.key === prefix + name && w.value === true)).toBeGreaterThan(destination);
    expect(enable).toBeGreaterThan(destination);
    if (memory >= 0) expect(enable).toBeGreaterThan(memory);
    expect(e.writes.at(-1)?.key).toBe(folder);
    expect(e.get(prefix + 'readAloud.volume')).toBe(19);
    expect(e.users.has(prefix + 'readAloud.volume')).toBe(false);
  });
  it('checks every snapshotted preference, not just the switch subset', async () => {
    const e = setup();
    e.users.set(prefix + 'webdav.username', 'temporary'); e.ignore(prefix + 'webdav.username');
    const r = await e.run();
    expect(r.ok).toBe(false);
    expect(e.get(folder)).toBe(false);
    expect(e.writes.some(w => w.key === folder && w.value === true)).toBe(false);
  });
  it('does not restore a snapshot under the wrong preference namespace', async () => {
    const e = setup(); e.state.baselinePrefs['webdav.enabled'].key = 'extensions.zotero.webdav.enabled';
    expect((await e.run()).ok).toBe(false);
    expect(e.writes).toEqual([]);
  });
  it('preserves independently changed document voices and leaves the folder off', async () => {
    const e = setup(); e.users.set(prefix + 'documentVoices.user/EXISTING', 'independent change');
    expect((await e.run()).ok).toBe(false);
    expect(e.writes).toEqual([]);
    expect(e.get(folder)).toBe(false);
  });
  it('restores an originally disabled folder without enabling it', async () => {
    const e = setup(false); const r = await e.run();
    expect(r.ok).toBe(true);
    expect(e.get(folder)).toBe(false);
    expect(e.writes.some(w => w.key === folder && w.value === true)).toBe(false);
  });
});
