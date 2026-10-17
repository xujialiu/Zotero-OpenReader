(async () => {
  // Item 12 (issue #183) cleanup: close players, erase the fixture, its
  // documentVoices record and position row, restore every snapshotted pref
  // byte-identically (memory last), WebDAV folder back on and confirmed,
  // raw snapshot files deleted, debug store off, host minimized.
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params;
  const base = state.item12run.baseline;
  if (!base) throw new Error('item12 baseline missing');
  const { itemID, key } = state.item12run.fixture;
  // 1. close the fixture's player
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  let closed = 'reader gone';
  if (reader) {
    reader._internalReader.toggleReadAloudPopup(false);
    for (let i = 0; i < 50; i++) { if (!reader._internalReader._readAloudManager?.active) break; await sleep(150); }
    closed = !reader._internalReader._readAloudManager?.active;
  }
  // 2. documentVoices record + fixture erase + position row
  const recordFull = P + 'documentVoices.user/' + key;
  const removedRecord = Services.prefs.prefHasUserValue(recordFull);
  if (removedRecord) Services.prefs.clearUserPref(recordFull);
  let erased = 'already gone';
  const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const item = Zotero.Items.get(itemID);
  if (item) { await item.eraseTx(); erased = !Zotero.Items.get(itemID); }
  await sleep(800);
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const readersNow = (Zotero.Reader._readers || []).map(r => r.itemID);
  // 3. documentVoices.* branch back to the snapshot
  const branchReport = { restored: 0, cleared: 0 };
  const branch = Services.prefs.getBranch(P + 'documentVoices.');
  const nowKeys = branch.getChildList('');
  const baseBranch = base.prefs['documentVoices.*'] || {};
  for (const k of nowKeys) {
    if (!(k in baseBranch)) { Services.prefs.clearUserPref(P + 'documentVoices.' + k); branchReport.cleared++; }
  }
  for (const k of Object.keys(baseBranch)) {
    const want = baseBranch[k].value;
    let cur = null;
    try { cur = Services.prefs.getStringPref(P + 'documentVoices.' + k); } catch (e) { cur = null; }
    if (cur !== want) { Services.prefs.setStringPref(P + 'documentVoices.' + k, want); branchReport.restored++; }
  }
  // 4. named prefs back, byte-identically (order: volume first, memory last)
  const report = {};
  const setBack = (name, full) => {
    const snap = base.prefs[name];
    if (!snap) { report[name] = 'no-snapshot'; return; }
    if (snap.type === 'none') { if (Services.prefs.prefHasUserValue(full)) { Services.prefs.clearUserPref(full); report[name] = 'cleared (was none)'; } else report[name] = 'already none'; return; }
    if (snap.type === 'bool') { if (snap.user) Services.prefs.setBoolPref(full, snap.value); else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); }
    else if (snap.type === 'int') { if (snap.user) Services.prefs.setIntPref(full, snap.value); else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); }
    else { if (snap.user) Services.prefs.setStringPref(full, snap.value); else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); }
    const nowUser = Services.prefs.prefHasUserValue(full);
    const nowVal = snap.type === 'bool' ? Services.prefs.getBoolPref(full) : snap.type === 'int' ? Services.prefs.getIntPref(full) : Services.prefs.getStringPref(full);
    report[name] = { matchesBaseline: nowUser === snap.user && nowVal === snap.value, userNow: nowUser };
  };
  setBack('readAloud.volume', P + 'readAloud.volume');
  setBack('readAloud.stripAngleBrackets', P + 'readAloud.stripAngleBrackets');
  setBack('readAloud.bracketPairs', P + 'readAloud.bracketPairs');
  setBack('cacheAudio', P + 'cacheAudio');
  setBack('local.enabled', P + 'local.enabled');
  setBack('local.baseURL', P + 'local.baseURL');
  setBack('local.engine', P + 'local.engine');
  setBack('system.enabled', P + 'system.enabled');
  setBack('documentVoiceChanged', P + 'documentVoiceChanged');
  setBack('zotero-standard.enabled', P + 'zotero-standard.enabled');
  setBack('zotero-premium.enabled', P + 'zotero-premium.enabled');
  setBack('readAloud.favoritesOnly', P + 'readAloud.favoritesOnly');
  setBack('readAloud.sameForAllDocuments', P + 'readAloud.sameForAllDocuments');
  setBack('readAloud.favorites', P + 'readAloud.favorites');
  setBack('documentVoiceMigrated', P + 'documentVoiceMigrated');
  setBack('extensions.zotero.readAloud.memory', 'extensions.zotero.readAloud.memory');
  setBack('extensions.zotero.reader.readAloudVoices', 'extensions.zotero.reader.readAloudVoices');
  setBack('readAloud.defaultVoice', P + 'readAloud.defaultVoice');
  setBack('readAloud.memory', P + 'readAloud.memory');
  // 5. WebDAV folder back on and confirmed
  const wdSnap = state.item12run.webdav?.snap || { value: true, user: true };
  if (wdSnap.user) Services.prefs.setBoolPref('extensions.zotero.zotero-tts.webdav.enabled', wdSnap.value);
  else Services.prefs.clearUserPref('extensions.zotero.zotero-tts.webdav.enabled');
  await sleep(1200);
  const posSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
  // 6. raw snapshot files deleted
  const filesGone = {};
  for (const rel of [
    ['2026-10-17-1.16.11-beta3-docvoice', 'item12-baseline.json'],
    ['2026-10-17-1.16.11-beta3-docvoice', 'baseline-snapshot.json'],
    [params.runId, 'item12-baseline.json'],
  ]) {
    const p = PathUtils.join(params.tmpDir, ...rel);
    try { await IOUtils.remove(p, { ignoreExisting: true }); } catch (e) {}
    try { filesGone[rel.join('/')] = !(await IOUtils.exists(p)); } catch (e) { filesGone[rel.join('/')] = 'check-failed: ' + e.message; }
  }
  // 7. debug store off (baseline), host minimized (owner's standing exception)
  if (!base.debugStoring) Zotero.Debug.setStore(false);
  const main = Zotero.getMainWindow();
  const winBefore = { windowState: main.windowState };
  try { main.minimize(); } catch (e) {}
  await sleep(600);
  const mismatches = Object.entries(report).filter(([k, v]) => v && typeof v === 'object' && v.matchesBaseline === false).map(([k]) => k);
  return JSON.stringify({
    playerClosed: closed, removedRecord, erased,
    positionRowsBefore: posBefore.database.rows, positionRowsAfter: pos.database.rows,
    positionRowRemoved: (pos.database.rows ?? 0) < (posBefore.database.rows ?? 0),
    readersNow, ownerReadersStill: (base.readers || []).every(r => readersNow.includes(r.itemID)),
    branchReport, prefsReport: report, prefMismatches: mismatches,
    webdav: { folderPref: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.webdav.enabled'), posSyncFolder: posSync.folder, uploadFolder: up.folder, syncFolder: sync.folder },
    filesGone, debugStoring: Zotero.Debug.storing,
    winBefore, winAfter: { windowState: main.windowState },
  }, null, 1);
})()
