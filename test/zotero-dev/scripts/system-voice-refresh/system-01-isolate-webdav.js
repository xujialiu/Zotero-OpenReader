// system-voice-refresh 01: WebDAV isolation before install or functional work (#241 baseline 0).
// Boundedly waits for idle pending work (positions transport, shared positions transport,
// settings-sync transport, settings auto-upload pending), switches the folder off,
// confirms "folder": false, and ONLY THEN mutes — reusing the ORIGINAL volume snapshot
// from 00 (verified equal before the write), never a fresh baseline taken after mutation.
// No request is ever sent to the owner's WebDAV server: idleness is read from the
// plugin's own transport stats. Stops the pass if isolation cannot be confirmed.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    if (!state.prefs || !state.prefs[prefix + 'webdav.enabled']) throw new Error('baseline snapshot missing: run 00 first');
    const running = (t) => !!(t && t.running);
    const idleSnapshot = async () => {
      const posSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settingsSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return {
        positionsRunning: running(posSync.transport),
        sharedPositionsRunning: running(posSync.shared ? posSync.shared.transport : null),
        settingsSyncRunning: running(settingsSync.transport),
        uploadPending: !!(upload.autoUpload && upload.autoUpload.pending),
      };
    };
    // Settle: boundedly wait until every transport is idle and nothing is pending
    const deadline = Date.now() + 10000;
    let idle = await idleSnapshot();
    let settledAt = null;
    while (Date.now() < deadline) {
      const busy = idle.positionsRunning || idle.sharedPositionsRunning || idle.settingsSyncRunning || idle.uploadPending;
      if (!busy) { settledAt = Date.now(); break; }
      await sleep(500);
      idle = await idleSnapshot();
    }
    if (!settledAt) throw new Error('transports not idle within 10 s: ' + JSON.stringify(idle));
    const folderOffAt = Date.now();
    const wasEnabled = Services.prefs.getBoolPref(prefix + 'webdav.enabled');
    if (wasEnabled) Services.prefs.setBoolPref(prefix + 'webdav.enabled', false);
    // Confirm the folder switch took effect before any other write
    let folderFalse = false;
    for (let i = 0; i < 20 && !folderFalse; i++) {
      await sleep(250);
      const after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const after2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      folderFalse = after.folder === false && after2.folder === false;
    }
    if (!folderFalse) throw new Error('folder switch did not confirm false; not muting');
    state.webdavFolderOff = wasEnabled;
    // Isolated — now mute. Verify the ORIGINAL snapshot (from 00) still matches the live
    // value AND flag, then write 0. Never replace the snapshot with a new baseline.
    const volName = prefix + 'readAloud.volume';
    const snap = state.prefs[volName];
    const liveValue = Services.prefs.getIntPref(volName);
    const liveFlag = Services.prefs.prefHasUserValue(volName);
    const snapshotMatches = liveValue === snap.value && liveFlag === !!snap.hasUser;
    if (!snapshotMatches) throw new Error('live volume no longer matches the 00 snapshot: ' + JSON.stringify({ liveValue, liveFlag, snap }));
    const mutedAt = Date.now();
    Services.prefs.setIntPref(volName, 0);
    const after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const after2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    return JSON.stringify({
      idleAt: settledAt, idle,
      folderOffAt, folderConfirmedFalseAt: folderFalse ? Date.now() : null,
      mutedAt,
      orderingOk: folderOffAt <= mutedAt && folderFalse,
      wasEnabled,
      before: { folder: true },
      after: { folder: after.folder, enabled: after.enabled },
      settingsSyncAfter: { folder: after2.folder, enabled: after2.enabled },
      isolated: after.folder === false && after2.folder === false,
      volumeSnapshotReused: { snapshot: snap, liveMatchedBeforeMute: snapshotMatches, volumeNow: Services.prefs.getIntPref(volName) },
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
