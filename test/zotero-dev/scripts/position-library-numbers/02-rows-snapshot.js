// COMPLETE local-row snapshot before the first change (the cleanup gate):
// every row of zotero-tts.sqlite's positions, deletions, documents and
// document_positions tables, read through a SECOND, absolute-path connection
// while the plugin's own connection is idle (queue drained). Rows are kept
// whole in state and on disk under .tmp; only counts and a hash return here —
// these rows are the owner's reading positions.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  // Settled gate: no writes in flight while the second connection reads.
  const position = JSON.parse(await d.position());
  const sync = JSON.parse(await d.positionSync());
  out.settled = position.store?.queued === 0 && position.store?.writing === false
    && sync.transport?.running === false && sync.shared?.transport?.running === false;
  if (!out.settled) throw new Error('store/transports not settled before the row snapshot');

  const path = position.database?.path ?? null;
  if (!path) throw new Error('plugin DB path unknown: position().database.path missing');
  out.dbPathBasename = String(path).split('/').pop();
  const db = new Zotero.DBConnection(path); // absolute path → external DB, no exclusive lock, no backups
  try {
    const q = async (sql) => (await db.queryAsync(sql)) ?? [];
    const plain = (rows, cols) => rows.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
    const positions = plain(await q('SELECT libraryID, key, pos, ts FROM positions ORDER BY libraryID, key'), ['libraryID', 'key', 'pos', 'ts']);
    const deletions = plain(await q('SELECT libraryID, key, ts FROM deletions ORDER BY libraryID, key'), ['libraryID', 'key', 'ts']);
    const documents = plain(await q('SELECT libraryID, key, documentId, publicationId, identifiedAt FROM documents ORDER BY libraryID, key'), ['libraryID', 'key', 'documentId', 'publicationId', 'identifiedAt']);
    const documentPositions = plain(await q('SELECT documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice FROM document_positions ORDER BY documentId'), ['documentId', 'format', 'publicationId', 'locator', 'anchorExact', 'anchorPrefix', 'anchorSuffix', 'stampAt', 'stampDevice']);
    const pack = (rows) => JSON.stringify(rows);
    const digest = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    out.counts = {
      positions: positions.length, deletions: deletions.length,
      documents: documents.length, documentPositions: documentPositions.length,
    };
    state.rowsBefore = { positions, deletions, documents, documentPositions };
    state.rowsBeforeHashes = {
      positions: await digest(pack(positions)),
      deletions: await digest(pack(deletions)),
      documents: await digest(pack(documents)),
      documentPositions: await digest(pack(documentPositions)),
    };
    out.hashes = state.rowsBeforeHashes;
    // Soft guard: no earlier item of this run's own fixture title may exist.
    const p = Zotero.ZoteroTTSRun.params;
    out.fixtureTitle = p.fixtureTitle;
    try {
      const fieldID = await Zotero.DB.valueQueryAsync('SELECT fieldID FROM fieldsCombined WHERE fieldName=?', ['title']);
      out.existingFixtureItems = await Zotero.DB.valueQueryAsync(
        'SELECT COUNT(*) FROM itemData JOIN itemDataValues USING (valueID) WHERE fieldID=? AND value=?', [fieldID, p.fixtureTitle]);
    } catch (e) { out.existingFixtureItems = 'unavailable: ' + String(e); }
  } finally {
    try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
  }
  return JSON.stringify(out);
})()
