// Fresh verification of #195/#208 on 1.17.3-beta (candidate 4682892).
// Snapshots the named prefs this brief may touch, settles the plugin's
// WebDAV settings transports, confirms the folder switch off, records the
// reader/player state, mutes, enables the debug store, and minimizes the
// host. Secret-valued prefs are retained verbatim in run state but reported
// only by presence and length.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const names = [
    'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.memory',
    'readAloud.defaultVoice', 'readAloud.sameForAllDocuments', 'readAloud.volume',
    'webdav.enabled', 'webdav.autoUploadSettings', 'webdav.syncPositions',
    'webdav.syncSettings', 'highlight.sentence', 'highlight.word',
    'reader.readAloudVoices', 'system.enabled', 'documentVoices.user/',
  ];
  const full = (name) => name === 'reader.readAloudVoices'
    ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
  const read = (name) => {
    const key = full(name);
    const type = p.getPrefType(key);
    const user = p.prefHasUserValue(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch (e) { value = null; }
    return { name, key, type, user, value };
  };

  const raw = {};
  const shown = {};
  for (const name of names) {
    if (name === 'documentVoices.user/') continue;
    raw[name] = read(name);
    const secret = name === 'readAloud.memory' || name === 'reader.readAloudVoices' || name === 'readAloud.defaultVoice';
    shown[name] = secret
      ? { user: raw[name].user, valueChars: typeof raw[name].value === 'string' ? raw[name].value.length : null }
      : { user: raw[name].user, value: raw[name].value };
  }
  const documentVoiceRecords = {};
  try {
    const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    for (const [key, value] of Object.entries(parsed.records ?? {})) documentVoiceRecords[key] = value;
  } catch (e) {}
  if (Zotero.ZoteroTTSRun.state.fix4Prefs) {
    throw new Error('retained baseline exists; refusing to replace it on a resumed run');
  }
  Zotero.ZoteroTTSRun.state.fix4Prefs = raw;
  Zotero.ZoteroTTSRun.state.fix4DocumentVoiceRecords = documentVoiceRecords;

  const diag = Zotero.ZoteroTTS.diagnostics;
  const readTransports = async () => {
    const settings = JSON.parse(await diag.settingsSync());
    const upload = JSON.parse(await diag.settingsUpload());
    return {
      settingsRunning: settings.transport?.running ?? null,
      settingsPending: settings.transport?.pendingChange ?? null,
      uploadPending: upload.autoUpload?.pending ?? null,
    };
  };
  let t1 = await readTransports();
  const idle = (t) => t.settingsRunning === false && t.settingsPending === false && t.uploadPending === false;
  for (let i = 0; i < 40 && !idle(t1); i++) { await sleep(250); t1 = await readTransports(); }
  if (!idle(t1)) throw new Error('settings transports did not settle before isolation: ' + JSON.stringify(t1));

  const folderKey = prefix + 'webdav.enabled';
  if (p.getBoolPref(folderKey)) p.setBoolPref(folderKey, false);
  await sleep(500);
  const folder = JSON.parse(await diag.positionSync()).folder;
  if (folder !== false) throw new Error('folder switch is still on: ' + JSON.stringify(folder));

  const readersBefore = (Zotero.Reader._readers ?? []).map((reader) => {
    const manager = reader?._internalReader?._readAloudManager;
    let title = null;
    try {
      const item = Zotero.Items.get(reader.itemID);
      title = item?.parentItem?.getField('title') || item?.getField('title') || null;
    } catch (e) {}
    return {
      itemID: reader.itemID, tabID: reader.tabID, title,
      active: !!manager?.active, paused: manager ? !!manager.paused : null,
      popupOpen: !!reader?._internalReader?._state?.readAloudState?.popupOpen,
      voice: manager?.selectedVoiceID ?? null,
    };
  });

  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host ? {
    windowState: host.windowState, screenX: host.screenX, screenY: host.screenY,
    outerWidth: host.outerWidth, outerHeight: host.outerHeight,
    selectedTabID: host.Zotero_Tabs?.selectedID ?? null,
  } : null;
  Zotero.ZoteroTTSRun.state.fix4Host = hostBefore;
  Zotero.ZoteroTTSRun.state.fix4DebugStoring = !!Zotero.Debug.storing;

  const volumeKey = prefix + 'readAloud.volume';
  p.setIntPref(volumeKey, 0);

  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  if (host && host.windowState !== 2) host.minimize();
  await sleep(500);

  return JSON.stringify({
    zotero: Zotero.version,
    prefBaseline: shown,
    documentVoiceRecordsBefore: Object.keys(documentVoiceRecords),
    transports: t1,
    folderNow: folder,
    readersBefore,
    hostBefore,
    hostNow: host ? host.windowState : null,
    debugStoringNow: Zotero.Debug.storing,
    volumeNow: p.getIntPref(volumeKey, null),
  }, null, 1);
})()
