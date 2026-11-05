// COMPLETE local-row snapshot before the first change (cleanup gate half 1):
// every row of zotero-tts.sqlite's positions, deletions, documents and
// document_positions tables through a second, absolute-path DB connection
// while the plugin's connection is idle (the four transports settled).
// Rows are kept whole in state and on disk; only counts + SHA-256 return.
// Also: any PRIOR record for the deterministic fixture Document Id must be
// known before the fixture is imported (the case's preserve rule).
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const position = JSON.parse(await d.position());
  const sync = JSON.parse(await d.positionSync());
  out.settled = position.store?.queued === 0 && position.store?.writing === false
    && sync.transport?.running === false && sync.shared?.transport?.running === false;
  if (!out.settled) throw new Error('store/transports not settled before the row snapshot');

  const path = position.database?.path ?? null;
  if (!path) throw new Error('plugin DB path unknown: position().database.path missing');
  out.dbPathBasename = String(path).split('/').pop();
  const db = new Zotero.DBConnection(path);
  try {
    const q = async (sql, params) => (await db.queryAsync(sql, params)) ?? [];
    const plain = (rows, cols) => rows.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
    const positions = plain(await q('SELECT libraryID, key, pos, ts FROM positions ORDER BY libraryID, key'), ['libraryID', 'key', 'pos', 'ts']);
    const deletions = plain(await q('SELECT libraryID, key, ts FROM deletions ORDER BY libraryID, key'), ['libraryID', 'key', 'ts']);
    const documents = plain(await q('SELECT libraryID, key, documentId, publicationId, identifiedAt FROM documents ORDER BY libraryID, key'), ['libraryID', 'key', 'documentId', 'publicationId', 'identifiedAt']);
    const documentPositions = plain(await q('SELECT documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice FROM document_positions ORDER BY documentId'), ['documentId', 'format', 'publicationId', 'locator', 'anchorExact', 'anchorPrefix', 'anchorSuffix', 'stampAt', 'stampDevice']);
    const digest = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const pack = (rows) => JSON.stringify(rows);
    out.counts = { positions: positions.length, deletions: deletions.length, documents: documents.length, documentPositions: documentPositions.length };
    state.rowsBefore = { positions, deletions, documents, documentPositions };
    state.rowsBeforeHashes = {
      positions: await digest(pack(positions)),
      deletions: await digest(pack(deletions)),
      documents: await digest(pack(documents)),
      documentPositions: await digest(pack(documentPositions)),
    };
    out.hashes = state.rowsBeforeHashes;

    // The deterministic Document Id of the run's fixture, computed offline
    // from its central directory (epub-zip-v1): any existing record for it is
    // the owner's and must survive this run (rows are restored, not merged).
    const fixtureDocId = 'sha256:313d0ccccb2bd613c829124480e989633c59c1379e470b0d444556df0681c408';
    state.fixtureDocId = fixtureDocId;
    out.fixtureDocPreexisting = {
      documentsRows: documents.filter((r) => r.documentId === fixtureDocId).length,
      documentPositionsRows: documentPositions.filter((r) => r.documentId === fixtureDocId).length,
    };
    state.fixtureDocWasAbsent = out.fixtureDocPreexisting.documentsRows === 0 && out.fixtureDocPreexisting.documentPositionsRows === 0;
    if (!state.fixtureDocWasAbsent) throw new Error('fixture Document Id already exists; use a distinct fixture before importing');
    const P = Zotero.ZoteroTTSRun.params;
    out.fixtureTitle = P.fixtureTitle;
  } finally {
    try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
  }
  return JSON.stringify(out, null, 1);
})()
