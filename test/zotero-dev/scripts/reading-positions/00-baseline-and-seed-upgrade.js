// Baseline 0 and issue #22 setup. Values and SQLite rows stay in runner state;
// the result reports only counts and synthetic fixture identifiers.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const prefName = suffix => prefix + suffix;
  const readPref = suffix => {
    const name = prefName(suffix);
    const type = Services.prefs.getPrefType(name);
    const hadUserValue = Services.prefs.prefHasUserValue(name);
    let value = null;
    if (type === 32) value = Services.prefs.getStringPref(name);
    else if (type === 64) value = Services.prefs.getIntPref(name);
    else if (type === 128) value = Services.prefs.getBoolPref(name);
    return { type, hadUserValue, value };
  };
  const writePref = (suffix, snap) => {
    const name = prefName(suffix);
    if (!snap.hadUserValue) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
      return;
    }
    if (snap.type === 32) Services.prefs.setStringPref(name, snap.value);
    else if (snap.type === 64) Services.prefs.setIntPref(name, snap.value);
    else if (snap.type === 128) Services.prefs.setBoolPref(name, snap.value);
    else throw new Error('Unsupported preference type for ' + suffix);
  };
  const tableSpecs = {
    positions: ['libraryID, key, pos, ts', 'libraryID, key'],
    deletions: ['libraryID, key, ts', 'libraryID, key'],
    documents: ['libraryID, key, documentId, publicationId, identifiedAt', 'libraryID, key'],
    documentPositions: ['documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice', 'documentId'],
  };
  const readTables = async path => {
    const db = new Zotero.DBConnection(path);
    const result = {};
    try {
      for (const [name, [columns, order]] of Object.entries(tableSpecs)) {
        const rows = (await db.queryAsync('SELECT ' + columns + ' FROM ' + (name === 'documentPositions' ? 'document_positions' : name) + ' ORDER BY ' + order)) ?? [];
        result[name] = rows.map(row => Object.fromEntries(columns.split(', ').map(column => [column, row[column]])));
      }
    } finally {
      await db.closeDatabase();
    }
    return result;
  };
  try {
    const baseline = {
      prefs: {
        webdavEnabled: readPref('webdav.enabled'),
        volume: readPref('readAloud.volume'),
        legacyPositions: readPref('readAloud.positions'),
      },
      debugStoring: !!Zotero.Debug?.storing,
      originalErrors: (Zotero.getErrors?.() ?? []).map(error => String(error)),
      startup: JSON.parse(d.startup()),
      readers: [],
      selectedTab: null,
      windowState: null,
      settingsWindowOpen: false,
    };
    const win = Zotero.getMainWindow();
    baseline.windowState = win?.windowState ?? null;
    baseline.selectedTab = win?.Zotero_Tabs?.selectedID ?? null;
    const readers = Zotero.Reader?._readers ?? [];
    for (let i = 0; i < readers.length; i++) {
      const reader = readers[i];
      if (!reader) continue;
      const manager = reader._internalReader?._readAloudManager;
      const item = reader.itemID ? Zotero.Items.get(reader.itemID) : null;
      baseline.readers.push({ itemID: reader.itemID ?? null, title: item?.getField?.('title') ?? null, active: !!manager?.active, paused: !!manager?.paused });
    }
    try {
      const windows = Services.wm.getEnumerator('zotero:prefwindow');
      baseline.settingsWindowOpen = windows.hasMoreElements();
    } catch (_) {
      baseline.settingsWindowOpen = null;
    }
    state.readingPositionsUpgrade = baseline;
    if (baseline.startup.failed?.length) throw new Error('Previous build startup has failed steps');

    const settleUntil = Date.now() + 30000;
    let settled = null;
    do {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(d.positionSync());
      const settings = JSON.parse(d.settingsSync());
      const upload = JSON.parse(d.settingsUpload());
      settled = {
        position,
        sync,
        settings,
        upload,
        quiet: position.store?.queued === 0 && position.store?.writing === false
          && sync.transport?.running === false && sync.shared?.transport?.running === false
          && settings.transport?.running === false && upload.autoUpload?.pending === false,
      };
      if (settled.quiet) break;
      await sleep(250);
    } while (Date.now() < settleUntil);
    if (!settled?.quiet) throw new Error('Position or WebDAV requests did not settle before isolation');
    if (settled.sync.folder !== false) Services.prefs.setBoolPref(prefName('webdav.enabled'), false);
    const isolated = JSON.parse(d.positionSync());
    if (isolated.folder !== false) throw new Error('WebDAV folder did not turn off');
    baseline.positionRows = settled.position.database?.rows ?? null;
    baseline.positionPath = settled.position.database?.path ?? null;
    baseline.positionSync = settled.sync;
    if (!baseline.positionPath || baseline.positionRows === null) throw new Error('Position database diagnostics are unavailable');
    if (!baseline.prefs.volume.hadUserValue && baseline.prefs.volume.value === null) throw new Error('Volume preference could not be read');
    if (readPref('readAloud.volume').value !== 0) Services.prefs.setIntPref(prefName('readAloud.volume'), 0);
    baseline.rows = await readTables(baseline.positionPath);
    state.readingPositionsUpgrade = baseline;
    if (!Zotero.Debug?.storing) Zotero.Debug.setStore(true);

    const title = params.fixtureTitle;
    if (typeof title !== 'string' || !title) throw new Error('fixtureTitle param is required');
    const file = PathUtils.join(params.fixturesDir, 'fixture-a.pdf');
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = Zotero.Items.get(typeof imported === 'number' ? imported : imported?.id);
    if (!item?.id || !item.key) throw new Error('Could not import the position-upgrade fixture');
    baseline.fixture = { itemID: item.id, lib: item.libraryID, key: item.key, title };
    state.readingPositionsUpgrade = baseline;

    const stale = { pageIndex: 1, rects: [[17.2, 29.4, 17.2, 29.4]] };
    const legacyText = JSON.stringify({ v: 1, items: [{ lib: item.libraryID, key: item.key, pos: stale, ts: 1700000000000 }] });
    Services.prefs.setStringPref(prefName('readAloud.positions'), legacyText);
    baseline.legacySeed = { text: legacyText, hadUserValue: true };
    const current = { pageIndex: 0, rects: [[101.2, 203.4, 101.2, 203.4]] };
    const row = { libraryID: item.libraryID, key: item.key, pos: JSON.stringify(current), ts: Date.now() };
    const db = new Zotero.DBConnection(baseline.positionPath);
    try {
      await db.executeTransaction(async () => {
        await db.queryAsync('REPLACE INTO positions (libraryID, key, pos, ts) VALUES (?, ?, ?, ?)', [row.libraryID, row.key, row.pos, row.ts]);
      });
    } finally {
      await db.closeDatabase();
    }
    baseline.seededPosition = row;
    const afterSeed = JSON.parse(await d.position());
    const afterSync = JSON.parse(d.positionSync());
    if (afterSeed.database?.rows !== baseline.positionRows + 1 || afterSync.folder !== false) throw new Error('Fixture row seed or WebDAV isolation did not verify');
    out.startupVersion = baseline.startup.version;
    out.readers = baseline.readers;
    out.selectedTab = baseline.selectedTab;
    out.windowState = baseline.windowState;
    out.settingsWindowOpen = baseline.settingsWindowOpen;
    out.baselineErrors = { entries: baseline.originalErrors.length, plugin: baseline.originalErrors.filter(line => line.includes('[zotero-tts]') || line.includes('zotero-tts.js')).length };
    out.webdav = { folderAfterIsolation: afterSync.folder, rowsBeforeFixture: baseline.positionRows, fixtureRowsAfterSeed: afterSeed.database.rows };
    out.fixture = baseline.fixture;
    out.legacyPreferenceSeeded = { chars: legacyText.length, conflictPageIndex: stale.pageIndex, hadUserValue: true };
    out.sqlitePositionSeeded = { pageIndex: current.pageIndex, ts: row.ts, rowCount: afterSeed.database.rows };
    out.debugStoringAtStart = baseline.debugStoring;
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
