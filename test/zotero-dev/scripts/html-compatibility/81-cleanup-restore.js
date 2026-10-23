// Check 8, final restore. Requires the snapshots 00/01 left behind:
// state.webdav {value, user} for the folder switch and state.baseline.window for the
// geometry/tab. Missing snapshot, or a failed fixture cleanup (state.cleanupOk
// false), means the folder is left OFF and the restore is reported blocked —
// no guessed values. The restored folder value must equal the snapshot's
// value (not a constant). Only a settings window this run opened is closed
// (state.baseline.settingsWindowOpen false + one open now); a
// preexisting one is left alone.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'cleanup-restore' };

  const full = 'extensions.zotero.zotero-tts.webdav.enabled';
  const webdavSnap = state.webdav || null;
  const baseline = state.baseline || null;
  const windowSnap = baseline?.window || null;
  out.snapshotsPresent = { webdav: !!webdavSnap, window: !!windowSnap, baseline: !!baseline };

  // Blocked when the snapshot is missing or fixture cleanup did not succeed:
  // keep the folder OFF (the isolation state) and report.
  const cleanupProven = state.cleanupOk === true;
  out.cleanupProven = cleanupProven;
  if (!webdavSnap || !windowSnap || !baseline || !cleanupProven) {
    Services.prefs.setBoolPref(full, false);
    const syncBlocked = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.blocked = {
      reason: !webdavSnap ? 'no state.webdav snapshot' : !windowSnap ? 'no baseline window snapshot' : 'fixture cleanup not proven successful',
      folderLeftOff: syncBlocked.folder === false,
      folder: syncBlocked.folder,
      folderAfterRestore: syncBlocked.folder,
    };
    out.ok = false;
    return JSON.stringify(out, null, 1);
  }

  // 1. A settings window this run opened is closed first; a preexisting one
  //    (open at baseline) is left alone.
  const openAtStart = baseline.settingsWindowOpen !== false;
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin && !openAtStart) { try { prefWin.close(); out.testSettingsWindowClosed = true; } catch (e) { out.prefCloseError = String(e); } }
  else if (prefWin) out.preexistingSettingsWindowLeftOpen = true;

  // 2. WebDAV folder switch: exact snapshot value + user-value flag.
  if (webdavSnap.user) Services.prefs.setBoolPref(full, !!webdavSnap.value);
  else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
  out.webdavRestored = {
    expectedValue: webdavSnap.value,
    value: Services.prefs.getBoolPref(full, false),
    user: Services.prefs.prefHasUserValue(full),
    matches: Services.prefs.getBoolPref(full, false) === webdavSnap.value && Services.prefs.prefHasUserValue(full) === webdavSnap.user,
  };
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.folderAfterRestore = sync.folder;

  // 3. Geometry and selected tab from the baseline snapshot, then minimized.
  const w = windowSnap || {};
  const main = Zotero.getMainWindow();
  if (windowSnap) {
    try {
      if (w.outerWidth && w.outerHeight) main.resizeTo(w.outerWidth, w.outerHeight);
      if (typeof w.screenX === 'number') main.moveTo(w.screenX, w.screenY);
      if (w.selectedTab && main.Zotero_Tabs && (main.Zotero_Tabs._tabs || []).some((t) => t.id === w.selectedTab)) main.Zotero_Tabs.select(w.selectedTab);
    } catch (e) { out.geometryError = String(e); }
  } else {
    out.geometryBlocked = 'no state.window snapshot; geometry not restored';
  }
  await new Promise((r) => setTimeout(r, 500));
  try { main.minimize(); } catch (e) { out.minimizeError = String(e); }
  await new Promise((r) => setTimeout(r, 400));
  out.finalWindowState = main.windowState;
  out.selectedTab = main.Zotero_Tabs.selectedID;
  if (typeof baseline.debugStoring === 'boolean') Zotero.Debug.setStore(baseline.debugStoring);

  out.ok = out.webdavRestored.matches
    && out.folderAfterRestore === webdavSnap.value
    && out.finalWindowState === 2
    && !!windowSnap;
  return JSON.stringify(out, null, 1);
})()
