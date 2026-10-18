// Teardown of this run's first fixture (KM4FPTAJ, the one whose page 4 the
// analysis excluded): with every sync suspended — close its tab, erase the
// attachment, remove the erase's tombstone and any of its rows from the local
// store, strip its two entries from the server file, and prove the local store
// back at the 02 snapshot hashes. A reinstall between scripts reloads memory.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  const K = f.key;
  const p = Services.prefs;
  const realKey = 'extensions.zotero.zotero-tts.webdav.syncPositions';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;

  // Suspend, settle.
  p.setBoolPref(realKey, false);
  const settleStart = Date.now();
  while (Date.now() - settleStart < 30000) {
    await sleep(600);
    const st = JSON.parse(await d.positionSync());
    const position = JSON.parse(await d.position());
    if (st.transport?.running === false && st.shared?.transport?.running === false && position.store?.queued === 0 && position.store?.writing === false) break;
  }
  out.suspended = p.getBoolPref(realKey) === false;

  // Close the tab through the real path, then erase.
  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID) || null;
  if (reader?.tabID) {
    win.Zotero_Tabs.close(String(reader.tabID));
    await sleep(2500);
    out.tabClosed = true;
  }
  const item = Zotero.Items.get(f.itemID);
  if (item) { await item.eraseTx(); out.erased = f.itemID; }
  await sleep(3000);
  const position = JSON.parse(await d.position());
  out.afterErase = { rows: position.database?.rows ?? null, localEntries: JSON.parse(await d.positionSync()).localEntries ?? null };

  // Local rows: the tombstone (and anything left of K) out, via the second connection.
  const path = position.database?.path;
  const db = new Zotero.DBConnection(path);
  try {
    await db.queryAsync('DELETE FROM deletions WHERE key=?', [K]);
    await db.queryAsync('DELETE FROM positions WHERE key=?', [K]);
    await db.queryAsync('DELETE FROM documents WHERE key=?', [K]);
    const q = async (sql) => await db.valueQueryAsync(sql);
    out.afterCleanup = {
      positions: Number(await q('SELECT COUNT(*) FROM positions')),
      deletions: Number(await q('SELECT COUNT(*) FROM deletions')),
      documents: Number(await q('SELECT COUNT(*) FROM documents')),
      documentPositions: Number(await q('SELECT COUNT(*) FROM document_positions')),
    };
    const pack = async (sql, cols) => {
      const rows = (await db.queryAsync(sql)) ?? [];
      const plain = rows.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(plain))))].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    out.hashesAfter = {
      positions: await pack('SELECT libraryID, key, pos, ts FROM positions ORDER BY libraryID, key', ['libraryID', 'key', 'pos', 'ts']),
      deletions: await pack('SELECT libraryID, key, ts FROM deletions ORDER BY libraryID, key', ['libraryID', 'key', 'ts']),
      documents: await pack('SELECT libraryID, key, documentId, publicationId, identifiedAt FROM documents ORDER BY libraryID, key', ['libraryID', 'key', 'documentId', 'publicationId', 'identifiedAt']),
      documentPositions: await pack('SELECT documentId, format, publicationId, locator, anchorExact, anchorPrefix, anchorSuffix, stampAt, stampDevice FROM document_positions ORDER BY documentId', ['documentId', 'format', 'publicationId', 'locator', 'anchorExact', 'anchorPrefix', 'anchorSuffix', 'stampAt', 'stampDevice']),
    };
    out.hashesMatchSnapshot = JSON.stringify(out.hashesAfter) === JSON.stringify(s.rowsBeforeHashes);
  } finally {
    try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
  }

  // The server file: both of K's entries out.
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const file = JSON.parse(await g.text());
  const kept = file.items.filter((i) => i.key !== K);
  out.fileRemoved = file.items.length - kept.length;
  const body = JSON.stringify({ format: 'zotero-tts-positions', version: 1, items: kept });
  const put = await fetch(url + 'zotero-tts-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  const v = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.putVerified = (await v.text()) === body;
  out.stillSuspended = p.getBoolPref(realKey) === false;
  return JSON.stringify(out);
})()
