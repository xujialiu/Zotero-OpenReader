import { sentences, t } from '../core/l10n';
import { loadSettings, WEBDAV_ENABLED_PREF, type PrefsBackend, type Settings } from '../core/settings';
import { applyBackup, createBackup, machineSettingsFilename, parseBackup, serializeBackup, SETTINGS_FILE_PATTERN, type FlatSettings } from '../core/settings-backup';
import { isPlainHttpURL, type WebDAVClient, type WebDAVConfig, type WebDAVFile } from '../core/webdav';
import { checkingProviders, verifyRestoredProviders } from './backup-rows';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';
import { isSecretField, setSecretLocked } from './secret-rows';

/**
 * The rows that talk to the WebDAV folder (#41): *Test connection* in the
 * WebDAV group, and in the Backup group this computer's copy on the server
 * — the machine-id field, *Back up to the server now* and *Restore settings
 * from server…*. URL, username and password are preference=-bound inputs
 * read when a button is pressed, never earlier; the client is injected
 * (prefs-pane.ts builds core/webdav.ts on the sandbox's fetch), so the
 * flow is testable without a network.
 *
 * The copy is a backup, not the sync (core/settings-sync-transport.ts,
 * #68): settings do not merge as a whole, so every machine keeps its own
 * file on the server — `zotero-tts-settings_<machine id>.json` — and the
 * machine-id field names this one (core/machine-id.ts). Back up writes
 * this machine's file; Restore lists what the folder holds (the unsuffixed
 * pre-1.11 file included), asks which to take when there are several, and
 * then runs the unchanged restore path: confirm, refuse while a tab reads
 * (#11), apply, redraw, provider verification (#21). Settings bound with
 * preference= redraw themselves after a restore; onRestored covers the
 * rows that are not. Each button writes its group's message line: the
 * connection's in the WebDAV group, the copy's in the Backup group, where
 * the file buttons write too (ui/backup-rows.ts).
 *
 * The folder's switch (issue #173, ADR 0015) is run like a provider's
 * (ui/provider-rows.ts): Enable is a commit point — the very check Test
 * connection runs has to pass before `webdav.enabled` goes on — and while
 * the folder is on its fields are locked, so the sync and the server
 * backup only ever use an address that was checked as it is. Disable is
 * immediate and needs no reading guard: the folder plays no part in
 * reading. While the folder is off, the rows that use it — the three
 * switches and the server copy's two buttons — are greyed, their prefs
 * left as they are, so turning it back on brings back what was ticked.
 */

export const WEBDAV_IDS = {
  /** The folder's Enable / Disable (issue #173). */
  toggle: 'ztts-webdav-enable',
  /** The group holding the folder's three fields, locked while it is on. */
  folder: 'ztts-webdav-folder',
  /** The switches that use the folder, greyed while it is off. */
  syncPositions: 'ztts-webdav-sync-positions',
  syncSettings: 'ztts-webdav-sync-settings',
  autoUpload: 'ztts-webdav-auto-upload',
  upload: 'ztts-webdav-upload',
  download: 'ztts-webdav-download',
  test: 'ztts-webdav-test',
  /** The WebDAV group's line: what Test connection says. */
  message: 'ztts-webdav-message',
  /** The Backup group's line, the file buttons' too (ui/backup-rows.ts): what the server copy's buttons and the rename say. */
  backupMessage: 'ztts-backup-message',
  machineId: 'ztts-webdav-machine-id',
} as const;

export interface WebDAVRowsDeps extends Partial<ReadingGuardDeps> {
  prefs: PrefsBackend;
  /** A client for the settings as they are now; throws a WebDAVError('config') for an unusable URL. */
  createClient(cfg: WebDAVConfig): WebDAVClient;
  /** This computer's file signature: read for the upload name, written from the pane's field (core/machine-id.ts). */
  machineId: { get(): string; set(raw: string): string };
  pluginVersion?: string;
  /** Timestamp written into the file; injected so tests are stable. */
  now?(): string;
  /** Asks before the current settings are replaced; omitted means yes. */
  confirm?(message: string): boolean;
  /** The picker when the server holds several machines' files: the chosen index, or null on cancel. Omitted takes the newest. */
  select?(title: string, options: string[]): number | null;
  /** Runs after a rename, so the fresh name gets its file soon (settings-autoupload via src/index.ts). */
  onMachineRenamed?(): void;
  /** Runs after a restore, for rows that must redraw themselves. */
  onRestored?(): void;
  /** The connection check a restore ends in, as the file restore runs it (ui/backup-rows.ts, issue #21). */
  verifyProviders?(restored: FlatSettings): Promise<string>;
}

interface ElementLike {
  addEventListener(type: string, fn: () => void): void;
  setAttribute(name: string, value: string): void;
  /** The machine-id input's live text; buttons and labels have none. */
  value?: string;
  /** The message line's text (issue #31). */
  textContent: string;
  /** Greyed: a button, a checkbox or a field (issue #173). */
  disabled?: boolean;
  /** The folder group's fields. */
  querySelectorAll?(selector: string): Iterable<any>;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Newest first; a file without a parseable date sorts last, the legacy era's servers permitting. */
function newestFirst(a: WebDAVFile, b: WebDAVFile): number {
  return (Date.parse(b.lastModified ?? '') || 0) - (Date.parse(a.lastModified ?? '') || 0);
}

/** The picker's line for one settings file: whose it is, and how fresh. */
export function settingsFileLabel(file: WebDAVFile): string {
  const id = SETTINGS_FILE_PATTERN.exec(file.name)?.[1];
  return t('ztts-settings-file-label', { who: id ?? t('ztts-shared-file'), when: file.lastModified ?? t('ztts-date-unknown') });
}

/** The rows that use the folder: greyed while it is off. */
const USE_ROWS = [WEBDAV_IDS.syncPositions, WEBDAV_IDS.syncSettings, WEBDAV_IDS.autoUpload, WEBDAV_IDS.upload, WEBDAV_IDS.download];

/** Whether two configurations name the same folder with the same credentials. */
function sameFolder(a: Settings['webdav'], b: Settings['webdav']): boolean {
  return a.url === b.url && a.username === b.username && a.password === b.password;
}

export interface WebDAVRows {
  /** After a restore: the switch, the lock and the greyed rows as the prefs say now. */
  refresh(): void;
  /**
   * The commit point of a restore (issue #175, as ui/provider-rows.ts has
   * for the providers, issue #21). A restore writes the folder's switch off
   * (core/settings-backup.ts applyBackup), so nothing reaches the restored
   * address before this: `wanted` is the switch the file held, undefined
   * when it held none, and then the folder as it was is checked again,
   * since its address may have changed under it. A folder wanted on goes
   * on once Enable's check passes; one that fails stays off, its failure
   * on the WebDAV line, and the returned sentence, for the restore's line,
   * says so. Empty when nothing failed, and while an Enable or Test
   * connection is already checking the folder, which is left to it.
   */
  verifyEnabled(wanted: boolean | undefined): Promise<string>;
}

export function initWebDAVRows(doc: RowsDocument, deps: WebDAVRowsDeps): WebDAVRows {
  /** Written as text: a description's `value` never wraps (issue #31). */
  const lineWriter = (id: string) => (text: string) => {
    const line = doc.getElementById(id);
    if (line) line.textContent = text;
  };
  const connectionLine = lineWriter(WEBDAV_IDS.message);
  const backupLine = lineWriter(WEBDAV_IDS.backupMessage);
  // One request at a time: a second click while the first is still talking
  // to the server would only produce a second dialog or a second upload
  let busy = false;
  // A check of the folder running: Enable's, Test connection's or a restore's
  let checking = false;
  const enabled = () => deps.prefs.get(WEBDAV_ENABLED_PREF) === true;

  /**
   * The switch and everything that follows it: on is "Disable" with the
   * fields locked (the password covered, issue #19) and the rows that use
   * the folder live; off is "Enable" with the fields open and those rows
   * greyed. Both buttons are free again.
   */
  function paint(): void {
    const on = enabled();
    const toggle = doc.getElementById(WEBDAV_IDS.toggle);
    toggle?.setAttribute('label', on ? t('ztts-switch-disable') : t('ztts-switch-enable'));
    if (toggle) toggle.disabled = false;
    const test = doc.getElementById(WEBDAV_IDS.test);
    if (test) test.disabled = false;
    for (const field of Array.from(doc.getElementById(WEBDAV_IDS.folder)?.querySelectorAll?.('input') ?? [])) {
      field.disabled = on;
      if (isSecretField(field)) setSecretLocked(field, on);
    }
    for (const id of USE_ROWS) {
      const row = doc.getElementById(id);
      if (row) row.disabled = !on;
    }
  }

  /** Both buttons held while a check runs. */
  function hold(): void {
    for (const id of [WEBDAV_IDS.toggle, WEBDAV_IDS.test]) {
      const button = doc.getElementById(id);
      if (button) button.disabled = true;
    }
  }

  /**
   * The folder's check as Test connection runs it, on the settings as they
   * are now, both buttons held and its outcome on the WebDAV line; never
   * throws. An http:// address adds the warning (issue #174, ADR 0015), on
   * a failure too: the request has already gone out. `ok` is a pass of the
   * folder that is still configured when it ends: an address, username or
   * password written meanwhile (a restore from a file) was not checked.
   */
  async function check(progress: string, relabel: boolean): Promise<{ ok: boolean }> {
    checking = true;
    hold();
    if (relabel) doc.getElementById(WEBDAV_IDS.toggle)?.setAttribute('label', t('ztts-switch-checking'));
    connectionLine(progress);
    const cfg = loadSettings(deps.prefs).webdav;
    const warning = isPlainHttpURL(cfg.url) ? t('ztts-webdav-plain-http') : '';
    let outcome: { ok: boolean; message: string };
    try {
      const client = deps.createClient(cfg);
      await client.check();
      outcome = { ok: true, message: sentences(t('ztts-webdav-connected', { url: client.url }), warning) };
    } catch (e) {
      outcome = { ok: false, message: sentences(t('ztts-connection-failed', { detail: describe(e) }), warning) };
    }
    connectionLine(outcome.message);
    checking = false;
    return { ok: outcome.ok && sameFolder(cfg, loadSettings(deps.prefs).webdav) };
  }

  const button = (
    id: string,
    message: (text: string) => void,
    failure: (detail: string) => string,
    progress: () => string,
    action: (client: WebDAVClient) => Promise<string>,
  ) => {
    doc.getElementById(id)?.addEventListener('command', async () => {
      if (busy || checking) return;
      // The server copy's buttons are greyed while the folder is off, so only a command sent past one lands here
      if (!enabled()) return;
      busy = true;
      try {
        message(progress());
        const client = deps.createClient(loadSettings(deps.prefs).webdav);
        message(await action(client));
      } catch (e) {
        message(failure(describe(e)));
      } finally {
        busy = false;
        // A restore from the server may have moved the folder's switch: refresh() waited for this
        if (!checking) paint();
      }
    });
  };

  // Test connection probes without committing, the folder off or on
  doc.getElementById(WEBDAV_IDS.test)?.addEventListener('command', async () => {
    if (busy || checking) return;
    await check(t('ztts-webdav-testing'), false);
    paint();
  });

  doc.getElementById(WEBDAV_IDS.toggle)?.addEventListener('command', async () => {
    if (busy || checking) return;
    if (enabled()) {
      deps.prefs.set(WEBDAV_ENABLED_PREF, false);
      // The last check's "Connected…" beside an Enable button would read as if it still held
      connectionLine('');
      paint();
      return;
    }
    if ((await check(t('ztts-switch-checking'), true)).ok) deps.prefs.set(WEBDAV_ENABLED_PREF, true);
    paint();
  });

  button(WEBDAV_IDS.upload, backupLine, (detail) => t('ztts-upload-failed', { detail }), () => t('ztts-webdav-uploading'), async (client) => {
    const id = deps.machineId.get();
    const name = machineSettingsFilename(id);
    const backup = createBackup(deps.prefs, { pluginVersion: deps.pluginVersion, exportedAt: deps.now?.(), machine: id });
    await client.upload(name, serializeBackup(backup));
    const count = Object.keys(backup.settings).length;
    return t('ztts-webdav-uploaded', { count, file: `${client.url}${name}` });
  });

  button(WEBDAV_IDS.download, backupLine, (detail) => t('ztts-restore-failed', { detail }), () => t('ztts-webdav-looking'), async (client) => {
    const files = (await client.list()).filter((f) => SETTINGS_FILE_PATTERN.test(f.name)).sort(newestFirst);
    if (files.length === 0) return t('ztts-webdav-none', { url: client.url });
    let file = files[0];
    if (files.length > 1) {
      const at = deps.select ? deps.select(t('ztts-webdav-pick-title'), files.map(settingsFileLabel)) : 0;
      if (at === null || files[at] === undefined) return '';
      file = files[at];
    }
    const parsed = parseBackup(await client.download(file.name));
    const count = Object.keys(parsed.settings).length;
    const url = client.url;
    const machine = parsed.machine;
    const time = parsed.exportedAt;
    // Four whole sentences rather than optional clauses: a language orders them its own way
    const question =
      machine && time
        ? t('ztts-webdav-restore-confirm-machine-saved', { count, machine, url, time })
        : machine
          ? t('ztts-webdav-restore-confirm-machine', { count, machine, url })
          : time
            ? t('ztts-webdav-restore-confirm-saved', { count, url, time })
            : t('ztts-webdav-restore-confirm', { count, url });
    if (deps.confirm && !deps.confirm(question)) return '';
    if (await refuseWhileReading(deps, parsed.settings)) return '';
    const applied = applyBackup(deps.prefs, parsed);
    deps.onRestored?.();
    const skipped = parsed.ignored.length ? t('ztts-skipped', { count: parsed.ignored.length, keys: parsed.ignored.join(', ') }) : '';
    const restored = sentences(t('ztts-restored', { count: applied, path: `${client.url}${file.name}` }), skipped);
    if (!deps.verifyProviders) return restored;
    backupLine(sentences(restored, checkingProviders()));
    const verdict = await verifyRestoredProviders(deps, parsed.settings);
    return sentences(restored, verdict);
  });

  // This computer's name: shown as stored, sanitized on the way back in; a
  // rename starts a new file on the server, and the old one ages visibly
  // in the restore list
  const field = doc.getElementById(WEBDAV_IDS.machineId);
  if (field) {
    field.value = deps.machineId.get();
    field.addEventListener('change', () => {
      const stored = deps.machineId.set(field.value ?? '');
      field.value = stored;
      backupLine(t('ztts-webdav-machine-file', { file: machineSettingsFilename(stored) }));
      deps.onMachineRenamed?.();
    });
  }

  paint();
  return {
    refresh: () => {
      if (!busy && !checking) paint();
    },
    // Not held back by `busy`: a restore from the server runs this from inside its own button
    verifyEnabled: async (wanted) => {
      if (checking || !(wanted ?? enabled())) return '';
      // Off while it is checked: the file held no switch, so it was left as it was
      deps.prefs.set(WEBDAV_ENABLED_PREF, false);
      const { ok } = await check(t('ztts-switch-checking'), true);
      if (ok) deps.prefs.set(WEBDAV_ENABLED_PREF, true);
      paint();
      return ok ? '' : t('ztts-webdav-turned-off');
    },
  };
}
