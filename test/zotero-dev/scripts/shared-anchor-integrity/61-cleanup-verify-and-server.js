// Cleanup gate, part 2 — runs after the in-place reinstall (bridge call
// between 60 and 61) that rebuilt the plugin's in-memory maps from the clean
// store: prove the startup steps, the re-isolation, the counts and the DB
// hashes back at the baseline (no fixture residue in memory), then restore
// both test-server files byte-identically and prove no fixture key or
// Document Id remains in either. Sync stays suspended throughout; the normal
// destination is NOT touched here (that is 62, last).
(async () => {
  const out = { step: 'cleanup-verify-and-server' };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    state.cleanupVerified = false;
    if (state.teardownVerified !== true || state.fixtureDocWasAbsent !== true) throw new Error('local teardown gate missing');
    if (JSON.parse(await d.positionSync()).folder !== false) throw new Error('folder must stay off after reinstall');
    // The reinstall re-ran startup: every step ok, failed empty.
    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.startup = { version: startup.version, failed: startup.failed, stepCount: (startup.steps ?? []).length };
    out.startup.ok = startup.version === state.expectedVersion && (startup.failed ?? []).length === 0;
    if (!out.startup.ok) throw new Error('installed build/startup mismatch');

    // Re-isolation after the reinstall (an upgrade may poke the switches).
    for (const name of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) if (p.getBoolPref(prefix + name) !== false) p.setBoolPref(prefix + name, false);
    const trimSlash = (v) => { let o = String(v); while (o.endsWith('/')) o = o.slice(0, -1); return o; };
    out.isolation = {
      urlStillTest: trimSlash(String(p.getStringPref(prefix + 'webdav.url') ?? '')) === trimSlash(state.testUrl),
      switches: { syncPositions: p.getBoolPref(prefix + 'webdav.syncPositions'), syncSettings: p.getBoolPref(prefix + 'webdav.syncSettings'), autoUploadSettings: p.getBoolPref(prefix + 'webdav.autoUploadSettings') },
      volume: p.getIntPref(prefix + 'readAloud.volume'),
    };

    if (!out.isolation.urlStillTest || Object.values(out.isolation.switches).some(v => v !== false)) throw new Error('test destination/switch isolation failed');

    // Settle, then counts + hashes.
    const end = Date.now() + 30000;
    let settled = false;
    while (Date.now() < end) {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(await d.positionSync());
      const settings = JSON.parse(await d.settingsSync());
      const backup = JSON.parse(await d.settingsUpload());
      settled = position.store?.queued === 0 && position.store?.writing === false
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.running === false && settings.transport?.pendingChange === false && backup.autoUpload?.pending === false;
      if (settled) break;
      await sleep(400);
    }
    out.settled = settled;
    if (!settled) throw new Error('four transports did not settle');
    const position = JSON.parse(await d.position());
    const sync = JSON.parse(await d.positionSync());
    const upload = JSON.parse(await d.settingsUpload());
    out.countsAfterReload = {
      databaseRows: position.database?.rows ?? null,
      localEntries: sync.localEntries ?? null,
      tombstones: sync.tombstones ?? null,
      documents: sync.shared?.documents?.documents ?? null,
      sharedItems: sync.shared?.documents?.items ?? null,
    };
    out.countsMatchBaseline = JSON.stringify(out.countsAfterReload) === JSON.stringify(state.rowsBeforeCounts);
    out.noPendingUpload = upload.autoUpload?.pending === false && sync.transport?.running === false && sync.shared?.transport?.running === false;

    const path = position.database?.path;
    const db = new Zotero.DBConnection(path);
    try {
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
      out.hashesMatchSnapshot = JSON.stringify(out.hashesAfter) === JSON.stringify(state.rowsBeforeHashes);
      out.fixtureRowsLeft = {
        positions: Number(await db.valueQueryAsync('SELECT COUNT(*) FROM positions WHERE key=?', [f.key])),
        deletions: Number(await db.valueQueryAsync('SELECT COUNT(*) FROM deletions WHERE key=?', [f.key])),
        documents: Number(await db.valueQueryAsync('SELECT COUNT(*) FROM documents WHERE key=?', [f.key])),
        documentPositions: Number(await db.valueQueryAsync('SELECT COUNT(*) FROM document_positions WHERE documentId=?', [state.fixtureDocId])),
      };
    } finally {
      try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
    }

    if (!out.countsMatchBaseline || !out.noPendingUpload || !out.hashesMatchSnapshot || Object.values(out.fixtureRowsLeft).some(v => v !== 0)) {
      throw new Error('local data/queue audit failed before server restore');
    }

    // Server files back to the as-found bytes.
    if (typeof state.nativeFileBefore !== 'string' || typeof state.sharedFileBefore !== 'string') throw new Error('server snapshot missing from state');
    const url = String(p.getStringPref(prefix + 'webdav.url') || '').trim().replace(/\/+$/, '') + '/';
    const bytes = new TextEncoder().encode(String(p.getStringPref(prefix + 'webdav.username') || '') + ':' + String(p.getStringPref(prefix + 'webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const auth = 'Basic ' + btoa(binary);
    const digest = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const putBack = async (name, text) => {
      const put = await fetch(url + name, { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: text, cache: 'no-store' });
      const get = await fetch(url + name, { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
      const back = await get.text();
      return { name, putStatus: put.status, getStatus: get.status, byteIdentical: back === text, sha256: await digest(back) };
    };
    out.nativeRestore = await putBack('zotero-tts-positions.json', state.nativeFileBefore);
    out.sharedRestore = await putBack('xujialiu-positions.json', state.sharedFileBefore);
    out.noFixtureInFiles = !state.nativeFileBefore.includes(f.key) && !state.sharedFileBefore.includes(state.fixtureDocId);
    // One more settle: a poke must not change the restored bytes.
    await sleep(2500);
    const reNative = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    const reShared = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    out.stableAfterSettle = (await reNative.text()) === state.nativeFileBefore && (await reShared.text()) === state.sharedFileBefore;

    out.ok = out.startup.ok && out.isolation.urlStillTest && Object.values(out.isolation.switches).every((v) => v === false)
      && out.settled && out.countsMatchBaseline && out.noPendingUpload
      && out.hashesMatchSnapshot && Object.values(out.fixtureRowsLeft).every((v) => v === 0)
      && out.nativeRestore.byteIdentical && out.sharedRestore.byteIdentical
      && out.noFixtureInFiles && out.stableAfterSettle;
    state.cleanupVerified = out.ok;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
