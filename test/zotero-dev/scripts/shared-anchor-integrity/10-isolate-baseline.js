// WebDAV-first isolation + baseline, before the 1.17.1-beta4 install (#234 run).
// About-WebDAV rule: this IS a Positions File test, so suspend all four
// transports (positions + shared under syncPositions, settings sync, settings
// auto-upload), settle them, switch the destination to the dedicated test
// configuration (~/.secrets/Zotero-TTS/test_webdav.txt) and confirm by match
// only. Named prefs snapshotted raw into state (never returned raw), volume
// muted, debug store on, host minimized, reader/row baselines recorded.
// Every pref read/write uses the FULL name through Services.prefs.
(async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, P = run.params;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'isolate-baseline' };
  const names = [
    'webdav.enabled', 'webdav.enabledMigrated', 'webdav.url', 'webdav.username', 'webdav.password',
    'webdav.machineId', 'webdav.syncState', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice', 'reader.readAloudVoices', 'documentVoiceChanged',
  ];
  const full = (name) => (name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name);
  const get = (name) => {
    const key = full(name), type = p.getPrefType(key), user = p.prefHasUserValue(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch {}
    return { key, type, user, value };
  };
  const secret = (name) => /password|username|apiKey|apiToken|machineId/i.test(name);
  const baseline = {}, masked = {};
  for (const name of names) {
    baseline[name] = get(name);
    masked[name] = secret(name)
      ? { user: baseline[name].user, set: typeof baseline[name].value === 'string' && baseline[name].value.length > 0, chars: typeof baseline[name].value === 'string' ? baseline[name].value.length : null }
      : { user: baseline[name].user, value: baseline[name].value };
  }
  state.baselinePrefs = baseline;
  const docPrefix = prefix + 'documentVoices.';
  state.documentVoicesBefore = Object.fromEntries(p.getBranch(docPrefix).getChildList('').sort().map(name => [name, {
    value: p.getStringPref(docPrefix + name), user: p.prefHasUserValue(docPrefix + name),
  }]));
  state.expectedVersion = P.expectedVersion;
  state.expectedBundleSha = P.expectedBundleSha;
  state.cleanupVerified = false;
  state.teardownVerified = false;
  // Return only presence/flags, never URLs or persisted preference contents.
  out.snapshotNames = Object.keys(baseline);

  try {
    if (typeof P.expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(P.expectedBundleSha || '')) throw new Error('explicit build version/hash required');
    // 1. The test URL (never returned).
    const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
    const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
    const configText = (await IOUtils.readUTF8(configPath)).trim();
    if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');
    state.testUrl = configText;
    out.testConfig = { chars: configText.length, isHttp: configText.startsWith('http://') };

    // 2. Settle all four transports before touching anything.
    const d = Zotero.ZoteroTTS?.diagnostics;
    const waitFor = async (fn, ms = 20000, step = 300) => {
      const end = Date.now() + ms; let last = null;
      while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(step); }
      return last;
    };
    const settled = d ? await waitFor(async () => {
      try {
        const position = JSON.parse(await d.position());
        const sync = JSON.parse(await d.positionSync());
        const settings = JSON.parse(await d.settingsSync());
        const upload = JSON.parse(await d.settingsUpload());
        return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
          && sync.transport?.running === false && sync.shared?.transport?.running === false
          && settings.transport?.pendingChange === false && settings.transport?.running === false
          && upload.autoUpload?.pending === false;
      } catch { return false; }
    }) : null;
    if (settled !== true) throw new Error('the four transports did not settle before isolation');

    // 3. Close the folder gate before changing any other setting.
    p.setBoolPref(prefix + 'webdav.enabled', false);
    if (JSON.parse(await d.positionSync()).folder !== false) throw new Error('folder did not suspend');
    // Suspend the three switches (all four transports), mute, switch destination.
    for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + name, false);
    state.volumeBefore = { user: baseline['readAloud.volume'].user, value: baseline['readAloud.volume'].value };
    if (p.getPrefType(prefix + 'readAloud.volume') === p.PREF_INT) p.setIntPref(prefix + 'readAloud.volume', 0);
    p.setStringPref(prefix + 'webdav.url', configText);
    const trimSlash = (v) => { let o = String(v); while (o.endsWith('/')) o = o.slice(0, -1); return o; };
    out.destinationMatchesTestFile = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
    if (!out.destinationMatchesTestFile) throw new Error('test WebDAV destination did not take effect');

    // 4. Baseline counts (rows snapshot + file snapshot are the next scripts).
    const position = JSON.parse(await d.position());
    const sync = JSON.parse(await d.positionSync());
    state.rowsBeforeCounts = {
      databaseRows: position.database?.rows ?? null,
      localEntries: sync.localEntries ?? null,
      tombstones: sync.tombstones ?? null,
      documents: sync.shared?.documents?.documents ?? null,
      sharedItems: sync.shared?.documents?.items ?? null,
    };
    out.baseline = state.rowsBeforeCounts;
    out.transportsAfterSuspend = {
      positions: { enabled: sync.enabled, running: sync.transport?.running ?? null },
      shared: { running: sync.shared?.transport?.running ?? null },
      settingsSync: JSON.parse(await d.settingsSync()).transport?.running ?? null,
      autoUpload: JSON.parse(await d.settingsUpload()).autoUpload?.pending ?? null,
    };

    // 5. Readers now (the user's tabs are left alone) + settings window.
    out.readers = (Zotero.Reader._readers ?? []).map((r) => {
      const m = r?._internalReader?._readAloudManager;
      let title = null;
      try { const item = Zotero.Items.get(r.itemID); title = (item?.parentItem ?? item)?.getField('title') ?? null; } catch {}
      return { itemID: r.itemID, tabID: r.tabID, title, active: !!m?.active, paused: !!m?.paused };
    });
    state.baselineTabs = out.readers;
    state.settingsWindowOpenAtStart = !!Services.wm.getMostRecentWindow('zotero:pref');
    out.settingsWindowOpen = state.settingsWindowOpenAtStart;

    // 6. Debug store on for the run.
    state.debugStoringAtStart = !!Zotero.Debug?.storing;
    if (!state.debugStoringAtStart) { try { Zotero.Debug.setStore(true); } catch {} }

    // 7. Host minimized for bridge-only work (bounds snapshotted for cleanup).
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    state.host = host ? {
      windowState: host.windowState,
      bounds: { x: host.screenX, y: host.screenY, width: host.outerWidth, height: host.outerHeight },
      selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    } : null;
    if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }
    await sleep(500);
    out.hostMinimized = host ? host.windowState === 2 : null;

    // 8. No earlier item of this run's fixture title may exist.
    try {
      const fieldID = await Zotero.DB.valueQueryAsync('SELECT fieldID FROM fieldsCombined WHERE fieldName=?', ['title']);
      out.existingFixtureItems = Number(await Zotero.DB.valueQueryAsync(
        'SELECT COUNT(*) FROM itemData JOIN itemDataValues USING (valueID) WHERE fieldID=? AND value=?', [fieldID, P.fixtureTitle]));
    } catch (e) { out.existingFixtureItems = 'unavailable: ' + String(e); }
    out.ok = out.destinationMatchesTestFile;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
