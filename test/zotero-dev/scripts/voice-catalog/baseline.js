(async () => {
  // Keep the named originals in the runner for cleanup. Catalog keeps the
  // Kokoro header value and user flag in its own local scope.
  const P = 'extensions.zotero.zotero-tts.';
  const params = Zotero.ZoteroTTSRun.params;
  const stubBase = params.stubBase || null;
  const read = (name) => {
    const full = name.startsWith('extensions.zotero.') ? name : P + name;
    try {
      const t = Services.prefs.getPrefType(full);
      if (t === 0) return { type: 'none', value: null, user: Services.prefs.prefHasUserValue(full) };
      const type = t === 32 ? 'string' : t === 64 ? 'int' : 'bool';
      const value = t === 32 ? Services.prefs.getStringPref(full) : t === 64 ? Services.prefs.getIntPref(full) : Services.prefs.getBoolPref(full);
      return { type, value, user: Services.prefs.prefHasUserValue(full) };
    } catch (e) { return { type: 'error', value: null, user: false, error: String(e) }; }
  };
  const names = [
    'local.enabled', 'local.baseURL', 'local.engine',
    'system.enabled', 'readAloud.memory', 'readAloud.defaultVoice',
    'readAloud.favoriteVoices', 'readAloud.favorites', 'readAloud.favoritesOnly',
    'readAloud.speedPercent', 'readAloud.globalSpeed', 'readAloud.sameForAllDocuments',
    'readAloud.volume', 'cacheAudio',
    // enabled provider discovery is part of the catalog under test; each
    // key is snapshotted by name and later restored byte-identically
    'fish.enabled', 'compatible.enabled',
  ];
  const snap = {};
  for (const n of names) snap[n] = read(n);
  snap['extensions.zotero.reader.readAloudVoices'] = read('extensions.zotero.reader.readAloudVoices');
  snap['extensions.zotero.zotero-tts.webdav.enabled'] = read('extensions.zotero.zotero-tts.webdav.enabled');
  const branch = Services.prefs.getBranch(P + 'documentVoices.');
  const docKeys = branch.getChildList('');
  const docSnap = {};
  for (const k of docKeys) docSnap[k] = { value: Services.prefs.getStringPref(P + 'documentVoices.' + k), user: Services.prefs.prefHasUserValue(P + 'documentVoices.' + k) };
  const state = Zotero.ZoteroTTSRun.state;
  state.vc261 = state.vc261 || {};
  state.vc261.prefs = snap;
  state.vc261.docVoices = docSnap;
  state.vc261.docKeysBaseline = docKeys.slice();
  // restore-order contract: memory LAST is recorded here for the cleanup script
  state.vc261.restoreOrder = names.filter(n => n !== 'readAloud.memory' && n !== 'readAloud.volume').concat(['readAloud.volume', 'readAloud.memory']);
  // separate handles for the cleanup's explicit steps
  const wd = snap['extensions.zotero.zotero-tts.webdav.enabled'];
  const vol = snap['readAloud.volume'];
  state.vc261.webdav = { value: wd.value, hasUser: wd.user, type: wd.type };
  state.vc261.volume = { value: vol.value, hasUser: vol.user, type: vol.type };
  state.vc261.debug = { storing: !!Zotero.Debug.storing };
  const main = Zotero.getMainWindow();
  state.vc261.winState = { before: { windowState: main.windowState, selectedTab: main.Zotero_Tabs.selectedID } };
  const mem = snap['readAloud.memory'];
  let memVoiceHasSep = null;
  try { const m = JSON.parse(mem.value || 'null'); memVoiceHasSep = m && m.voice ? String(m.voice.id || m.voice).includes('::') : null; } catch (e) { memVoiceHasSep = 'parse-error'; }
  let pos = null;
  try { pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { pos = { error: String(e) }; }
  // rev 2 fix: rows is a NUMBER — no .length
  state.vc261.positionRowsBaseline = pos && pos.database && typeof pos.database.rows === 'number' ? pos.database.rows : null;
  const base = snap['local.baseURL'];
  const tabs = (main.Zotero_Tabs ? main.Zotero_Tabs.tabs : []) || [];
  return JSON.stringify({
    snapshotInState: !!state.vc261.prefs,
    local: {
      enabled: snap['local.enabled'].value,
      // rev 2: never return the real address — stub match + length only
      baseURLIsStub: stubBase ? base.value === stubBase : null, baseURLLen: typeof base.value === 'string' ? base.value.length : null,
      headers: { retainedPrivately: true },
      engine: snap['local.engine'].value,
    },
    system: { enabled: snap['system.enabled'].value },
    webdav: { value: wd.value, hasUser: wd.user },
    readAloud: {
      memory: { len: typeof mem.value === 'string' ? mem.value.length : null, user: mem.user, voiceHasSeparator: memVoiceHasSep },
      defaultVoice: typeof snap['readAloud.defaultVoice'].value === 'string' ? snap['readAloud.defaultVoice'].value : null,
      favoriteVoices: { len: typeof snap['readAloud.favoriteVoices'].value === 'string' ? snap['readAloud.favoriteVoices'].value.length : null },
      favorites: { len: typeof snap['readAloud.favorites'].value === 'string' ? snap['readAloud.favorites'].value.length : null, type: snap['readAloud.favorites'].type },
      favoritesOnly: snap['readAloud.favoritesOnly'].value,
      speedPercent: snap['readAloud.speedPercent'].value, globalSpeed: snap['readAloud.globalSpeed'].value,
      sameForAllDocuments: snap['readAloud.sameForAllDocuments'].value,
      volume: { value: vol.value, user: vol.user },
    },
    nativeReadAloudVoices: { len: typeof snap['extensions.zotero.reader.readAloudVoices'].value === 'string' ? snap['extensions.zotero.reader.readAloudVoices'].value.length : null, user: snap['extensions.zotero.reader.readAloudVoices'].user },
    documentVoiceKeys: docKeys.length,
    positionRows: state.vc261.positionRowsBaseline,
    legacyPref: pos ? pos.legacyPref : null,
    debugStoring: state.vc261.debug.storing,
    mainWindowState: main.windowState,
    openTabCount: tabs.length,
  });
})()
