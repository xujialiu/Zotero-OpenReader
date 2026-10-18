// restore-fix4 — the run's final restore: every snapshotted pref byte-identically (user flag
// honored), document-voice records back to the baseline set, fixture items erased, the settings
// window closed, the owner's tab reselected, the host minimized (the owner's exception).
// WebDAV: the folder's switch had NO user value at baseline -> clear it (the on-disk prefs.js
// evidence from 17:20); syncPositions/syncSettings were already false and are not touched.
(async () => {
  const out = { restored: {}, mismatches: [] };
  const S = Zotero.ZoteroTTSRun.state;
  const snap = S.fix4Prefs ?? {};
  const win = Zotero.getMainWindow();
  const put = (name, snapEntry, secret) => {
    const f = 'extensions.zotero.' + name;
    let now;
    try { now = Zotero.Prefs.get(name, true); } catch (e) { now = undefined; }
    const target = snapEntry.hadUser ? snapEntry.value : undefined;
    if (snapEntry.hadUser) Zotero.Prefs.set(name, snapEntry.value);
    else if (Services.prefs.prefHasUserValue(f)) Services.prefs.clearUserPref(f);
    let after;
    try { after = Zotero.Prefs.get(name, true); } catch (e) { after = undefined; }
    const same = (snapEntry.hadUser ? after === snapEntry.value : after === undefined || after === null);
    out.restored[name] = { hadUser: snapEntry.hadUser, value: secret ? '(len ' + String(snapEntry.value ?? '').length + ')' : (snapEntry.value === null ? null : snapEntry.value), ok: same };
    if (!same) out.mismatches.push(name);
  };

  const NAMES = [
    'readAloud.volume', 'readAloud.memory', 'readAloud.defaultAutoScroll', 'readAloud.autoScrollMode',
    'readAloud.readingLine', 'readAloud.speedPercent', 'readAloud.defaultVoice', 'readAloud.favoriteVoices',
    'readAloud.playerLayout', 'system.enabled',
    'compatible.enabled', 'compatible.baseURL', 'compatible.model', 'compatible.voices',
    'shortcuts.speedUp', 'shortcuts.speedDown',
  ];
  for (const name of NAMES) put(name, snap[name] ?? { hadUser: false, value: null }, false);
  // secrets: restore from the private snapshot, report lengths only
  for (const name of ['compatible.apiKey', 'compatible.headers']) put(name, snap[name] ?? { hadUser: false, value: null }, true);
  // webdav folder switch: no user value at baseline -> clear
  if (Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled')) Services.prefs.clearUserPref('extensions.zotero.zotero-tts.webdav.enabled');
  out.restored['webdav.enabled'] = { cleared: !Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled') };
  // Zotero's own per-language voice map
  put('reader.readAloudVoices', snap['reader.readAloudVoices'] ?? { hadUser: false, value: null }, false);
  const ravFull = 'extensions.zotero.reader.readAloudVoices';
  out.restored['reader.readAloudVoices'].ok = (snap['reader.readAloudVoices'].hadUser ? Zotero.Prefs.get(ravFull, true) === snap['reader.readAloudVoices'].value : !Services.prefs.prefHasUserValue(ravFull));

  // fixture readers closed, fixture items erased
  for (const tab of [S.fix4SnapshotTab, S.fix4PdfTab, S.vs194Tab, S.vs194bTab, S.vs196Tab, S.vs196bTab, S.prTab]) {
    if (tab) { try { win.Zotero_Tabs.close(tab); } catch (e) {} }
  }
  await new Promise((r) => setTimeout(r, 1200));
  const ids = [];
  for (const group of [S.fix4Items, S.vs194Items, S.vs196Items, S.prItems]) {
    for (const k of Object.keys(group ?? {})) if (typeof group[k] === 'number') ids.push(group[k]);
  }
  if (S.srFixture) ids.push(S.srFixture);
  const live = ids.filter((id) => Zotero.Items.get(id));
  if (live.length) await Zotero.Items.erase([...new Set(live)]);
  await new Promise((r) => setTimeout(r, 600));
  out.items = { erased: ids.length, remaining: ids.filter((id) => Zotero.Items.get(id)).length };
  out.readers = (Zotero.Reader._readers ?? []).map((r) => r.itemID);

  // document-voice records back to the baseline set
  const branch = Services.prefs.getBranch('extensions.zotero.zotero-tts.documentVoices.');
  const before = snap.documentVoices ?? {};
  let removed = 0, restoredValues = 0;
  for (const k of branch.getChildList('')) {
    if (!(k in before)) { Services.prefs.clearUserPref('extensions.zotero.zotero-tts.documentVoices.' + k); removed++; }
    else if (branch.getStringPref(k) !== before[k]) { branch.setStringPref(k, before[k]); restoredValues++; }
  }
  await new Promise((r) => setTimeout(r, 400));
  const nowKeys = branch.getChildList('');
  out.documentVoices = { removed, restoredValues, foreign: nowKeys.filter((k) => !(k in before)).length, missing: Object.keys(before).filter((k) => !nowKeys.includes(k)).length };

  // rows and folder
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.positionRows = { now: pos.database.rows, baseline: S.fix4RowsBaseline ?? null };
  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.webdav = { folder: ps.folder, syncPositions: ps.enabled, folderUserValue: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled') };

  // settings window closed, owner tab reselected, host minimized
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) prefWin.close();
  await new Promise((r) => setTimeout(r, 600));
  try { win.Zotero_Taps = null; } catch (e) {}
  try { if (S.ownerTab) win.Zotero_Tabs.select(S.ownerTab); } catch (e) {}
  try { if (win.windowState !== 2) win.windowState = 2; } catch (e) {}
  out.window = { minimized: win.windowState === 2 };

  out.pass = out.mismatches.length === 0 && out.items.remaining === 0
    && out.documentVoices.foreign === 0 && out.documentVoices.missing === 0
    && (S.fix4RowsBaseline == null || pos.database.rows === S.fix4RowsBaseline)
    && ps.folder === false && out.webdav.folderUserValue === false
    && out.window.minimized;
  return JSON.stringify(out);
})()
