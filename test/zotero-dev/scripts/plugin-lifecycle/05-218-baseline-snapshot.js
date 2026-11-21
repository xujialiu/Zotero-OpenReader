return (() => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const read = (k) => {
    const full = prefix + k;
    return { value: Zotero.Prefs.get(full, true), user: Services.prefs.prefHasUserValue(full) };
  };
  const mem = read('readAloud.memory');
  const def = read('readAloud.defaultVoice');
  const b = Zotero.Items.get(state.fixtureB?.itemID);
  if (!b?.key) throw new Error('fixture B item key missing');
  const docKey = `user/${b.key}`;
  const docPref = prefix + 'documentVoices.' + docKey;
  let docRaw = null;
  try {
    docRaw = Services.prefs.getStringPref(docPref, null);
  } catch {}
  let docRecord = null;
  try {
    docRecord = JSON.parse(docRaw);
  } catch {}
  const nativeKey = 'extensions.zotero.reader.readAloudVoices';
  let nativeRaw = null;
  try {
    nativeRaw = Services.prefs.getStringPref(nativeKey, null);
  } catch {}
  let memory = null,
    defaultVoice = null;
  try {
    const m = JSON.parse(mem.value || '{}');
    memory = { voice: m.voice?.id ?? null, lang: m.voice?.lang ?? null };
  } catch {}
  try {
    const d = JSON.parse(def.value || '{}');
    defaultVoice = { voice: d.id ?? null, lang: d.lang ?? null };
  } catch {}
  const readers = [];
  for (let i = 0; i < (Zotero.Reader?._readers ?? []).length; i++) {
    const r = Zotero.Reader._readers[i];
    try {
      const it = Zotero.Items.get(r.itemID);
      const p = it?.parentItem ? Zotero.Items.get(it.parentItem) : it;
      readers.push({
        index: i,
        itemID: r.itemID,
        title: p?.getField('title') ?? null,
        selected: Zotero.getMainWindow()?.Zotero_Tabs?.selectedID === r.tabID,
        gone: Components.utils.isDeadWrapper(r._internalReader) || Components.utils.isDeadWrapper(r._iframeWindow),
      });
    } catch (e) {
      readers.push({ index: i, gone: true });
    }
  }
  const enabled = Object.fromEntries(
    [
      'openai-official',
      'mimo',
      'compatible',
      'azure',
      'cloudflare',
      'speechify',
      'fish',
      'fishspeech',
      'local',
      'system',
      'zotero-standard',
      'zotero-premium',
    ].map((id) => [id, Zotero.Prefs.get(prefix + id + '.enabled', true)]),
  );
  const win = Zotero.getMainWindow();
  const snap = {
    prefs: {
      webdav: read('webdav.enabled'),
      cacheAudio: read('cacheAudio'),
      fishEnabled: read('fishspeech.enabled'),
      fishURL: read('fishspeech.baseURL'),
      fishHeaders: read('fishspeech.headers'),
      volume: read('readAloud.volume'),
      memory: mem,
      defaultVoice: def,
      speed: read('readAloud.speedPercent'),
      globalSpeed: read('readAloud.globalSpeed'),
      enabled,
    },
    documentVoice: { key: docKey, pref: docPref, value: docRaw, user: Services.prefs.prefHasUserValue(docPref) },
    nativeVoices: { key: nativeKey, value: nativeRaw, user: Services.prefs.prefHasUserValue(nativeKey) },
    debugStoring: !!Zotero.Debug?.storing,
    window: {
      state: win?.windowState ?? null,
      bounds: win ? { x: win.screenX, y: win.screenY, w: win.outerWidth, h: win.outerHeight } : null,
      selected: win?.Zotero_Tabs?.selectedID ?? null,
    },
    readers,
    settingsWindow: !!Services.wm.getMostRecentWindow('zotero:pref'),
  };
  if (!state.beta3Baseline) state.beta3Baseline = snap;
  const position = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync());
  return JSON.stringify({
    savedFirst: !state.beta3Baseline || state.beta3Baseline === snap,
    pluginVersion: JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()).version,
    webdav: { value: snap.prefs.webdav.value, user: snap.prefs.webdav.user },
    positionFolder: position.folder,
    cacheAudio: snap.prefs.cacheAudio,
    fishspeech: {
      enabled: snap.prefs.fishEnabled.value,
      enabledUser: snap.prefs.fishEnabled.user,
      addressA: snap.prefs.fishURL.value === 'http://127.0.0.1:63670',
      addressUser: snap.prefs.fishURL.user,
      headersLength: String(snap.prefs.fishHeaders.value ?? '').length,
      headersUser: snap.prefs.fishHeaders.user,
    },
    volume: snap.prefs.volume,
    memory,
    defaultVoice,
    nativeVoiceUser: snap.nativeVoices.user,
    documentVoice: {
      key: docKey,
      record: docRecord
        ? {
            voice: docRecord.voice?.id ?? null,
            lang: docRecord.voice?.lang ?? null,
            manual: docRecord.manual,
            ts: docRecord.ts,
          }
        : null,
      user: snap.documentVoice.user,
    },
    enabled,
    debugStoring: snap.debugStoring,
    window: snap.window,
    readers,
    settingsWindow: snap.settingsWindow,
  });
})();
