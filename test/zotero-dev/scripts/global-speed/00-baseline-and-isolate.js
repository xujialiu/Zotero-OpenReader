// Issue #82 run, baseline and isolation (2026-09-29, runs on the OLD build 1.16.2-beta7).
// Snapshots every pref this case may touch (with user flags), mutes readAloud.volume,
// verifies the test WebDAV destination from ~/.secrets/Zotero-TTS/test_webdav.txt,
// suspends the three sync switches, settles pending writes, and minimizes the host.
// Secret-valued prefs are reported as presence/length only.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const read = name => {
    const key = name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
    const type = p.getPrefType(key);
    const hasUser = p.prefHasUserValue(key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    return { key, type, hasUser, value };
  };
  const names = [
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.memory', 'readAloud.speedPercent', 'globalSpeedMigrated', 'readAloud.globalSpeed',
    'readAloud.sameForAllDocuments', 'readAloud.volume', 'shortcuts.speedUp', 'reader.readAloudVoices',
  ];
  const baseline = {};
  for (const name of names) baseline[name] = read(name);
  // What the report may show: the memory's speed field (not a secret) and voice id only when ::-bearing
  let memorySpeed = null, memoryVoice = null;
  try {
    const parsed = JSON.parse(String(baseline['readAloud.memory'].value ?? '{}'));
    memorySpeed = typeof parsed.speed === 'number' ? parsed.speed : null;
    const voice = parsed.voice?.id ?? null;
    if (typeof voice === 'string' && voice.includes('::')) memoryVoice = voice;
    else if (voice) memoryVoice = 'unsafe:' + String(voice).length + 'chars';
  } catch (e) {}

  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params;

  // Test WebDAV: read the dedicated destination, prove the effective URL matches
  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (e) { throw new Error('test WebDAV config unavailable'); }
  if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };

  // OpenReader Position: record presence; absent here means nothing to switch
  let positionAddons = [];
  try {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addons = await AddonManager.getAllAddons();
    for (let i = 0; i < addons.length; i++) {
      const addon = addons[i];
      const haystack = (String(addon.id || '') + ' ' + String(addon.name || '')).toLowerCase();
      if (haystack.includes('openreader') || haystack.includes('open reader')) {
        positionAddons.push({ id: addon.id, name: addon.name, version: addon.version, active: !!addon.isActive });
      }
    }
  } catch (e) { throw new Error('OpenReader Position presence check failed: ' + String(e)); }

  const d = Zotero.ZoteroTTS?.diagnostics;
  const settled = d ? await waitFor(async () => {
    try {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(await d.positionSync());
      const settings = JSON.parse(await d.settingsSync());
      const upload = JSON.parse(await d.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && settings.transport?.pendingChange === false && settings.transport?.running === false
        && upload.autoUpload?.pending === false;
    } catch (e) { return false; }
  }) : 'no diagnostics';
  if (settled !== true) throw new Error('WebDAV transports did not settle before isolation: ' + JSON.stringify(settled));

  // Suspend automatic sync/backup, then switch Zotero-TTS to the test destination
  for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + name, false);
  p.setStringPref(prefix + 'webdav.url', configText);
  const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');

  // Mute before anything can start playback; the original value and user flag are restored at cleanup
  state.volumeBefore = { value: baseline['readAloud.volume'].value, hasUser: baseline['readAloud.volume'].hasUser };
  p.setIntPref(prefix + 'readAloud.volume', 0);

  // Host window: snapshot, then minimize for the bridge-only work
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host ? {
    windowState: host.windowState, screenX: host.screenX, screenY: host.screenY,
    outerWidth: host.outerWidth, outerHeight: host.outerHeight,
    selectedTab: host.Zotero_Tabs?.selectedID ?? null,
  } : null;
  if (host?.minimize) host.minimize();
  else if (host) host.windowState = host.STATE_MINIMIZED;
  await sleep(700);

  const readersBefore = [];
  for (const reader of Zotero.Reader?._readers || []) {
    if (!reader) continue;
    const manager = reader._internalReader?._readAloudManager;
    const item = Zotero.Items.get(reader.itemID);
    readersBefore.push({
      itemID: reader.itemID,
      title: (item?.parentItem ?? item)?.getField?.('title') ?? null,
      active: !!manager?.active, paused: manager ? !!manager.paused : null,
      popupOpen: !!reader._internalReader?.popupOpen,
    });
  }
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  let errorsBefore = [];
  try { errorsBefore = (Zotero.getErrors() ?? []).slice(0, 30); } catch (e) {}

  state.baseline = baseline;
  state.hostBefore = hostBefore;
  state.readersBefore = readersBefore;
  state.errorsBefore = errorsBefore;
  state.openReaderPosition = positionAddons;
  state.memoryVoiceSafe = typeof memoryVoice === 'string' && memoryVoice.includes('::');
  state.debugStoringBefore = !!Zotero.Debug?.storing;
  if (!state.debugStoringBefore) { try { Zotero.Debug.setStore(true); } catch (e) {} }

  return JSON.stringify({
    zoteroVersion: Services.appinfo.version + ' / ' + (Zotero.version ?? '?'),
    oldBuildState: {
      speedPercent: { value: baseline['readAloud.speedPercent'].value, user: baseline['readAloud.speedPercent'].hasUser },
      globalSpeedMigrated: { value: baseline['globalSpeedMigrated'].value, user: baseline['globalSpeedMigrated'].hasUser },
      memorySpeed: memorySpeed,
      memoryVoice: memoryVoice ?? 'none',
      globalSpeed: baseline['readAloud.globalSpeed'].value,
      sameForAllDocuments: baseline['readAloud.sameForAllDocuments'].value,
      speedUpShortcut: baseline['shortcuts.speedUp'].value,
    },
    volumeBefore: state.volumeBefore,
    webdav: {
      switches: { positions: baseline['webdav.syncPositions'].value, autoUpload: baseline['webdav.autoUploadSettings'].value, settings: baseline['webdav.syncSettings'].value },
      destinationMatched, urlChars: String(baseline['webdav.url'].value ?? '').length,
      configChars: configText.length,
      syncStateUser: baseline['webdav.syncState'].hasUser,
      syncStateChars: String(baseline['webdav.syncState'].value ?? '').length,
    },
    openReaderPositionPlugin: positionAddons.length ? positionAddons : 'absent',
    readersBefore, settingsWindowOpen: !!prefWin,
    errorsBeforeCount: errorsBefore.length,
    debugStoringBefore: state.debugStoringBefore,
    hostMinimized: host ? host.windowState === 2 : null,
  });
})()
