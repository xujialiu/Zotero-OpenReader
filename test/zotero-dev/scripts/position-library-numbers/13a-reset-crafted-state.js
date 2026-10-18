// Recovery for item 2 (this run only): the first Shift+Space attempt left a
// session that kept reading and moved this computer's entry to the last page.
// With every sync suspended: the local row is reset to the crafted point and
// the crafted ts, the server file's mirror is reset the same way, so the next
// script's Shift+Space resumes from the crafted sentence as item 2 requires.
// The sampler's map is reloaded from disk afterwards by an in-place reinstall
// (run between scripts, the sanctioned plugin-restart path).
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  const K = f.key;
  const craftedTs = s.craftedTs;
  if (!craftedTs || !s.craftPos) throw new Error('run 12 first');
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

  // The local row, through a second absolute-path connection.
  const position = JSON.parse(await d.position());
  const path = position.database?.path;
  if (!path) throw new Error('DB path unknown');
  const db = new Zotero.DBConnection(path);
  try {
    const posJson = JSON.stringify(s.craftPos);
    await db.queryAsync('UPDATE positions SET pos=?, ts=? WHERE libraryID=1 AND key=?', [posJson, craftedTs, K]);
    const row = await db.queryAsync('SELECT libraryID, key, pos, ts FROM positions WHERE key=?', [K]);
    const plain = row.length ? { libraryID: row[0].libraryID, key: row[0].key, pos: row[0].pos, ts: row[0].ts } : null;
    out.row = plain;
    out.rowMatchesCraft = !!plain && plain.ts === craftedTs && JSON.stringify(JSON.parse(plain.pos)) === JSON.stringify(s.craftPos);
    const cnt = await db.queryAsync('SELECT COUNT(*) AS n FROM positions');
    out.rowCount = Number(cnt[0].n);
  } finally {
    try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
  }

  // The server file: the mirror entry (lib 1) reset to the craft; lib 7 as written.
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const file = JSON.parse(await g.text());
  out.fileEntriesBefore = file.items.filter((i) => i.key === K).map((i) => ({ lib: i.lib, ts: i.ts }));
  const items = file.items
    .map((i) => (i.key === K && i.lib === 1 ? { lib: 1, key: K, pos: s.craftPos, ts: craftedTs } : i))
    .sort((a, b) => (a.lib - b.lib) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = JSON.stringify({ format: 'zotero-tts-positions', version: 1, items });
  const put = await fetch(url + 'zotero-tts-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  const v = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.putVerified = (await v.text()) === body;
  out.fileEntriesAfter = items.filter((i) => i.key === K).map((i) => ({ lib: i.lib, ts: i.ts }));
  out.stillSuspended = p.getBoolPref(realKey) === false;
  return JSON.stringify(out);
})()
