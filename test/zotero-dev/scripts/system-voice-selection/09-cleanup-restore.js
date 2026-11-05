// Case: system-voice-selection, item 6 — cleanup and restoration.
// Corrected order (the first revision restored webdav.enabled inside the
// generic reading-pref loop, turning the folder ON before volume/memory, and
// compared document records by key set only): the WebDAV folder is excluded
// from the reading-pref loop and stays OFF through all fixture and reading
// cleanup; reading prefs restore first with readAloud.memory LAST among
// them; document records are compared by KEY SET AND CONTENTS — on a
// mismatch the folder restore is SKIPPED (isolation stays off, the owner's
// concurrent data is preserved) and a blocker is reported. The WebDAV
// restore writes the snapshot's exact value AND user flag (no hard-coded
// true) and is the FINAL preference write; afterwards a post-write audit
// re-reads every restored pref's user flag and effective value, the document
// branch, and all four transports twice, requiring stability. Only a window
// the run itself opened is closed; a pre-existing settings window is left
// alone. Zotero is left minimized (the owner's explicit exception).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow();
  const P = 'extensions.zotero.zotero-tts.';
  const WEBDAV = P + 'webdav.enabled';
  const MEMORY = P + 'readAloud.memory';
  const snap = S.svsPrefs;
  if (!snap) throw new Error('fail-closed: no retained snapshot in run state — refusing to restore');
  const prefs = Services.prefs;

  // 1. Fixture teardown first (folder still off — never touched here)
  const itemID = S.svsFixtureItemID;
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
  if (reader && reader.tabID) {
    win.Zotero_Tabs.close(reader.tabID);
    for (let i = 0; i < 30 && (Zotero.Reader._readers || []).some((r) => r.itemID === itemID); i++) await sleep(200);
  }
  out.fixtureReaderGone = !(Zotero.Reader._readers || []).some((r) => r.itemID === itemID);
  await sleep(800);
  const item = Zotero.Items.get(itemID);
  if (item) await item.eraseTx();
  out.fixtureErased = !Zotero.Items.get(itemID);
  await sleep(500);
  const dvKey = S.svsFixtureDocVoiceKey;
  if (dvKey && prefs.prefHasUserValue(dvKey)) prefs.clearUserPref(dvKey);
  out.fixtureDocVoiceRemoved = !prefs.prefHasUserValue(dvKey);
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.rowsNow = pos.database ? pos.database.rows : null;
  out.rowsBaseline = S.svsRowsBaseline;
  out.rowsBackAtBaseline = out.rowsNow === S.svsRowsBaseline;

  // 2. Reading prefs (everything except webdav.enabled), memory LAST
  const readNow = (name) => {
    const t = prefs.getPrefType(name);
    const user = t !== 0 && prefs.prefHasUserValue(name);
    let effective = null;
    if (t === 32) effective = prefs.getStringPref(name);
    else if (t === 64) effective = prefs.getIntPref(name);
    else if (t === 128) effective = prefs.getBoolPref(name);
    return { user, effective };
  };
  const restoreOne = (name) => {
    const before = snap[name];
    if (!before) return 'no-snapshot';
    const t = prefs.getPrefType(name);
    if (before.user) {
      if (t === 32) prefs.setStringPref(name, before.value);
      else if (t === 64) prefs.setIntPref(name, before.value);
      else if (t === 128) prefs.setBoolPref(name, before.value);
    } else if (t !== 0 && prefs.prefHasUserValue(name)) prefs.clearUserPref(name);
    const now = readNow(name);
    return { userMatch: now.user === before.user, effectiveMatch: JSON.stringify(now.effective) === JSON.stringify(before.effective ?? before.value) };
  };
  out.restore = {};
  const names = Object.keys(snap).filter((n) => n && !n.startsWith('__') && n !== WEBDAV && n !== MEMORY);
  for (const name of names) out.restore[name] = restoreOne(name);
  out.restore[MEMORY] = restoreOne(MEMORY); // last among the reading prefs

  // 3. documentVoices: key set AND contents against the snapshot
  const docBranch = prefs.getBranch(P + 'documentVoices.');
  const docNow = {};
  for (const k of docBranch.getChildList('')) {
    const full = P + 'documentVoices.' + k;
    if (prefs.prefHasUserValue(full) && prefs.getPrefType(full) === 32) docNow[k] = prefs.getStringPref(full);
  }
  const docBefore = snap.__documentVoices || {};
  const beforeKeys = Object.keys(docBefore).sort();
  const nowKeys = Object.keys(docNow).sort();
  const keysMatch = JSON.stringify(beforeKeys) === JSON.stringify(nowKeys);
  const contentsDiff = beforeKeys.filter((k) => docNow[k] !== docBefore[k])
    .concat(nowKeys.filter((k) => !(k in docBefore)));
  out.docVoicesMatchBaseline = keysMatch && contentsDiff.length === 0;
  out.docVoicesCounts = { before: beforeKeys.length, now: nowKeys.length };
  if (!out.docVoicesMatchBaseline) out.docVoicesDiffs = contentsDiff.slice(0, 6);

  // 4. Close only a settings window this run opened
  let prefWin = null;
  try { prefWin = Services.wm.getMostRecentWindow('zotero:pref'); } catch (e) {}
  if (prefWin && !S.svsSettingsWindowAtBaseline) {
    prefWin.close();
    for (let i = 0; i < 20 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250);
    out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
  } else out.settingsWindow = prefWin ? 'left open (pre-existing at baseline)' : 'none open';

  // 5. Owner's selected tab back; debug store back
  const sel = S.svsWindow ? S.svsWindow.selectedID : null;
  if (sel && win.Zotero_Tabs.selectedID !== sel && (win.Zotero_Tabs._tabs || []).some((t) => t.id === sel)) {
    win.Zotero_Tabs.select(sel);
    await sleep(400);
  }
  out.selectedTabRestored = win.Zotero_Tabs.selectedID === sel;
  out.userReader = (Zotero.Reader._readers || []).map((r) => {
    const um = r._internalReader ? r._internalReader._readAloudManager : null;
    const it = r.itemID ? Zotero.Items.get(r.itemID) : null;
    const doc = it ? (it.parentItem ?? it) : null;
    return { title: doc && doc.getField ? String(doc.getField('title') || '').slice(0, 44) : null, active: um ? !!um.active : null, paused: um ? !!um.paused : null, voice: um ? um.selectedVoiceID ?? null : null };
  });
  if (S.svsDebugStoring === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
  out.debugStore = { was: S.svsDebugStoring, now: Zotero.Debug.storing };

  // 6. WebDAV folder LAST — exact snapshot value AND user flag — but never on a
  //    document-contents mismatch (isolation stays off, blocker reported)
  if (!out.docVoicesMatchBaseline) {
    out.webdavLeftOff = true;
    out.blocker = 'documentVoices contents differ from baseline; folder restore skipped so no owner WebDAV state is exposed — resolve the mismatch before restoring';
  } else {
    const w = snap[WEBDAV];
    if (w) {
      const t = prefs.getPrefType(WEBDAV);
      if (w.user) {
        if (t === 128) prefs.setBoolPref(WEBDAV, w.value === true);
      } else if (t !== 0 && prefs.prefHasUserValue(WEBDAV)) prefs.clearUserPref(WEBDAV);
    }
    out.webdavRestored = { snapshotUser: snap[WEBDAV] ? snap[WEBDAV].user : null, snapshotValue: snap[WEBDAV] ? snap[WEBDAV].value : null };
  }

  // 7. Post-final-write audit: every pref, the branch, four transports — twice
  await sleep(1000);
  const audit = async () => {
    const prefsNow = {};
    for (const name of Object.keys(snap).filter((n) => n && !n.startsWith('__'))) {
      const before = snap[name];
      const now = readNow(name);
      prefsNow[name] = now.user === before.user && JSON.stringify(now.effective) === JSON.stringify(before.effective ?? before.value) ? 'match' : { user: now.user, effective: now.effective, beforeUser: before.user, beforeEffective: before.effective ?? before.value };
    }
    const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const ss = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const su = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    return JSON.stringify({
      folder: ps.folder,
      prefs: prefsNow,
      positions: { running: ps.transport?.running ?? null, outcome: ps.transport?.lastOutcome ?? null },
      sharedPositions: { running: ps.shared?.transport?.running ?? null, outcome: ps.shared?.transport?.lastOutcome ?? null },
      settingsSync: { running: ss.transport?.running ?? null, pendingChange: ss.transport?.pendingChange ?? null, outcome: ss.transport?.lastOutcome ?? null },
      settingsUpload: { pending: su.autoUpload?.pending ?? null, outcome: su.autoUpload?.lastOutcome ?? null },
    });
  };
  const audit1 = await audit();
  await sleep(2000);
  const audit2 = await audit();
  out.finalAudit = JSON.parse(audit2);
  out.finalAuditStable = audit1 === audit2;

  // 8. Minimize (owner's explicit final exception)
  if (win.windowState !== 2) win.minimize();
  await sleep(400);
  out.finalWindowState = win.windowState;
  return JSON.stringify(out, null, 1);
})()
