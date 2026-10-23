import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Execute the retained baseline/cleanup scripts, not another implementation
// of their rules. No Zotero profile or credentials are accessed by these tests.
const kit = new URL('./zotero-dev/scripts/html-compatibility/', import.meta.url);
const source = (name: string) => readFileSync(new URL(name, kit), 'utf8');
const prefix = 'extensions.zotero.zotero-tts.';
const nativeVoices = 'extensions.zotero.reader.readAloudVoices';

function environment(settingsOpen = false) {
  const defaults = new Map<string, string | number | boolean>([
    [prefix + 'webdav.enabled', false], [prefix + 'readAloud.volume', 19],
    [prefix + 'azure.enabled', false], [prefix + 'readAloud.memory', 'DEFAULT_MEMORY'],
    [nativeVoices, 'DEFAULT_VOICES'],
  ]);
  const users = new Map<string, string | number | boolean>([
    [prefix + 'webdav.enabled', true], [prefix + 'readAloud.volume', 19],
    [nativeVoices, 'OWNER_VOICES'],
  ]);
  const get = (name: string, fallback?: unknown) => users.get(name) ?? defaults.get(name) ?? fallback;
  const prefs = {
    getPrefType: (name: string) => ({ string: 32, number: 64, boolean: 128 }[typeof get(name) as 'string' | 'number' | 'boolean'] ?? 0),
    getStringPref: get, getIntPref: get, getBoolPref: get,
    prefHasUserValue: (name: string) => users.has(name),
    setStringPref: (name: string, value: string) => { users.set(name, value); },
    setIntPref: (name: string, value: number) => { users.set(name, value); },
    setBoolPref: (name: string, value: boolean) => { users.set(name, value); },
    clearUserPref: (name: string) => { users.delete(name); },
    getChildList: (name: string) => [...new Set([...defaults.keys(), ...users.keys()])].filter(key => key.startsWith(name)),
  };
  const state: Record<string, any> = {};
  const items = new Map<number, { key: string; getField(): string; eraseTx(): Promise<void> }>();
  const readers: any[] = [];
  const closedPlayers: number[] = [], erased: number[] = [];
  const tabs: { id: string }[] = [{ id: 'zotero-pane' }, { id: 'owner' }];
  const main = {
    outerWidth: 800, outerHeight: 600, screenX: 10, screenY: 20, windowState: 3,
    minimize() { this.windowState = 2; },
    resizeTo(w: number, h: number) { this.outerWidth = w; this.outerHeight = h; },
    moveTo(x: number, y: number) { this.screenX = x; this.screenY = y; },
    Zotero_Tabs: {
      selectedID: 'owner', ids: [], tabs: {}, _tabs: tabs,
      close(id: string) { const i = readers.findIndex(r => r.tabID === id); if (i >= 0) readers.splice(i, 1); const t = tabs.findIndex(t => t.id === id); if (t >= 0) tabs.splice(t, 1); },
      select(id: string) { this.selectedID = id; },
    },
  };
  const settings = { open: settingsOpen, close: vi.fn(() => { settings.open = false; users.set(prefix + 'readAloud.volume', 0); }) };
  const debug = { storing: false, setStore(on: boolean) { this.storing = on; } };
  let positionRows = 7;
  const context = {
    Zotero: {
      version: '10.0.6', ZoteroTTSRun: { state, params: {} },
      getMainWindow: () => main, Reader: { _readers: readers },
      Items: { get: (id: number) => items.get(id) }, Debug: debug,
      Promise: { delay: async () => {} },
      ZoteroTTS: { diagnostics: {
        positionSync: async () => JSON.stringify({ folder: get(prefix + 'webdav.enabled'), transport: { running: false } }),
        position: async () => JSON.stringify({ database: { rows: positionRows } }),
        startup: () => JSON.stringify({ version: 'test', steps: [], failed: [] }),
      } },
    },
    Services: { prefs, wm: { getMostRecentWindow: () => settings.open ? settings : null } },
    Components: { utils: { waiveXrays: (v: unknown) => v } },
    setTimeout: (fn: () => void) => queueMicrotask(fn),
  };
  const add = (id: number, key: string, tabID: string) => {
    items.set(id, { key, getField: () => key, eraseTx: async () => { erased.push(id); items.delete(id); } });
    const manager = { active: true, paused: true };
    readers.push({ itemID: id, tabID, _internalReader: { _readAloudManager: manager, toggleReadAloudPopup() { manager.active = false; closedPlayers.push(id); } } });
    if (!tabs.some(t => t.id === tabID)) tabs.push({ id: tabID });
    users.set(prefix + 'documentVoices.user/' + key, 'VOICE');
  };
  const run = async (name: string) => JSON.parse(await runInNewContext(source(name), context));
  const baseline = async () => {
    await run('00-webdav-off.js');
    await run('01-baseline-snapshot.js');
  };
  return { state, users, defaults, get, main, settings, debug, add, run, baseline, closedPlayers, erased, readers,
    setRows: (n: number) => { positionRows = n; } };
}

describe('HTML verification kit restoration', () => {
  it('uses the actual baseline field names, restores native prefs and defaults, and preserves owner state', async () => {
    const e = environment(true);
    e.add(9, 'OWNER999', 'owner');
    await e.baseline();
    e.add(1, 'FIXTURE1', 'test1'); e.add(2, 'FIXTURE2', 'test2');
    e.state.fx = { same: { id: 1, key: 'FIXTURE1' } };
    e.state.fx2 = { same: { id: 2, key: 'FIXTURE2' } };
    e.users.set(nativeVoices, 'TEST_VOICES');
    e.users.set(prefix + 'readAloud.memory', 'TEST_MEMORY');
    e.users.set(prefix + 'azure.enabled', true);
    expect((await e.run('80-cleanup-teardown.js')).ok).toBe(true);
    expect(e.closedPlayers).toEqual([1, 2]);
    expect(e.erased).toEqual([1, 2]);
    expect(e.readers.map(r => r.itemID)).toEqual([9]);
    expect(e.users.has(prefix + 'documentVoices.user/OWNER999')).toBe(true);
    expect(e.users.has(prefix + 'reader.readAloudVoices')).toBe(false);
    expect(e.get(nativeVoices)).toBe('OWNER_VOICES');
    expect(e.get(prefix + 'readAloud.memory')).toBe('DEFAULT_MEMORY');
    expect(e.users.has(prefix + 'readAloud.memory')).toBe(false);
    expect((await e.run('81-cleanup-restore.js')).ok).toBe(true);
    expect(e.get(prefix + 'webdav.enabled')).toBe(true);
    expect(e.settings.close).not.toHaveBeenCalled();
    expect(e.debug.storing).toBe(false);
    expect(e.main.windowState).toBe(2);
    expect(e.main.Zotero_Tabs.selectedID).toBe('owner');
  });

  it('closes a test-created settings window before restoring preferences', async () => {
    const e = environment(); await e.baseline(); e.settings.open = true;
    expect((await e.run('80-cleanup-teardown.js')).ok).toBe(true);
    expect(e.settings.close).toHaveBeenCalledOnce();
    expect(e.get(prefix + 'readAloud.volume')).toBe(19);
    expect((await e.run('81-cleanup-restore.js')).ok).toBe(true);
    expect(e.get(prefix + 'readAloud.volume')).toBe(19);
  });

  it.each(['baseline', 'window', 'webdav', 'rows'])('keeps WebDAV off when %s restoration is not proven', async missing => {
    const e = environment(); await e.baseline();
    if (missing === 'baseline') delete e.state.baseline;
    if (missing === 'window') delete e.state.baseline.window;
    if (missing === 'webdav') delete e.state.webdav;
    if (missing === 'rows') e.setRows(8);
    await e.run('80-cleanup-teardown.js');
    const result = await e.run('81-cleanup-restore.js');
    expect(result.ok).toBe(false);
    expect(result.blocked.folderLeftOff).toBe(true);
    expect(e.get(prefix + 'webdav.enabled')).toBe(false);
  });

  it('preserves an originally-off default without manufacturing a user value', async () => {
    const e = environment(); e.users.delete(prefix + 'webdav.enabled');
    await e.baseline();
    await e.run('80-cleanup-teardown.js');
    expect((await e.run('81-cleanup-restore.js')).ok).toBe(true);
    expect(e.get(prefix + 'webdav.enabled')).toBe(false);
    expect(e.users.has(prefix + 'webdav.enabled')).toBe(false);
  });

  it('retains syntactically valid scripts with no corrupted identifier fallbacks', () => {
    for (const name of readdirSync(kit).filter(name => name.endsWith('.js'))) {
      expect(() => new Function(source(name))).not.toThrow();
      expect(source(name)).not.toContain('reade(');
    }
  });
});
