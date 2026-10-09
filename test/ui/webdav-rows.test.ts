import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { BACKUP_FILENAME, BACKUP_FORMAT, createBackup, machineSettingsFilename, parseBackup, serializeBackup, type FlatSettings } from '../../src/core/settings-backup';
import { WebDAVError, type WebDAVClient, type WebDAVConfig, type WebDAVFile } from '../../src/core/webdav';
import { initWebDAVRows, settingsFileLabel, WEBDAV_IDS, type WebDAVRowsDeps } from '../../src/ui/webdav-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  /** A description's text: the message line is one (issue #31). */
  textContent = '';
  listeners = new Map<string, Array<() => unknown>>();
  value?: string;
  disabled = false;
  /** The folder's fields, for the group that holds them (issue #173). */
  children: FakeElement[] = [];
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  after() {}
  querySelectorAll(_selector: string) {
    return this.children;
  }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  /** Fires the handlers and waits for the async ones. */
  async fire(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((fn) => fn()));
  }
}

const FOLDER = 'https://dav.example.com/zotero-tts/';
const MACHINE_FILE = machineSettingsFilename('this-mac');

function setup(
  options: {
    prefs?: Record<string, unknown>;
    url?: string;
    confirm?: boolean;
    reading?: string[];
    /** The reading guard's question (issue #160); with it the reading tabs come with a close each, which takes the tab off `reading`. Absent, the guard only refuses. */
    askToClose?: (message: string) => Promise<boolean>;
    verify?: (restored: FlatSettings) => Promise<string>;
    files?: WebDAVFile[];
    select?: (title: string, options: string[]) => number | null;
  } = {},
) {
  const els = new Map((Object.values(WEBDAV_IDS) as string[]).map((id) => [id, new FakeElement()]));
  // The folder's three fields, the password a secret (issue #173)
  const fields = { url: new FakeElement(), username: new FakeElement(), password: new FakeElement() };
  fields.password.setAttribute('class', 'ztts-secret');
  els.get(WEBDAV_IDS.folder)!.children = Object.values(fields);
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs({
    // On unless a test says otherwise: the server copy's buttons use the folder only while it is (issue #173)
    [PREF_PREFIX + 'webdav.enabled']: true,
    [PREF_PREFIX + 'webdav.url']: options.url ?? 'https://dav.example.com/zotero-tts',
    [PREF_PREFIX + 'webdav.username']: 'ann',
    [PREF_PREFIX + 'webdav.password']: 'pw',
    ...options.prefs,
  });
  const client = {
    url: FOLDER,
    check: vi.fn(async () => {}),
    upload: vi.fn(async (_name: string, _text: string) => {}),
    download: vi.fn(async (_name: string) => ''),
    // The pre-1.11 shared file by default, so a one-file restore takes it
    list: vi.fn(async (): Promise<WebDAVFile[]> => options.files ?? [{ name: BACKUP_FILENAME, lastModified: null }]),
  };
  const deps = {
    prefs,
    createClient: vi.fn((cfg: WebDAVConfig): WebDAVClient => {
      if (!cfg.url) throw new WebDAVError('config', 'Set the WebDAV URL first.');
      return client;
    }),
    machineId: { get: vi.fn(() => 'this-mac'), set: vi.fn((raw: string) => (raw.trim() ? raw.trim() : 'this-mac')) },
    pluginVersion: '1.1.3',
    now: () => '2026-08-23T10:00:00.000Z',
    confirm: vi.fn(() => options.confirm ?? true),
    onRestored: vi.fn(),
    onMachineRenamed: vi.fn(),
    readingTabs: vi.fn(() => options.reading ?? []),
    warn: vi.fn((_message: string) => {}),
    ...(options.askToClose
      ? {
          askToClose: vi.fn(options.askToClose),
          affectedPlayers: () => {
            const reading = options.reading ?? [];
            return reading.map((title) => ({ title, close: () => void reading.splice(reading.indexOf(title), 1) }));
          },
        }
      : {}),
    ...(options.select ? { select: vi.fn(options.select) } : {}),
    ...(options.verify ? { verifyProviders: options.verify } : {}),
  } satisfies WebDAVRowsDeps;
  const rows = initWebDAVRows(doc, deps);
  return {
    prefs,
    deps,
    client,
    rows,
    fields,
    el: (id: string) => els.get(id)!,
    // Test connection writes the WebDAV group's line, the server copy's buttons the Backup group's; a test reads whichever was written
    message: () => [els.get(WEBDAV_IDS.backupMessage)!.textContent, els.get(WEBDAV_IDS.message)!.textContent].filter(Boolean).join(' '),
  };
}

describe('Upload settings now', () => {
  it('uploads this machine’s own file, built from the settings as they are now', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.apiKey']: 'secret' } });
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({
      enabled: true,
      url: 'https://dav.example.com/zotero-tts',
      username: 'ann',
      password: 'pw',
      syncPositions: true,
      autoUploadSettings: false,
      syncSettings: false,
    });
    expect(t.client.upload).toHaveBeenCalledOnce();
    const [name, text] = t.client.upload.mock.calls[0];
    expect(name).toBe(MACHINE_FILE);
    const backup = JSON.parse(text);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, pluginVersion: '1.1.3', exportedAt: '2026-08-23T10:00:00.000Z', machine: 'this-mac' });
    expect(backup.settings['azure.apiKey']).toBe('secret');
    expect(backup.settings['webdav.password']).toBe('pw');
    expect(t.message()).toContain(FOLDER + MACHINE_FILE);
    expect(t.message()).toMatch(/API keys/);
  });

  it('reads the URL and credentials when clicked, not when the pane loaded', async () => {
    const t = setup();
    t.prefs.set(PREF_PREFIX + 'webdav.url', 'https://other.example.com/dav');
    t.prefs.set(PREF_PREFIX + 'webdav.password', 'new');
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({
      enabled: true,
      url: 'https://other.example.com/dav',
      username: 'ann',
      password: 'new',
      syncPositions: true,
      autoUploadSettings: false,
      syncSettings: false,
    });
  });

  it('asks for a URL before doing anything', async () => {
    const t = setup({ url: '' });
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.client.upload).not.toHaveBeenCalled();
    expect(t.message()).toBe('Upload failed: Set the WebDAV URL first.');
  });

  it('says what went wrong', async () => {
    const t = setup();
    t.client.upload.mockRejectedValueOnce(new WebDAVError('auth', 'The server rejected the username or password (HTTP 401).', 401));
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.message()).toBe('Upload failed: The server rejected the username or password (HTTP 401).');
  });

  it('ignores a click while another request is running', async () => {
    const t = setup();
    let finish!: () => void;
    t.client.upload.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const first = t.el(WEBDAV_IDS.upload).fire('command');
    await t.el(WEBDAV_IDS.download).fire('command');
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.client.list).not.toHaveBeenCalled();
    expect(t.client.upload).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(t.message()).toContain('Backed up');
  });
});

describe('Restore settings from server', () => {
  const file = serializeBackup(
    createBackup(fakePrefs({ [PREF_PREFIX + 'azure.region']: 'westeurope', [PREF_PREFIX + 'shortcuts.speedUp']: 'Ctrl+K' }), {
      exportedAt: '2026-08-20T08:00:00.000Z',
      machine: 'office-pc',
    }),
  );

  it('takes the one file there is, asks first, then applies it and redraws the unbound rows', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.list).toHaveBeenCalledOnce();
    expect(t.client.download).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining(FOLDER));
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('2026-08-20'));
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('office-pc'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.prefs.store[PREF_PREFIX + 'shortcuts.speedUp']).toBe('Ctrl+K');
    expect(t.deps.onRestored).toHaveBeenCalledOnce();
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(`Restored ${count} settings from ${FOLDER}${BACKUP_FILENAME}.`);
  });

  it('lists several machines newest first and downloads the chosen one', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('office-pc'), lastModified: 'Mon, 31 Aug 2026 08:00:00 GMT' },
      { name: BACKUP_FILENAME, lastModified: null },
      { name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' },
    ];
    const select = vi.fn((_title: string, _options: string[]) => 1);
    const t = setup({ files, select });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.deps.select).toHaveBeenCalledWith('Restore settings from which computer?', [
      'laptop — Tue, 01 Sep 2026 09:00:00 GMT',
      'office-pc — Mon, 31 Aug 2026 08:00:00 GMT',
      'shared file (before 1.11) — date unknown',
    ]);
    expect(t.client.download).toHaveBeenCalledWith(machineSettingsFilename('office-pc'));
  });

  it('takes the newest without asking when there is no picker', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('office-pc'), lastModified: 'Mon, 31 Aug 2026 08:00:00 GMT' },
      { name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' },
    ];
    const t = setup({ files });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).toHaveBeenCalledWith(machineSettingsFilename('laptop'));
  });

  it('does nothing when the picker is cancelled', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('a'), lastModified: null },
      { name: machineSettingsFilename('b'), lastModified: null },
    ];
    const t = setup({ files, select: () => null });
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  it('ignores the positions file and other files in the folder', async () => {
    const t = setup({
      files: [
        { name: 'zotero-tts-positions.json', lastModified: null },
        { name: 'notes.txt', lastModified: null },
        { name: BACKUP_FILENAME, lastModified: null },
      ],
    });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.deps.select).toBeUndefined();
  });

  it('says plainly when the folder holds no settings file', async () => {
    const t = setup({ files: [{ name: 'zotero-tts-positions.json', lastModified: null }] });
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).not.toHaveBeenCalled();
    expect(t.message()).toBe(`No settings backup on ${FOLDER} yet.`);
  });

  // The same commit point the file restore ends in (issue #21)
  it('checks the providers the downloaded settings turn on, and appends what it found', async () => {
    const t = setup({ verify: async () => 'Turned off local: the settings restored for it do not work here.' });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(
      `Restored ${count} settings from ${FOLDER}${BACKUP_FILENAME}. Turned off local: the settings restored for it do not work here.`,
    );
  });

  it('keeps the restore when the check itself throws', async () => {
    const t = setup({
      prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' },
      verify: async () => {
        throw new Error('no network');
      },
    });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.message()).toContain('Restored');
    expect(t.message()).toContain('no network');
  });

  it('changes nothing when the user declines', async () => {
    const t = setup({ confirm: false, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.onRestored).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  // The same guard the file restore has: a backup edits what the player
  // lists (issue #11)
  it('is refused while a tab is reading, and the settings stay as they were', async () => {
    const t = setup({ reading: ['Deep learning'], prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.deps.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.onRestored).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  // Issue #160: Close and continue closes the listed players, and the restore follows
  it('restores once the user closes the listed players, and not on Cancel', async () => {
    const reading = ['Deep learning'];
    const cancel = setup({ reading, askToClose: async () => false, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    cancel.client.download.mockResolvedValueOnce(file);
    await cancel.el(WEBDAV_IDS.download).fire('command');
    expect(reading).toEqual(['Deep learning']);
    expect(cancel.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(cancel.deps.onRestored).not.toHaveBeenCalled();
    const close = setup({ reading, askToClose: async () => true, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    close.client.download.mockResolvedValueOnce(file);
    await close.el(WEBDAV_IDS.download).fire('command');
    expect(close.deps.askToClose).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(reading).toEqual([]);
    expect(close.deps.onRestored).toHaveBeenCalledTimes(1);
    expect(close.message()).toContain('Restored');
    expect(close.deps.warn).not.toHaveBeenCalled();
  });

  it('reports a folder that does not exist yet', async () => {
    const t = setup();
    t.client.list.mockRejectedValueOnce(new WebDAVError('not-found', 'The folder x does not exist. It is created on the first upload.', 404));
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Restore failed: The folder x does not exist. It is created on the first upload.');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a backup, leaving the settings alone', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce('garbage');
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Restore failed: The file is not JSON');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('names the entries it had to skip', async () => {
    const t = setup();
    t.client.download.mockResolvedValueOnce(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { 'azure.region': 'eastus', 'future.setting': 1 } }),
    );
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe(`Restored 1 settings from ${FOLDER}${BACKUP_FILENAME}. Skipped 1: future.setting.`);
  });
});

describe('Test connection', () => {
  it('reports success with the folder URL', async () => {
    const t = setup();
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.message()).toBe(`Connected to ${FOLDER}.`);
  });

  it('reports a failure in the server’s terms', async () => {
    const t = setup();
    t.client.check.mockRejectedValueOnce(new WebDAVError('not-found', 'The folder x does not exist. It is created on the first upload.', 404));
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.message()).toBe('Connection failed: The folder x does not exist. It is created on the first upload.');
  });
});

// Issue #173: the folder has a switch of its own, run like a provider's
describe('The folder\u2019s switch', () => {
  const ENABLED = PREF_PREFIX + 'webdav.enabled';
  const USE_ROWS = [WEBDAV_IDS.syncPositions, WEBDAV_IDS.syncSettings, WEBDAV_IDS.autoUpload, WEBDAV_IDS.upload, WEBDAV_IDS.download];
  const off = { prefs: { [PREF_PREFIX + 'webdav.enabled']: false } };

  it('paints off as Enable, the fields open and the rows that use the folder greyed', () => {
    const t = setup(off);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(false);
    for (const id of USE_ROWS) expect(t.el(id).disabled, id).toBe(true);
    expect(t.el(WEBDAV_IDS.test).disabled).toBe(false);
  });

  it('paints on as Disable, the fields locked and the rows live', () => {
    const t = setup();
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Disable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(true);
    for (const id of USE_ROWS) expect(t.el(id).disabled, id).toBe(false);
  });

  it('Enable checks the folder first, then turns it on and locks its fields', async () => {
    const t = setup(off);
    t.fields.password.setAttribute('data-revealed', 'true');
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.prefs.store[ENABLED]).toBe(true);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}.`);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Disable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(true);
    // The password a user uncovered to type it is covered by the lock (issue #19)
    expect(t.fields.password.getAttribute('data-revealed')).toBeNull();
    for (const id of USE_ROWS) expect(t.el(id).disabled, id).toBe(false);
  });

  it('a failed check leaves the folder off, with the reason on its line', async () => {
    const t = setup(off);
    t.client.check.mockRejectedValueOnce(new WebDAVError('auth', 'The server rejected the username or password (HTTP 401).', 401));
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe('Connection failed: The server rejected the username or password (HTTP 401).');
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
    expect(t.el(WEBDAV_IDS.toggle).disabled).toBe(false);
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(false);
  });

  it('an empty address cannot go on', async () => {
    const t = setup({ ...off, url: '' });
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe('Connection failed: Set the WebDAV URL first.');
  });

  it('holds both buttons while the check runs, and a second click does nothing', async () => {
    const t = setup(off);
    let finish!: () => void;
    t.client.check.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const first = t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.el(WEBDAV_IDS.toggle).disabled).toBe(true);
    expect(t.el(WEBDAV_IDS.test).disabled).toBe(true);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe('Checking\u2026');
    await t.el(WEBDAV_IDS.toggle).fire('command');
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(t.prefs.store[ENABLED]).toBe(true);
    expect(t.el(WEBDAV_IDS.toggle).disabled).toBe(false);
    expect(t.el(WEBDAV_IDS.test).disabled).toBe(false);
  });

  it('Disable turns the folder off at once, with no check and no reading guard, and opens the fields', async () => {
    const t = setup({ reading: ['Moby-Dick'] });
    t.el(WEBDAV_IDS.message).textContent = `Connected to ${FOLDER}.`;
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.client.check).not.toHaveBeenCalled();
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe('');
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(false);
    for (const id of USE_ROWS) expect(t.el(id).disabled, id).toBe(true);
  });

  it('keeps the ticks of the switches under it while it is off', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'webdav.syncPositions']: true, [PREF_PREFIX + 'webdav.autoUploadSettings']: true } });
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'webdav.syncPositions']).toBe(true);
    expect(t.prefs.store[PREF_PREFIX + 'webdav.autoUploadSettings']).toBe(true);
  });

  it('a command that reaches a greyed server-copy button does nothing', async () => {
    const t = setup(off);
    await t.el(WEBDAV_IDS.upload).fire('command');
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.deps.createClient).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  it('Test connection probes without switching anything, off or on', async () => {
    const t = setup(off);
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}.`);
    const on = setup();
    on.client.check.mockRejectedValueOnce(new WebDAVError('network', 'Cannot reach the server.'));
    await on.el(WEBDAV_IDS.test).fire('command');
    expect(on.prefs.store[ENABLED]).toBe(true);
    expect(on.el(WEBDAV_IDS.message).textContent).toBe('Connection failed: Cannot reach the server.');
  });

  it('refresh() paints the switch as the prefs say now', () => {
    const t = setup(off);
    t.prefs.set(ENABLED, true);
    t.rows.refresh();
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Disable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(true);
  });
});

// Issue #174: an http:// folder is warned about at Enable and Test connection, never refused
describe('An unencrypted folder', () => {
  const WARNING =
    'Warning: http:// is not encrypted, so the password and the settings sent here, API keys included, can be read on the way. Use https:// if the server supports it.';
  const off = { [PREF_PREFIX + 'webdav.enabled']: false };

  it('Test connection says connected, then warns', async () => {
    const t = setup({ url: 'http://dav.example.com/zotero-tts' });
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}. ${WARNING}`);
  });

  it('warns after a failure too: the request has already gone out', async () => {
    const t = setup({ url: 'http://dav.example.com/zotero-tts' });
    t.client.check.mockRejectedValueOnce(new WebDAVError('auth', 'The server rejected the username or password (HTTP 401).', 401));
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connection failed: The server rejected the username or password (HTTP 401). ${WARNING}`);
  });

  it('Enable warns, and the folder still goes on', async () => {
    const t = setup({ url: 'HTTP://nas.local:5005/dav', prefs: off });
    await t.el(WEBDAV_IDS.toggle).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'webdav.enabled']).toBe(true);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}. ${WARNING}`);
  });

  it('warns about a home-network or local address as much as any other', async () => {
    for (const url of ['http://localhost:8080/dav', 'http://192.168.1.10/dav', 'http://nas.tail1234.ts.net/dav']) {
      const t = setup({ url, prefs: off });
      await t.el(WEBDAV_IDS.toggle).fire('command');
      expect(t.el(WEBDAV_IDS.message).textContent, url).toContain(WARNING);
    }
  });

  it('says nothing more for https://', async () => {
    const t = setup({ prefs: off });
    await t.el(WEBDAV_IDS.toggle).fire('command');
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}.`);
  });
});

// Issue #175: a restore checks the folder as Enable would, beside the providers (issue #21)
describe('verifyEnabled, after a restore', () => {
  const ENABLED = PREF_PREFIX + 'webdav.enabled';
  const TURNED_OFF = 'The WebDAV folder failed its check here, so it is off.';
  /** The state a restore leaves: the switch written off (core/settings-backup.ts applyBackup). */
  const restored = { prefs: { [ENABLED]: false } };

  it('turns a restored folder that passes on, and says where it connected', async () => {
    const t = setup(restored);
    expect(await t.rows.verifyEnabled(true)).toBe('');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.prefs.store[ENABLED]).toBe(true);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe(`Connected to ${FOLDER}.`);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Disable');
  });

  it('leaves a restored folder that fails off, its failure on its line and a sentence for the restore', async () => {
    const t = setup(restored);
    t.client.check.mockRejectedValueOnce(new WebDAVError('auth', 'The server rejected the username or password (HTTP 401).', 401));
    expect(await t.rows.verifyEnabled(true)).toBe(TURNED_OFF);
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.message).textContent).toBe('Connection failed: The server rejected the username or password (HTTP 401).');
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
    for (const field of Object.values(t.fields)) expect(field.disabled).toBe(false);
    expect(t.el(WEBDAV_IDS.upload).disabled).toBe(true);
  });

  it('re-checks a folder that is on when the file held no switch: its address may have changed under it', async () => {
    const t = setup();
    t.client.check.mockRejectedValueOnce(new WebDAVError('network', 'Cannot reach the server.'));
    expect(await t.rows.verifyEnabled(undefined)).toBe(TURNED_OFF);
    expect(t.prefs.store[ENABLED]).toBe(false);
  });

  it('warns about a restored http:// folder', async () => {
    const t = setup({ ...restored, url: 'http://nas.local:5005/dav' });
    await t.rows.verifyEnabled(true);
    expect(t.el(WEBDAV_IDS.message).textContent).toMatch(/^Connected to .*\. Warning: http:\/\/ is not encrypted/);
  });

  it('checks nothing for a folder the restore leaves off', async () => {
    for (const wanted of [false, undefined]) {
      const t = setup(restored);
      expect(await t.rows.verifyEnabled(wanted)).toBe('');
      expect(t.client.check).not.toHaveBeenCalled();
    }
  });

  it('a restore from the server keeps the folder off until its check passes, and the rows follow', async () => {
    const backup = serializeBackup(createBackup(fakePrefs({ [PREF_PREFIX + 'webdav.url']: 'https://dav.example.com/zotero-tts', [ENABLED]: true })));
    const t = setup({ verify: async () => '' });
    t.client.download.mockResolvedValueOnce(backup);
    let pass!: () => void;
    t.client.check.mockImplementationOnce(() => new Promise<void>((resolve) => (pass = resolve)));
    // The pane's restore check: the providers' and the folder's together
    t.deps.verifyProviders = async (settings: FlatSettings) => t.rows.verifyEnabled(settings['webdav.enabled'] as boolean | undefined);
    const restore = t.el(WEBDAV_IDS.download).fire('command');
    await vi.waitFor(() => expect(t.client.check).toHaveBeenCalledOnce());
    // Nothing may use the restored address while it is being checked
    expect(t.prefs.store[ENABLED]).toBe(false);
    pass();
    await restore;
    expect(t.prefs.store[ENABLED]).toBe(true);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Disable');
    expect(t.el(WEBDAV_IDS.download).disabled).toBe(false);
  });

  it('a restore from the server whose folder fails says so on the restore line, and the rows grey', async () => {
    const backup = serializeBackup(createBackup(fakePrefs({ [PREF_PREFIX + 'webdav.url']: 'https://dav.example.com/zotero-tts', [ENABLED]: true })));
    const t = setup({ verify: async () => '' });
    t.client.download.mockResolvedValueOnce(backup);
    t.client.check.mockRejectedValueOnce(new WebDAVError('network', 'Cannot reach the server.'));
    t.deps.verifyProviders = async (settings: FlatSettings) => t.rows.verifyEnabled(settings['webdav.enabled'] as boolean | undefined);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.prefs.store[ENABLED]).toBe(false);
    expect(t.el(WEBDAV_IDS.backupMessage).textContent).toContain(TURNED_OFF);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
    expect(t.el(WEBDAV_IDS.download).disabled).toBe(true);
  });

  it('a backup from before the switch that holds an address is checked, then turned on', async () => {
    const old = JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { 'webdav.url': 'https://dav.example.com/zotero-tts', 'webdav.syncPositions': true } });
    const t = setup();
    t.client.download.mockResolvedValueOnce(old);
    t.deps.verifyProviders = async (settings: FlatSettings) => t.rows.verifyEnabled(settings['webdav.enabled'] as boolean | undefined);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.prefs.store[ENABLED]).toBe(true);
  });

  it('leaves the folder to an Enable already checking it, as a provider mid-check is left (issue #21)', async () => {
    const t = setup(restored);
    let pass!: () => void;
    t.client.check.mockImplementationOnce(() => new Promise<void>((resolve) => (pass = resolve)));
    const enable = t.el(WEBDAV_IDS.toggle).fire('command');
    expect(await t.rows.verifyEnabled(true)).toBe('');
    expect(t.client.check).toHaveBeenCalledOnce();
    pass();
    await enable;
    expect(t.prefs.store[ENABLED]).toBe(true);
  });
});

// The commit point: Enable turns on only the folder it checked
describe('Enable while the folder changes under its check', () => {
  it('does not turn on an address other than the one that passed', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'webdav.enabled']: false } });
    let pass!: () => void;
    t.client.check.mockImplementationOnce(() => new Promise<void>((resolve) => (pass = resolve)));
    const enable = t.el(WEBDAV_IDS.toggle).fire('command');
    // A restore from a file, say, writes another address meanwhile
    t.prefs.set(PREF_PREFIX + 'webdav.url', 'https://elsewhere.example.com/dav');
    pass();
    await enable;
    expect(t.prefs.store[PREF_PREFIX + 'webdav.enabled']).toBe(false);
    expect(t.el(WEBDAV_IDS.toggle).attrs.get('label')).toBe('Enable');
  });
});

describe('This computer', () => {
  it('shows the stored id when the pane loads', () => {
    const t = setup();
    expect(t.deps.machineId.get).toHaveBeenCalled();
    expect(t.el(WEBDAV_IDS.machineId).value).toBe('this-mac');
  });

  it('a rename stores the sanitized name, shows it back, and prods the auto-upload', async () => {
    const t = setup();
    const field = t.el(WEBDAV_IDS.machineId);
    field.value = '  study desk  ';
    await field.fire('change');
    expect(t.deps.machineId.set).toHaveBeenCalledWith('  study desk  ');
    expect(field.value).toBe('study desk'); // whatever set() stored comes back to the field
    expect(t.message()).toContain(machineSettingsFilename('study desk'));
    expect(t.deps.onMachineRenamed).toHaveBeenCalledOnce();
  });
});

describe('settingsFileLabel', () => {
  it('names the machine, or the pre-1.11 shared file', () => {
    expect(settingsFileLabel({ name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' })).toBe(
      'laptop — Tue, 01 Sep 2026 09:00:00 GMT',
    );
    expect(settingsFileLabel({ name: BACKUP_FILENAME, lastModified: null })).toBe('shared file (before 1.11) — date unknown');
  });
});

describe('initWebDAVRows', () => {
  it('tolerates a pane that lacks the rows', () => {
    const doc = { getElementById: () => null };
    expect(() =>
      initWebDAVRows(doc, { prefs: fakePrefs(), createClient: () => ({}) as WebDAVClient, machineId: { get: () => 'x', set: (r) => r } }),
    ).not.toThrow();
  });
});
