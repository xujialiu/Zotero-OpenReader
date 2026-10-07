// Reading guard runs, baseline and isolation (2026-09-30, run r45, before the xpi install).
// Verifies the test WebDAV destination from ~/.secrets/Zotero-TTS/test_webdav.txt for
// Zotero-TTS, suspends sync/backup and settles
// pending writes, snapshots the named prefs this case may touch (raw copy kept in
// state for 90-teardown), records any owner player (closed, never reopened), mutes
// readAloud.volume, turns the debug store on, and minimizes the host.
// Secret-valued prefs are reported as presence/length only, never a value.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (fn, ms = 12000, step = 150) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(step); }
    return last;
  };
  const names = [
    'local.enabled', 'local.baseURL', 'local.engine', 'local.voice', 'local.headers',
    'system.enabled',
    'fish.enabled', 'fish.freeOnly', 'fish.voices',
    'azure.enabled', 'speechify.enabled', 'cloudflare.enabled', 'fishspeech.enabled',
    'compatible.enabled', 'compatible.baseURL', 'mimo.enabled', 'openai-official.enabled',
    'zotero-standard.enabled', 'zotero-premium.enabled',
    'readAloud.memory', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.sameForAllDocuments',
    'readAloud.volume',
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'reader.readAloudVoices',
  ];
  const full = name => name === 'reader.readAloudVoices'
    ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
  const get = name => {
    const key = full(name), type = p.getPrefType(key), user = p.prefHasUserValue(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch {}
    return { key, type, user, value };
  };
  // 90-teardown masks these to presence/length in its audit; nothing raw is ever returned
  const baseline = {}, raw = {};
  for (const name of names) { baseline[name] = get(name); raw[name] = get(name); }
  state.baseline = { prefs: raw, closedOwners: [], selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null };

  // --- Test WebDAV first: settle transports, suspend sync/backup, switch destination. ---
  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (e) {
    throw new Error('test WebDAV config unavailable at ~/.secrets/Zotero-TTS/test_webdav.txt');
  }
  if (!(configText.startsWith('http://') || configText.startsWith('https://'))) {
    throw new Error('test WebDAV config is not an URL');
  }
  const d = Zotero.ZoteroTTS?.diagnostics;
  const settled = d ? await waitFor(async () => {
    try {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(await d.positionSync());
      const settings = JSON.parse(await d.settingsSync());
      const upload = JSON.parse(await d.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && settings.transport?.pendingChange === false
        && settings.transport?.running === false && upload.autoUpload?.pending === false;
    } catch (e) { return false; }
  }) : null;
  if (settled !== true) throw new Error('WebDAV transports did not settle before isolation');

  for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) {
    p.setBoolPref(prefix + name, false);
  }
  p.setStringPref(prefix + 'webdav.url', configText);
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };
  const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');
  state.testWebdav = { destinationMatched, urlChars: configText.length, originalUrlChars: String(raw['webdav.url'].value ?? '').length };

  // --- Position rows before the fixtures (teardown counts them back out). ---
  let positionRows = null;
  try { positionRows = JSON.parse(await d.position())?.database?.rows ?? null; } catch (e) { positionRows = 'unreadable'; }
  state.positionRowsBefore = positionRows;

  // --- Owner player: allowed to be closed when the guard checks need it; never reopened. ---
  for (const reader of Zotero.Reader._readers || []) {
    const ir = reader?._internalReader, m = ir?._readAloudManager;
    if (!ir || !m?.active) continue;
    let title = null;
    try { const item = Zotero.Items.get(reader.itemID); title = item?.parentItem?.title || item?.getField?.('title') || null; } catch {}
    const before = { itemID: reader.itemID, tabID: reader.tabID, title, paused: !!m.paused, voice: m.selectedVoiceID || null };
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
    readersBefore.push({ itemID: reader.itemID, title, active: !!m?.active, paused: m ? !!m.paused : null,
      popupOpen: !!reader?._internalReader?._state?.readAloudState?.popupOpen });
  }
  return JSON.stringify({
    status: 'PASS', phase: 'pre-install isolation and baseline',
    webdav: state.testWebdav,
    transportsSettled: true,
    syncSuspended: ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings'].map(n => ({ n, v: p.getBoolPref(prefix + n) })),
    positionRowsBefore: positionRows,
    closedOwnerPlayers: state.baseline.closedOwners,
    readersBefore, volumeBefore: state.volumeBefore,
    debugStoring: !!Zotero.Debug?.storing,
    hostMinimized: host ? host.windowState === 2 : null,
    prefNames: names.length,
  }, null, 1);
})()
