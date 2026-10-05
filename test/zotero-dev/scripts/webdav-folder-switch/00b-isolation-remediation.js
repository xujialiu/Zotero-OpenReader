// Remediation for the 2026-10-05 run: 00's relative-name pref writes went to
// stray root prefs, so the real switches were never suspended and the real
// URL never switched before the 1.16.7-beta install. Clears the strays,
// suspends the real switches, switches the real folder to the test URL, mutes
// the real volume — every read/write through the FULL pref name — and
// confirms. The private snapshot file (Services.prefs, full names) was
// correct throughout and holds the original state.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'isolation-remediation' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  try {
    // 1. The stray root prefs 00 created by mistake: exact names, cleared.
    out.strayCleared = {};
    for (const n of ['webdav.url', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings', 'readAloud.volume']) {
      try {
        out.strayCleared[n] = Services.prefs.prefHasUserValue(n)
          ? { had: true, cleared: (Services.prefs.clearUserPref(n), true) }
          : { had: false };
      } catch (e) { out.strayCleared[n] = { error: String(e) }; }
    }

    // 2. Suspend the REAL switches (full names).
    const switches = ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings'];
    out.suspended = {};
    for (const k of switches) {
      Zotero.Prefs.set(full(k), false, true);
      out.suspended[k] = Zotero.Prefs.get(full(k), true);
    }

    // 3. Mute the REAL volume.
    Zotero.Prefs.set(full('readAloud.volume'), 0, true);
    out.volumeNow = Zotero.Prefs.get(full('readAloud.volume'), true);

    // 4. Switch the REAL folder to the test URL and confirm the destination.
    const testUrl = state.testUrl;
    Zotero.Prefs.set(full('webdav.url'), testUrl, true);
    out.urlMatchesTestFile = Zotero.Prefs.get(full('webdav.url'), true) === testUrl;

    // 5. What the folder and switches read now, by the build's own settings loader.
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.diagnostics = {
      positionSync: { folder: pos.folder, enabled: pos.enabled },
      settingsUpload: { folder: up.folder, enabled: up.enabled },
      settingsSync: { folder: sy.folder, enabled: sy.enabled },
    };

    // 6. Settle: the startup sync (which ran over the owner's address as an
    // ordinary restart would) is long done; nothing new in flight.
    await Zotero.Promise.delay(1200);
    const pos2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.transports = {
      running: pos2.transport?.running ?? null,
      lastTrigger: pos2.transport?.lastTrigger ?? null,
      lastOutcome: pos2.transport?.lastOutcome ?? null,
    };
    out.ok = out.urlMatchesTestFile && out.suspended['webdav.syncPositions'] === false
      && out.suspended['webdav.syncSettings'] === false && out.suspended['webdav.autoUploadSettings'] === false
      && out.diagnostics.positionSync.folder === true && out.diagnostics.positionSync.enabled === false;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
