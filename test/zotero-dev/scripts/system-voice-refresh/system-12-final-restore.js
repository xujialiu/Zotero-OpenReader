// system-voice-refresh 12: final restoration (#241 item 6, part 2). Close the settings
// window first (its bindings can flush over a restore), then restore every named pref
// with its exact effective value and user-value flag — including system.enabled, which
// the Enable-path check (10) really does toggle — volume and memory BEFORE WebDAV,
// memory the last user-value restore. Then boundedly settle the normal pending
// sync/upload work (plugin stats only, never a request to the owner's server), and
// AFTER that final recheck re-reads every named pref (value AND flag), the fixture
// row/entry absence, the selected tab and the minimized geometry. A settle or recheck
// failure is reported as a block, never folded into PASS.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setPrefExact = (name, snap) => {
    if (!snap) return 'no-snapshot';
    if (!snap.hasUser) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return 'cleared-to-default'; }
    if (snap.type === 'string') Services.prefs.setStringPref(name, snap.value == null ? '' : snap.value);
    else if (snap.type === 'int') Services.prefs.setIntPref(name, snap.value);
    else if (snap.type === 'bool') Services.prefs.setBoolPref(name, snap.value);
    return 'set';
  };
  const readNow = (name) => {
    const t = Services.prefs.getPrefType(name);
    if (t === Ci.nsIPrefBranch.PREF_STRING) return Services.prefs.getStringPref(name);
    if (t === Ci.nsIPrefBranch.PREF_INT) return Services.prefs.getIntPref(name);
    if (t === Ci.nsIPrefBranch.PREF_BOOL) return Services.prefs.getBoolPref(name);
    return null;
  };
  try {
    const out = {};
    // 1. Close the settings window, wait it down to null
    const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (prefWin) prefWin.close();
    for (let i = 0; i < 35 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(200);
    out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    // 2. The run's debug record, before the store goes off
    const debugText = await Zotero.Debug.get();
    const zttsLines = debugText.split('\n').filter((l) => /\[zotero-tts\]/.test(l)).map((l) => l.trim().slice(0, 170));
    out.zttsDebugLines = { count: zttsLines.length, first: zttsLines.slice(0, 3), last: zttsLines.slice(-8) };
    // 3. Restore the user-value prefs — volume and memory before WebDAV, memory last
    const userPrefs = [
      'extensions.zotero.reader.readAloudVoices',
      prefix + 'readAloud.favoriteVoices',
      prefix + 'readAloud.favoritesOnly',
      prefix + 'readAloud.defaultVoice',
      prefix + 'readAloud.volume',
      prefix + 'system.enabled',
      prefix + 'readAloud.memory', // LAST of the user-value restores (memory-sync observers)
    ];
    out.restores = {};
    for (const name of userPrefs) {
      setPrefExact(name, state.prefs[name]);
      out.restores[name] = state.prefs[name] ? (state.prefs[name].hasUser ? 'set' : 'cleared-to-default') : 'no-snapshot';
    }
    // 4. WebDAV switches back, only after every temporary user-value state is gone
    const webdavPrefs = [
      prefix + 'webdav.syncPositions',
      prefix + 'webdav.syncSettings',
      prefix + 'webdav.autoUploadSettings',
      prefix + 'webdav.enabled',
    ];
    for (const name of webdavPrefs) setPrefExact(name, state.prefs[name]);
    // 5. Bounded settle of the normal pending sync/upload the restores may have armed
    const stats = async () => {
      const posSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settingsSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return {
        positionsRunning: !!(posSync.transport && posSync.transport.running),
        sharedPositionsRunning: !!(posSync.shared && posSync.shared.transport && posSync.shared.transport.running),
        settingsSyncRunning: !!(settingsSync.transport && settingsSync.transport.running),
        uploadPending: !!(upload.autoUpload && upload.autoUpload.pending),
        raw: { positions: posSync.transport, shared: posSync.shared ? posSync.shared.transport : null, settings: settingsSync.transport, upload: upload.autoUpload },
      };
    };
    await sleep(2000); // let debounces arm
    let s = await stats();
    const settleDeadline = Date.now() + 20000;
    let settled = false;
    while (Date.now() < settleDeadline) {
      const busy = s.positionsRunning || s.sharedPositionsRunning || s.settingsSyncRunning || s.uploadPending;
      if (!busy) { settled = true; break; }
      await sleep(1000);
      s = await stats();
    }
    out.settle = {
      settled,
      waitedMs: Date.now() - (settleDeadline - 20000),
      finalStats: { positionsRunning: s.positionsRunning, sharedPositionsRunning: s.sharedPositionsRunning, settingsSyncRunning: s.settingsSyncRunning, uploadPending: s.uploadPending, uploads: s.raw.upload ? s.raw.upload.uploads : null, lastOutcome: s.raw.upload ? s.raw.upload.lastOutcome : null, uploadError: s.raw.upload ? s.raw.upload.lastError : null },
    };
    // 6. Window: minimize (the owner's default), then the FINAL post-last-write recheck
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    if (win && win.windowState !== 2 && win.minimize) win.minimize();
    await sleep(500);
    const verifyPref = (name) => {
      const snap = state.prefs[name];
      if (!snap) return { valueOk: null, flagOk: null, note: 'no-snapshot' };
      const flagNow = Services.prefs.prefHasUserValue(name);
      return { valueOk: readNow(name) === snap.value, flagOk: flagNow === !!snap.hasUser };
    };
    const recheck = {};
    for (const name of [...Object.keys(state.prefs)]) recheck[name.replace('extensions.zotero.', '')] = verifyPref(name);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    recheck._fixture = {
      itemGone: state.fixture ? !Zotero.Items.get(state.fixture.itemID) : null,
      docVoiceEntryGone: state.fixtureDocVoiceKey ? !Services.prefs.prefHasUserValue(state.fixtureDocVoiceKey) : null,
      docVoiceKeysMatchBaseline: JSON.stringify(Object.keys(docVoices.records || {}).sort()) === JSON.stringify(Object.keys(state.docVoicesBefore || {}).sort()),
      rows: pos.database ? pos.database.rows : null,
      rowsOk: (pos.database ? pos.database.rows : null) === state.rowsBaseline,
    };
    recheck._window = {
      windowState: win ? win.windowState : null, minimized: win ? win.windowState === 2 : null,
      selectedTab: win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null,
      selectedTabOk: state.selectedTabBefore ? (win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID === state.selectedTabBefore.selectedID : null) : null,
    };
    out.finalRecheck = recheck;
    out.recheckAllOk = Object.values(recheck).every((v) => Object.values(v).every((x) => x !== false));
    // 7. Errors since the run
    const errs = Zotero.getErrors();
    const beforeSet = new Set(state.errorsBefore ? state.errorsBefore.sample || [] : []);
    out.errors = { countBefore: state.errorsBefore ? state.errorsBefore.count : null, countNow: errs.length, newEntries: errs.filter((e) => !beforeSet.has(String(e).slice(0, 160))).map((e) => String(e).slice(0, 200)).slice(0, 6) };
    // 8. Debug store back to its pre-run state
    if (!state.debugStoringBefore) Zotero.Debug.setStore(false);
    out.debugStoringRestored = !!Zotero.Debug.storing === state.debugStoringBefore;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 500) });
  }
})()
