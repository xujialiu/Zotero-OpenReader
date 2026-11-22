// Final restoration and audit after the identical-XPI store refresh and the
// OpenAI preference restore script have both completed.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.readingPositionsUpgrade;
  const openai = state.openAISplitUpgrade;
  const d = Zotero.ZoteroTTS.diagnostics;
  const prefix = 'extensions.zotero.zotero-tts.';
  const readPref = suffix => {
    const name = prefix + suffix;
    const type = Services.prefs.getPrefType(name);
    const hadUserValue = Services.prefs.prefHasUserValue(name);
    let value = null;
    if (type === 32) value = Services.prefs.getStringPref(name);
    else if (type === 64) value = Services.prefs.getIntPref(name);
    else if (type === 128) value = Services.prefs.getBoolPref(name);
    return { type, hadUserValue, value };
  };
  const restorePref = (suffix, snap) => {
    const name = prefix + suffix;
    if (!snap.hadUserValue) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
    } else if (snap.type === 32) Services.prefs.setStringPref(name, snap.value);
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
        const table = name === 'documentPositions' ? 'document_positions' : name;
        const rows = (await db.queryAsync('SELECT ' + columns + ' FROM ' + table + ' ORDER BY ' + order)) ?? [];
        result[name] = rows.map(row => Object.fromEntries(columns.split(', ').map(column => [column, row[column]])));
      }
    } finally {
      await db.closeDatabase();
    }
    return result;
  };
  try {
    if (!baseline?.rows || !openai?.prefs) throw new Error('Final restoration snapshot is missing');
    const beforeRestorePosition = JSON.parse(await d.position());
    const beforeRestoreSync = JSON.parse(d.positionSync());
    const afterRefreshIsolated = beforeRestoreSync.folder === false
      && beforeRestorePosition.store?.state === 'open'
      && beforeRestorePosition.database?.rows === baseline.positionRows
      && beforeRestoreSync.tombstones === baseline.positionSync.tombstones;
    if (!afterRefreshIsolated) throw new Error('Post-cleanup reinstall did not reload the isolated baseline position store');
    restorePref('readAloud.positions', baseline.prefs.legacyPositions);
    restorePref('readAloud.volume', baseline.prefs.volume);
    restorePref('webdav.enabled', baseline.prefs.webdavEnabled);

    const position = JSON.parse(await d.position());
    const sync = JSON.parse(d.positionSync());
    const actualRows = await readTables(position.database.path);
    const tablesExact = Object.keys(tableSpecs).every(name => JSON.stringify(actualRows[name]) === JSON.stringify(baseline.rows[name]));
    const prefsExact = ['readAloud.positions', 'readAloud.volume', 'webdav.enabled'].every((suffix, i) => {
      const snap = [baseline.prefs.legacyPositions, baseline.prefs.volume, baseline.prefs.webdavEnabled][i];
      const actual = readPref(suffix);
      return actual.value === snap.value && actual.hadUserValue === snap.hadUserValue;
    }) && Object.keys(openai.prefs).every(key => {
      const actual = readPref(key);
      return actual.value === openai.prefs[key].value && actual.hadUserValue === openai.prefs[key].hadUserValue;
    });
    const fixtureAbsent = !Zotero.Items.get(baseline.fixture.itemID);
    const rowCountExact = position.database?.rows === baseline.positionRows;
    const tombstonesExact = sync.tombstones === baseline.positionSync.tombstones;
    const folderExact = sync.folder === baseline.prefs.webdavEnabled.value;
    const win = Zotero.getMainWindow();
    if (win && win.windowState !== 2) win.minimize();
    const readers = [];
    const liveReaders = Zotero.Reader?._readers ?? [];
    for (let i = 0; i < liveReaders.length; i++) {
      const reader = liveReaders[i];
      if (!reader) continue;
      const manager = reader._internalReader?._readAloudManager;
      const item = reader.itemID ? Zotero.Items.get(reader.itemID) : null;
      readers.push({ itemID: reader.itemID ?? null, title: item?.getField?.('title') ?? null, active: !!manager?.active, paused: !!manager?.paused });
    }
    const readersExact = JSON.stringify(readers) === JSON.stringify(baseline.readers);
    const debugBeforeRestore = !!Zotero.Debug?.storing;
    if (debugBeforeRestore !== baseline.debugStoring) Zotero.Debug.setStore(baseline.debugStoring);
    const debugRestored = !!Zotero.Debug?.storing === baseline.debugStoring;
    const startup = JSON.parse(d.startup());
    out.fixtureAbsent = fixtureAbsent;
    out.positionRows = { baseline: baseline.positionRows, final: position.database?.rows ?? null, exact: rowCountExact };
    out.sqliteTablesExact = tablesExact;
    out.tombstones = { baseline: baseline.positionSync.tombstones, final: sync.tombstones, exact: tombstonesExact };
    out.afterCleanupReinstall = { folder: beforeRestoreSync.folder, storeState: beforeRestorePosition.store?.state, rows: beforeRestorePosition.database?.rows, tombstones: beforeRestoreSync.tombstones, isolated: afterRefreshIsolated };
    out.preferencesRestored = prefsExact;
    out.webdav = { original: baseline.prefs.webdavEnabled.value, final: sync.folder, folderMatchesOriginal: folderExact };
    out.readers = { baseline: baseline.readers, final: readers, exact: readersExact };
    out.window = { state: win?.windowState ?? null, minimized: win?.windowState === 2, selectedTab: win?.Zotero_Tabs?.selectedID ?? null, baselineSelectedTab: baseline.selectedTab };
    out.window.selectedTabRestored = out.window.selectedTab === baseline.selectedTab;
    out.debugStore = { beforeRestore: debugBeforeRestore, original: baseline.debugStoring, restored: debugRestored };
    out.finalStartup = { version: startup.version, failed: startup.failed, allOk: startup.failed?.length === 0 && startup.steps?.every(step => step.ok === true) };
    if (!fixtureAbsent || !rowCountExact || !tablesExact || !tombstonesExact || !prefsExact || !folderExact || !readersExact || !out.window.selectedTabRestored || !out.window.minimized || !debugRestored || !out.finalStartup.allOk) {
      throw new Error('Final restoration audit failed');
    }
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
