// Verify the #22 in-place update against the synthetic retired preference and
// the exact live SQLite row for the imported fixture.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.readingPositionsUpgrade;
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
    if (!baseline?.fixture || !baseline?.seededPosition || !baseline?.rows) throw new Error('Position baseline/seed state is missing');
    const startup = JSON.parse(d.startup());
    const position = JSON.parse(await d.position());
    const sync = JSON.parse(d.positionSync());
    const seed = baseline.seededPosition;
    const expectedRows = structuredClone(baseline.rows);
    expectedRows.positions.push(seed);
    expectedRows.positions.sort((a, b) => a.libraryID - b.libraryID || a.key.localeCompare(b.key));
    const actualRows = await readTables(position.database.path);
    const rowExact = JSON.stringify(actualRows.positions) === JSON.stringify(expectedRows.positions);
    const otherTablesExact = ['deletions', 'documents', 'documentPositions'].every(name => JSON.stringify(actualRows[name]) === JSON.stringify(baseline.rows[name]));
    const legacy = readPref('readAloud.positions');
    const legacyExact = legacy.value === baseline.legacySeed.text && legacy.hadUserValue === true;
    const storeOpen = position.store?.state === 'open';
    const rowCountExact = position.database?.rows === baseline.positionRows + 1;
    const noLegacyDiagnostic = (!Object.prototype.hasOwnProperty.call(position, 'legacyPref') || position.legacyPref === null)
      && (!Object.prototype.hasOwnProperty.call(position, 'imported') || position.imported === 0 || position.imported === null);
    const folderOff = sync.folder === false;
    if (startup.failed?.length || startup.steps?.some(step => step.ok !== true)) throw new Error('Post-upgrade startup has a failed step');
    if (!storeOpen || !rowCountExact || !rowExact || !otherTablesExact || !legacyExact || !noLegacyDiagnostic || !folderOff) {
      throw new Error('At least one #22 position-upgrade assertion failed');
    }
    out.startup = { version: startup.version, steps: startup.steps.length, failed: startup.failed, allOk: true };
    out.diagnostic = {
      storeState: position.store.state,
      rowsBeforeFixture: baseline.positionRows,
      rowsAfterInstall: position.database.rows,
      legacyPrefFieldAbsent: !Object.prototype.hasOwnProperty.call(position, 'legacyPref'),
      importedFieldAbsent: !Object.prototype.hasOwnProperty.call(position, 'imported'),
      folder: sync.folder,
    };
    out.fixture = baseline.fixture;
    out.sqlitePosition = { exact: rowExact, pos: JSON.parse(seed.pos), ts: seed.ts };
    out.otherTablesExact = otherTablesExact;
    out.legacyPreference = { byteIdentical: legacyExact, chars: legacy.value.length, hadUserValue: legacy.hadUserValue };
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
