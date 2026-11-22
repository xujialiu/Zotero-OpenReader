// Remove only this run's fixture, restore every local position table to its
// pre-fixture snapshot, and restore the retired preference while WebDAV stays off.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.readingPositionsUpgrade;
  const d = Zotero.ZoteroTTS.diagnostics;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tableSpecs = {
    positions: { table: 'positions', columns: ['libraryID', 'key', 'pos', 'ts'] },
    deletions: { table: 'deletions', columns: ['libraryID', 'key', 'ts'] },
    documents: { table: 'documents', columns: ['libraryID', 'key', 'documentId', 'publicationId', 'identifiedAt'] },
    documentPositions: { table: 'document_positions', columns: ['documentId', 'format', 'publicationId', 'locator', 'anchorExact', 'anchorPrefix', 'anchorSuffix', 'stampAt', 'stampDevice'] },
  };
  const readTables = async (db, source = tableSpecs) => {
    const result = {};
    for (const [name, spec] of Object.entries(source)) {
      const rows = (await db.queryAsync('SELECT ' + spec.columns.join(', ') + ' FROM ' + spec.table + ' ORDER BY ' + (name === 'documentPositions' ? 'documentId' : 'libraryID, key'))) ?? [];
      result[name] = rows.map(row => Object.fromEntries(spec.columns.map(column => [column, row[column]])));
    }
    return result;
  };
  const writePref = (suffix, snap) => {
    const name = prefix + suffix;
    if (!snap.hadUserValue) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
    } else if (snap.type === 32) Services.prefs.setStringPref(name, snap.value);
    else if (snap.type === 64) Services.prefs.setIntPref(name, snap.value);
    else if (snap.type === 128) Services.prefs.setBoolPref(name, snap.value);
    else throw new Error('Unsupported preference type for ' + suffix);
  };
  try {
    if (!baseline?.rows || !baseline?.fixture) throw new Error('Position cleanup snapshot is missing');
    Services.prefs.setBoolPref(prefix + 'webdav.enabled', false);
    const readers = Zotero.Reader?._readers ?? [];
    for (let i = 0; i < readers.length; i++) {
      const reader = readers[i];
      if (reader?.itemID !== baseline.fixture.itemID) continue;
      const manager = reader._internalReader?._readAloudManager;
      if (manager?.active) throw new Error('The test fixture unexpectedly has an active Read Aloud session');
      const win = Zotero.getMainWindow();
      if (reader.tabID && win?.Zotero_Tabs?.close) {
        win.Zotero_Tabs.close(String(reader.tabID));
        await sleep(1500);
      }
    }
    const item = Zotero.Items.get(baseline.fixture.itemID);
    if (item) await item.eraseTx();
    await sleep(800);

    const settleUntil = Date.now() + 30000;
    let position = null;
    let sync = null;
    do {
      position = JSON.parse(await d.position());
      sync = JSON.parse(d.positionSync());
      if (position.store?.queued === 0 && position.store?.writing === false
        && sync.transport?.running === false && sync.shared?.transport?.running === false) break;
      await sleep(250);
    } while (Date.now() < settleUntil);
    if (position.store?.queued !== 0 || position.store?.writing !== false
      || sync.transport?.running !== false || sync.shared?.transport?.running !== false) throw new Error('Position store/transports did not settle after fixture erase');
    if (sync.folder !== false) throw new Error('WebDAV folder was not isolated during cleanup');

    const db = new Zotero.DBConnection(baseline.positionPath);
    let actualRows;
    try {
      await db.executeTransaction(async () => {
        for (const spec of Object.values(tableSpecs)) await db.queryAsync('DELETE FROM ' + spec.table);
        for (const [name, rows] of Object.entries(baseline.rows)) {
          const spec = tableSpecs[name];
          const sql = 'INSERT INTO ' + spec.table + ' (' + spec.columns.join(', ') + ') VALUES (' + spec.columns.map(() => '?').join(', ') + ')';
          for (const row of rows) await db.queryAsync(sql, spec.columns.map(column => row[column]));
        }
      });
      actualRows = await readTables(db);
    } finally {
      await db.closeDatabase();
    }
    const tablesExact = Object.keys(tableSpecs).every(name => JSON.stringify(actualRows[name]) === JSON.stringify(baseline.rows[name]));
    if (!tablesExact) throw new Error('Position table restoration differs from the baseline snapshot');
    writePref('readAloud.positions', baseline.prefs.legacyPositions);
    const fixtureStillExists = !!Zotero.Items.get(baseline.fixture.itemID);
    if (fixtureStillExists) throw new Error('Test fixture remains after erase');
    out.fixtureErased = true;
    out.rowsRestored = tablesExact;
    out.tableCounts = Object.fromEntries(Object.entries(actualRows).map(([name, rows]) => [name, rows.length]));
    out.memoryTombstonesBeforeRefresh = sync.tombstones;
    out.legacyPrefRestoredForRefresh = Services.prefs.prefHasUserValue(prefix + 'readAloud.positions') === baseline.prefs.legacyPositions.hadUserValue;
    out.webdavFolderStillOff = JSON.parse(d.positionSync()).folder === false;
    if (!out.webdavFolderStillOff || !out.legacyPrefRestoredForRefresh) throw new Error('Cleanup isolation or preference restoration failed');
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
