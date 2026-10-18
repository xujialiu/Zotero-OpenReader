// Baseline + test-WebDAV isolation (about-WebDAV rule): named prefs snapshotted
// privately (raw copies kept in state for cleanup, never returned), transports
// settled, sync/backup suspended, destination switched to the test file and
// confirmed by match/no-match only, volume muted, debug store on, host
// minimized, baseline counts recorded. Values of secrets and URLs never return.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 15000, step = 150) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(step); }
    return last;
  };
  const names = [
    'webdav.enabled', 'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice',
    'reader.readAloudVoices',
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
  const baseline = {}, raw = {};
  for (const name of names) { baseline[name] = get(name); raw[name] = get(name); }
  state.baseline = { prefs: raw, closedOwners: [], selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null };
  const masked = {};
  for (const name of names) {
    const b = baseline[name];
    masked[name] = (name === 'webdav.password' || name === 'webdav.username')
      ? { user: b.user, set: typeof b.value === 'string' && b.value.length > 0, chars: typeof b.value === 'string' ? b.value.length : null }
      : { user: b.user, value: b.value };
  }

  // --- Test WebDAV first: settle, suspend, switch destination. ---
  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (e) {
    throw new Error('test WebDAV config unavailable at ~/.secrets/Zotero-TTS/test_webdav.txt');
  }
  if (!(configText.startsWith('http://') || configText.startsWith('https://'))) {
    throw new Error('test WebDAV config is not an URL');
  }
  state.testUrl = configText;
  const d = Zotero.ZoteroTTS?.diagnostics;
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
    } catch (e) { return false; }
  }) : null;
  if (settled !== true) throw new Error('WebDAV transports did not settle before isolation');

  for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) {
    p.setBoolPref(prefix + name, false);
  }
  const urlBeforeTestSwitch = raw['webdav.url'];
  p.setStringPref(prefix + 'webdav.url', configText);
  const trimSlash = (v) => { let o = String(v); while (o.endsWith('/')) o = o.slice(0, -1); return o; };
  const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');
  state.testWebdav = { destinationMatched, testUrlChars: configText.length, ownerUrlWasTestConfig: trimSlash(String(urlBeforeTestSwitch.value ?? '')) === trimSlash(configText), ownerUrlChars: String(urlBeforeTestSwitch.value ?? '').length };

  // --- Baseline counts (rows snapshot is script 02's, before any change). ---
  let position = null, sync0 = null;
  try {
    position = JSON.parse(await d.position());
    sync0 = JSON.parse(await d.positionSync());
  } catch (e) { throw new Error('diagnostics unreadable before the run: ' + String(e)); }
  state.rowsBeforeCounts = {
    databaseRows: position.database?.rows ?? null,
    localEntries: sync0.localEntries ?? null,
    tombstones: sync0.tombstones ?? null,
    documents: sync0.shared?.documents?.documents ?? null,
    sharedItems: sync0.shared?.documents?.items ?? null,
  };

  // --- Owner players: only closed when a check needs it gone; none expected. ---
  for (const reader of Zotero.Reader._readers || []) {
    const ir = reader?._internalReader, m = ir?._readAloudManager;
    if (!ir || !m?.active) continue;
    let title = null;
    try { const item = Zotero.Items.get(reader.itemID); title = item?.parentItem?.title || item?.getField?.('title') || null; } catch {}
    const before = { itemID: reader.itemID, tabID: reader.tabID, title, paused: !!m.paused };
    try { ir.toggleReadAloudPopup(false); } catch (e) { throw new Error('could not close owner player: ' + String(e)); }
    await sleep(250);
    if (m.active) throw new Error('owner player remained active after close: ' + JSON.stringify(before));
    state.baseline.closedOwners.push(before);
  }

  // --- Mute before anything can start playback. ---
  const volumeKey = prefix + 'readAloud.volume';
  state.volumeBefore = { value: raw['readAloud.volume'].value, user: raw['readAloud.volume'].user };
  if (p.getPrefType(volumeKey) === p.PREF_INT && p.getIntPref(volumeKey) !== 0) p.setIntPref(volumeKey, 0);

  // --- Debug store on for the run; host minimized for bridge-only work. ---
  state.debugStoring = !!Zotero.Debug?.storing;
  if (!state.debugStoring) { try { Zotero.Debug.setStore(true); } catch {} }
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  state.host = host ? {
    windowState: host.windowState,
    bounds: { x: host.screenX, y: host.screenY, width: host.outerWidth, height: host.outerHeight },
    selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
  } : null;
  if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }
  await sleep(500);

  const readersBefore = [];
  for (const reader of Zotero.Reader._readers || []) {
    const m = reader?._internalReader?._readAloudManager;
    let title = null;
    try { const item = Zotero.Items.get(reader.itemID); title = item?.parentItem?.title || item?.getField?.('title') || null; } catch {}
    readersBefore.push({ itemID: reader.itemID, title, active: !!m?.active, paused: m ? !!m.paused : null });
  }
  const settingsWin = Services.wm.getMostRecentWindow('zotero:pref');
  return JSON.stringify({
    status: 'PASS', phase: 'isolation and baseline (before install)',
    zotero: Zotero.version ?? null,
    webdav: state.testWebdav,
    ownerPrefsMasked: { webdavEnabled: masked['webdav.enabled'], syncPositions: masked['webdav.syncPositions'], syncSettings: masked['webdav.syncSettings'], autoUploadSettings: masked['webdav.autoUploadSettings'], volume: masked['readAloud.volume'], defaultVoiceUser: masked['readAloud.defaultVoice'].user, memoryUser: masked['readAloud.memory'].user },
    transportsSettled: true,
    syncSuspended: ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings'].map((n) => ({ n, v: !!p.getBoolPref(prefix + n) === false })),
    baseline: state.rowsBeforeCounts,
    closedOwnerPlayers: state.baseline.closedOwners,
    readersBefore, volumeBefore: state.volumeBefore,
    debugStoring: !!Zotero.Debug?.storing,
    hostMinimized: host ? host.windowState === 2 : null,
    settingsWindowWasOpen: !!settingsWin,
    prefNames: names.length,
  }, null, 1);
})()
