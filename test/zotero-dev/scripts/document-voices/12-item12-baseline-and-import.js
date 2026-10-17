(async () => {
  // Item 12 (issue #183): private baseline, muted run, Kokoro+System on,
  // default/memory at a free Kokoro voice, disposable fixture-a.pdf import.
  // Caller must have isolated WebDAV already (state.item12run.webdav holds the snapshot).
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const read = (name) => {
    const full = name.startsWith('extensions.zotero.') ? name : P + name;
    let type = null, value = null;
    try {
      const t = Services.prefs.getPrefType(full);
      if (t === 0) return { type: 'none', value: null, user: Services.prefs.prefHasUserValue(full) };
      type = t === 32 ? 'string' : t === 64 ? 'int' : 'bool';
      value = t === 32 ? Services.prefs.getStringPref(full) : t === 64 ? Services.prefs.getIntPref(full) : Services.prefs.getBoolPref(full);
    } catch (e) { return { type: 'error', value: String(e), user: false }; }
    return { type, value, user: Services.prefs.prefHasUserValue(full) };
  };
  const names = [
    'readAloud.volume', 'readAloud.stripAngleBrackets', 'readAloud.bracketPairs', 'readAloud.defaultVoice',
    'readAloud.memory', 'readAloud.favoritesOnly', 'readAloud.favorites', 'readAloud.sameForAllDocuments',
    'local.enabled', 'local.baseURL', 'local.engine', 'system.enabled',
    'zotero-standard.enabled', 'zotero-premium.enabled', 'cacheAudio',
    'documentVoiceMigrated', 'documentVoiceChanged',
  ];
  const snap = {};
  for (const n of names) snap[n] = read(n);
  snap['extensions.zotero.reader.readAloudVoices'] = read('extensions.zotero.reader.readAloudVoices');
  snap['extensions.zotero.readAloud.memory'] = read('extensions.zotero.readAloud.memory');
  const branch = Services.prefs.getBranch(P + 'documentVoices.');
  const docKeys = branch.getChildList('');
  snap['documentVoices.*'] = {};
  for (const k of docKeys) snap['documentVoices.*'][k] = { type: 'string', value: Services.prefs.getStringPref(P + 'documentVoices.' + k), user: true };
  const readers = (Zotero.Reader._readers || []).map(r => {
    let title = null;
    try { const it = Zotero.Items.get(r.itemID); title = ((it.parentItem ?? it)).getField('title'); } catch (e) {}
    const m = r._internalReader?._readAloudManager;
    return { itemID: r.itemID, tabID: r.tabID, title, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID ?? null, popupOpen: !!r._internalReader?._readAloudPopupOpen };
  });
  const main = Zotero.getMainWindow();
  const winState = main ? { windowState: main.windowState, width: main.outerWidth, height: main.outerHeight, screenX: main.screenX, screenY: main.screenY } : null;
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  const state = Zotero.ZoteroTTSRun.state;
  state.item12run = state.item12run || {};
  state.item12run.baseline = { prefs: snap, readers, debugStoring: Zotero.Debug.storing, winState, positionRows: position?.database?.rows?.length ?? null, at: Date.now() };
  if (state.item12run.webdav) state.item12run.baseline.webdav = state.item12run.webdav;
  let savedTo = null;
  try {
    const params = Zotero.ZoteroTTSRun.params;
    const dir = PathUtils.join(params.tmpDir, params.runId);
    await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
    await IOUtils.writeUTF8(PathUtils.join(dir, 'item12-baseline.json'), JSON.stringify(state.item12run.baseline, null, 1));
    savedTo = PathUtils.join(dir, 'item12-baseline.json');
  } catch (e) { savedTo = 'save-failed: ' + e.message; }
  // mutations for the run
  Zotero.Debug.setStore(true);
  Services.prefs.setIntPref(P + 'readAloud.volume', 0);
  Services.prefs.setBoolPref(P + 'local.enabled', true);
  Services.prefs.setBoolPref(P + 'system.enabled', true);
  Services.prefs.setStringPref(P + 'readAloud.memory', JSON.stringify({ voice: { id: 'local::af_bella', lang: 'en' } }));
  Services.prefs.setStringPref(P + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
  // disposable fixture
  const params = Zotero.ZoteroTTSRun.params;
  const title = params.fixtureTitle || 'ztts item12 doc-a';
  const file = PathUtils.join(params.fixturesDir, 'fixture-a.pdf');
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  state.item12run.fixture = { itemID: item.id, key: item.key, title };
  const opened = await Zotero.Reader.open(item.id);
  let ready = null;
  const deadline = Date.now() + 24000;
  while (Date.now() < deadline) {
    const r = (Zotero.Reader._readers || []).find(e => e.itemID === item.id);
    if (r && r._internalReader && r._internalReader._readAloudManager) { ready = { internal: true, manager: true }; break; }
    await sleep(1000);
  }
  const redact = (s) => ({ type: s.type, len: typeof s.value === 'string' ? s.value.length : null, user: s.user });
  return JSON.stringify({
    snapshotKeys: names.length + 2, documentVoiceKeys: docKeys.length,
    savedTo, debugStoring: Zotero.Debug.storing,
    volume: { value: Services.prefs.getIntPref(P + 'readAloud.volume'), user: Services.prefs.prefHasUserValue(P + 'readAloud.volume') },
    localEnabled: Services.prefs.getBoolPref(P + 'local.enabled'),
    systemEnabled: Services.prefs.getBoolPref(P + 'system.enabled'),
    memory: redact(snap['readAloud.memory']),
    defaultVoiceWas: JSON.parse(snap['readAloud.defaultVoice'].value ?? 'null'),
    baselineSummary: { readers: readers.map(r => r.itemID), positionRows: state.item12run.baseline.positionRows, webdavInState: !!state.item12run.webdav },
    fixture: state.item12run.fixture, opened: !!opened, ready,
  }, null, 1);
})()
