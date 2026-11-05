// Cleanup gate, part 1 (all sync suspended throughout): close the fixture
// tab, erase the fixture attachment, remove the run's rows (positions and
// deletions by key, documents by key, document_positions by Document Id),
// and prove all four tables byte-identical to the pre-run snapshot hashes.
// The in-place reinstall that reloads the plugin's in-memory maps happens as
// a bridge call BETWEEN this script and 61 (the same path a real upgrade
// takes), never inside a script.
(async () => {
  const out = { step: 'cleanup-teardown' };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    state.teardownVerified = false;
    if (!f?.itemID || !state.rowsBeforeHashes || state.fixtureDocWasAbsent !== true) throw new Error('state/fixture absence proof missing');
    p.setBoolPref(prefix + 'webdav.enabled', false);
    if (JSON.parse(await d.positionSync()).folder !== false) throw new Error('folder did not suspend');
    // Suspend everything, settle.
    for (const name of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) p.setBoolPref(prefix + name, false);
    const end = Date.now() + 30000;
    let settled = false;
    while (Date.now() < end) {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(await d.positionSync());
      const settings = JSON.parse(await d.settingsSync());
      const upload = JSON.parse(await d.settingsUpload());
      settled = position.store?.queued === 0 && position.store?.writing === false
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.running === false && settings.transport?.pendingChange === false && upload.autoUpload?.pending === false;
      if (settled) break;
      await sleep(400);
    }
    out.settled = settled;
    if (!settled) throw new Error('transports did not settle before teardown');

    // Close the fixture tab only (playback 3.26), the user's tabs untouched.
    const win = Zotero.getMainWindow();
    const reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    if (reader?.tabID) {
      try { const m = reader._internalReader?._readAloudManager; if (m?.active) reader._internalReader.toggleReadAloudPopup(false); } catch {}
      win.Zotero_Tabs.close(String(reader.tabID));
      await sleep(2500);
      out.tabClosed = !(Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID);
    }

    // Erase the fixture attachment.
    const item = Zotero.Items.get(f.itemID);
    if (item) { await item.eraseTx(); out.erased = f.itemID; }
    await sleep(2500);

    // The run's rows out: tombstone first (the erase created one), then the rest.
    const position = JSON.parse(await d.position());
    const path = position.database?.path;
    if (!path) throw new Error('db path unknown');
    const db = new Zotero.DBConnection(path);
    try {
      await db.queryAsync('DELETE FROM deletions WHERE libraryID=? AND key=?', [f.lib, f.key]);
      await db.queryAsync('DELETE FROM positions WHERE libraryID=? AND key=?', [f.lib, f.key]);
      await db.queryAsync('DELETE FROM documents WHERE libraryID=? AND key=?', [f.lib, f.key]);
      await db.queryAsync('DELETE FROM document_positions WHERE documentId=?', [state.fixtureDocId]);
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
    } finally {
      try { await db.closeDatabase(); } catch (e) { out.closeError = String(e); }
    }
    const docPrefix = prefix + 'documentVoices.';
    const fixtureVoice = 'user/' + f.key;
    if (!state.documentVoicesBefore) throw new Error('document voice snapshot missing');
    if (!(fixtureVoice in state.documentVoicesBefore) && p.prefHasUserValue(docPrefix + fixtureVoice)) p.clearUserPref(docPrefix + fixtureVoice);
    const voicesAfter = Object.fromEntries(p.getBranch(docPrefix).getChildList('').sort().map(name => [name, {
      value: p.getStringPref(docPrefix + name), user: p.prefHasUserValue(docPrefix + name),
    }]));
    out.documentVoicesMatchBaseline = JSON.stringify(voicesAfter) === JSON.stringify(state.documentVoicesBefore);
    out.fixtureItemGone = !Zotero.Items.get(f.itemID);
    out.ok = out.settled && out.fixtureItemGone && out.hashesMatchSnapshot === true && out.documentVoicesMatchBaseline;
    state.teardownVerified = out.ok;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
