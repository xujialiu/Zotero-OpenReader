// Item 1 precondition + the WebDAV-first isolation, before the 1.16.7-beta install.
// Snapshot every pref of our branch verbatim to a private file under tmpDir
// (never printed, never committed), suspend the three sync/upload switches,
// mute, switch the folder to the test configuration, confirm the effective
// destination, and prove the two migration prefs hold no user value yet.
// Every read/write goes through the FULL pref name: a relative name with the
// second argument true is treated as a global key and silently misses
// (the 2026-10-05 run's first version got this wrong; see the README limits).
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'pre-install-isolation', checks: {} };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const has = (k) => Zotero.Prefs.prefHasUserValue(full(k), true);
  const set = (k, v) => Zotero.Prefs.set(full(k), v, true);
  const secret = (k) => /password|apiKey|apiToken|accountId|headers/i.test(k);
  const mask = (k, v) => (secret(k) ? `<${String(v ?? '').length} chars>` : v);
  try {
    // 1. The test URL from the secrets file (value never returns).
    const testUrl = (await IOUtils.readUTF8(P.secretsFile)).trim();
    state.testUrl = testUrl;
    out.checks.testUrlLength = testUrl.length;
    out.checks.testUrlIsHttps = testUrl.startsWith('https://');

    // 2. Verbatim snapshot of our whole pref branch to the private file.
    const branch = 'extensions.zotero.zotero-tts.';
    const names = Services.prefs.getChildList(branch).filter((n) => !n.endsWith(branch));
    const snap = {};
    for (const n of names) {
      try {
        if (!Services.prefs.prefHasUserValue(n)) continue; // defaults re-declared by the build
        const type = Services.prefs.getPrefType(n);
        snap[n] = {
          type,
          value: type === 32 ? Services.prefs.getStringPref(n) : type === 64 ? Services.prefs.getIntPref(n) : Services.prefs.getBoolPref(n),
        };
      } catch (e) { snap[n] = { error: String(e) }; }
    }
    await IOUtils.makeDirectory(P.tmpDir, { ignoreExisting: true, createAncestors: true });
    await IOUtils.writeUTF8(P.tmpDir + '/prefs-snapshot.json', JSON.stringify({ at: new Date().toISOString(), prefs: snap }, null, 1));
    out.checks.snapshotKeys = Object.keys(snap).length;
    out.checks.snapshotSecretKeys = Object.keys(snap).filter(secret).length;
    state.snapshotFile = P.tmpDir + '/prefs-snapshot.json';

    // 3. The named state this case touches, by name, for the report.
    const named = {};
    for (const k of ['webdav.url', 'webdav.username', 'webdav.password', 'webdav.enabled', 'webdav.enabledMigrated',
      'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings', 'readAloud.volume', 'readAloud.memory']) {
      named[k] = { set: has(k), value: mask(k, get(k)) };
    }
    out.namedBefore = named;
    state.settingsWindowOpenAtStart = !!Services.wm.getMostRecentWindow('zotero:pref');

    // 4. Suspend the three switches, mute, point the folder at the test URL.
    for (const k of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) set(k, false);
    const volPref = 'readAloud.volume';
    state.volumeBefore = { set: has(volPref), value: get(volPref) };
    set(volPref, 0);
    state.urlBefore = { set: has('webdav.url'), value: mask('webdav.url', get('webdav.url')) };
    set('webdav.url', testUrl);

    // 5. Confirm the effective destination matches the file (boolean only).
    out.checks.urlMatchesTestFile = get('webdav.url') === testUrl;

    // 6. Debug store on for the run (restore at cleanup if we turned it on).
    state.debugStoringAtStart = Zotero.Debug.storing;
    if (!state.debugStoringAtStart) Zotero.Debug.setStore(true);
    const debugNow = await Zotero.Debug.get();
    state.migrationLineCountBefore = (debugNow.match(/the WebDAV folder is on: its address was already set/g) || []).length;
    out.checks.migrationLinesBefore = state.migrationLineCountBefore;

    // 7. The migration prefs must hold no user value before the install.
    out.checks.enabledHasUserValue = has('webdav.enabled');
    out.checks.enabledMigratedHasUserValue = has('webdav.enabledMigrated');

    // 8. Readers and their Read Aloud state (user tabs left alone).
    out.readers = (Zotero.Reader._readers ?? []).map((r, i) => {
      const m = r._internalReader?._readAloudManager;
      const item = Zotero.Items.get(r.itemID);
      return { index: i, title: (item?.parentItem ?? item)?.getField('title') ?? null, active: !!m?.active, paused: !!m?.paused };
    });

    // 9. Settle: any transport in flight finishes (pre-upgrade diagnostics, no folder field yet).
    await Zotero.Promise.delay(1200);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.transportsAfterSuspend = {
      positions: { running: pos.transport?.running ?? null, lastTrigger: pos.transport?.lastTrigger ?? null },
      shared: { running: pos.shared?.transport?.running ?? null },
      autoUpload: { pending: up.autoUpload?.pending ?? null },
      settingsSync: { running: sy.transport?.running ?? null },
    };
    out.checks.allQuiet = !out.transportsAfterSuspend.positions.running && !out.transportsAfterSuspend.settingsSync.running
      && !out.transportsAfterSuspend.shared.running;
    out.ok = out.checks.urlMatchesTestFile && !out.checks.enabledHasUserValue && !out.checks.enabledMigratedHasUserValue;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
