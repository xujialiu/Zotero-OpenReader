// Baseline (issue #228): named pref snapshot with user-value flags, debug
// store on, reader/window/tab state, position rows, provider availability
// (credentials reported as lengths only), then mute. Nothing here touches a
// secret's value. params: root, runId. state: writes baseline.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const out = { step: 'baseline' };
  const readPref = (name) => {
    const t = Services.prefs.getPrefType(name);
    if (t === 0) return { set: false, value: null, type: 'none' };
    const value = t === 32 ? Services.prefs.getStringPref(name) : t === 64 ? Services.prefs.getIntPref(name) : Services.prefs.getBoolPref(name);
    return { set: Services.prefs.prefHasUserValue(name), value, type: t === 32 ? 'str' : t === 64 ? 'int' : 'bool' };
  };
  const named = {};
  for (const k of ['readAloud.volume', 'readAloud.memory',
    'webdav.enabled', 'webdav.enabledMigrated', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings',
    'azure.enabled', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled', 'cloudflare.enabled',
    'speechify.enabled', 'fish.enabled', 'fishspeech.enabled', 'local.enabled', 'system.enabled',
    'system.hideMicrosoft', 'system.hideApple']) {
    named[k] = readPref(prefix + k);
  }
  // Credential presence only: never a value.
  for (const k of ['azure.apiKey', 'openai-official.apiKey', 'mimo.apiKey', 'compatible.apiKey', 'cloudflare.apiKey', 'speechify.apiKey', 'fish.apiKey']) {
    const p = readPref(prefix + k);
    named[k] = { set: p.set, length: typeof p.value === 'string' ? p.value.length : 0 };
  }
  named['local.baseURL'] = readPref(prefix + 'local.baseURL');
  named['local.voice'] = readPref(prefix + 'local.voice');
  // Zotero's own voice-remembering pref (full name; a relative name would miss).
  named['reader.readAloudVoices'] = readPref('extensions.zotero.reader.readAloudVoices');
  out.namedPrefs = named;
  state.baseline = { prefs: named };

  // documentVoices branch: keys only (values carry voice picks; key set is
  // what cleanup prunes). Mask anything that looks like a credential.
  const dvPrefix = prefix + 'documentVoices.';
  const dvKeys = Services.prefs.getChildList(dvPrefix).filter((n) => n !== dvPrefix && n.startsWith(dvPrefix));
  state.baseline.documentVoiceKeys = dvKeys;
  out.documentVoiceKeyCount = dvKeys.length;

  state.baseline.debugStoring = !!Zotero.Debug?.storing;
  if (!Zotero.Debug?.storing) Zotero.Debug.setStore(true);
  out.debugStoring = !!Zotero.Debug?.storing;

  // Readers (owner tabs left alone) and windows.
  out.readers = (Zotero.Reader?._readers || []).map((r, i) => {
    const m = r._internalReader?._readAloudManager;
    const item = r.itemID ? Zotero.Items.get(r.itemID) : null;
    return { index: i, itemID: r.itemID ?? null, title: (item?.parentItem ?? item)?.getField('title') ?? null, active: !!m?.active, paused: !!m?.paused, isWindow: !!r._window && r._window !== Zotero.getMainWindow() };
  });
  const win = Zotero.getMainWindow();
  const chromeWin = win;
  state.baseline.window = {
    outerWidth: chromeWin.outerWidth, outerHeight: chromeWin.outerHeight,
    screenX: chromeWin.screenX, screenY: chromeWin.screenY,
    windowState: chromeWin.windowState,
    selectedTab: win.Zotero_Tabs?.selectedID ?? null,
    tabs: (win.Zotero_Tabs?.ids ?? []).map((id) => ({ id, title: win.Zotero_Tabs.tabs[id]?.title ?? null })),
  };
  state.baseline.settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  out.window = state.baseline.window;
  out.settingsWindowOpen = state.baseline.settingsWindowOpen;
  out.zoteroVersion = Zotero.version;

  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  state.baseline.positionRows = position?.database?.rows ?? null;
  state.baseline.legacyPref = position?.legacyPref ?? null;
  out.position = { rows: state.baseline.positionRows, legacyPref: state.baseline.legacyPref };

  // Mute before any player can open.
  const vol = prefix + 'readAloud.volume';
  Services.prefs.setIntPref(vol, 0);
  state.baseline.muted = { set: Services.prefs.prefHasUserValue(vol), value: Services.prefs.getIntPref(vol, -1) };
  out.muted = state.baseline.muted;

  const mem = named['readAloud.memory'];
  let memoryVoiceId = null;
  try { memoryVoiceId = JSON.parse(mem.value || 'null')?.voice?.id ?? null; } catch (e) { /* not JSON */ }
  state.baseline.memoryVoiceId = memoryVoiceId;
  out.memoryVoiceId = memoryVoiceId;
  out.memoryIsListedVoice = typeof memoryVoiceId === 'string' && memoryVoiceId.includes('::');

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.installedStartup = { version: startup.version, steps: (startup.steps || []).length, failed: startup.failed };
  return JSON.stringify(out, null, 1);
})()
