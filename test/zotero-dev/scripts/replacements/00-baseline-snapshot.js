// Baseline (issue #237, second build): the case's named prefs snapshotted
// verbatim into state.baseline (restore in this order at cleanup, memory
// last), the WebDAV folder's switch confirmed off (snapshot value + user
// flag; switched off here if it was on), the debug store on, the reader
// tabs and their managers as found, and the position-row count. Volume is
// muted for the run (original value + user flag kept for restore). No API
// key or password is read; local.headers is mapped to set/length only.
// params: none. state: writes baseline, webdav, fixture:null.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.zotero-tts.';
  const ZP = 'extensions.zotero.reader.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Gecko's typed getters answer a wrong type without throwing (an int pref
  // read as bool returned false, 2026-11-03): check the type branch first.
  const raw = (name) => {
    const full = name.startsWith('extensions.zotero.') ? name : P + name;
    const kind = Services.prefs.getPrefType(full);
    let value = null;
    if (kind === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(full, null);
    else if (kind === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(full, null);
    else if (kind === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(full, null);
    return { value, user: Services.prefs.prefHasUserValue(full) };
  };
  // 1. WebDAV folder: snapshot, settle, off, confirm
  const webdavPref = P + 'webdav.enabled';
  const webdav = { value: Services.prefs.getBoolPref(webdavPref, null), user: Services.prefs.prefHasUserValue(webdavPref) };
  const rep0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  for (let i = 0; i < 16; i++) {
    if (!rep0.transport?.running) break;
    await sleep(500);
  }
  if (webdav.value) { Services.prefs.setBoolPref(webdavPref, false); await sleep(1200); }
  const rep1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  state.webdav = webdav;
  out.webdav = { before: webdav, folderNow: rep1.folder, lastOutcome: rep1.transport?.lastOutcome ?? null };
  // 2. the debug store on for the run (restored at cleanup)
  out.debugStoringBefore = Zotero.Debug.storing;
  Zotero.Debug.setStore(true);
  // 3. the reader tabs and their managers as found
  out.readers = (Zotero.Reader._readers ?? []).map((r, i) => ({
    index: i,
    itemID: r.itemID,
    title: (() => { try { const it = Zotero.Items.get(r.itemID); return (it.parentItem ?? it).getField('title'); } catch (e) { return null; } })(),
    active: (() => { try { return !!r._internalReader?._readAloudManager?.active; } catch (e) { return null; } })(),
    paused: (() => { try { return r._internalReader?._readAloudManager?.paused ?? null; } catch (e) { return null; } })(),
  }));
  // 4. position rows as found
  out.positionRows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database?.rows ?? null;
  // 5. the named prefs, verbatim
  const branchValues = (branch) => {
    const values = {};
    for (const full of Services.prefs.getBranch(P + branch).getChildList('')) {
      if (!full) continue;
      values[full.slice((P + branch).length)] = raw(P + branch + full);
    }
    return values;
  };
  const baseline = {
    order: ['replacements', 'documentReplacements.*', 'documentReplacementsChanged', 'defaultVoice', 'readAloudVoices', 'playerLayout', 'volume', 'speed', 'memory', 'local.enabled', 'local.engine', 'local.baseURL', 'local.voice', 'local.headers(len)', 'documentVoices.*', 'highlightGranularity', 'stripAngleBrackets'],
    replacements: raw('readAloud.replacements'),
    documentReplacements: branchValues('documentReplacements.'),
    documentReplacementsChanged: raw('documentReplacementsChanged'),
    defaultVoice: raw('readAloud.defaultVoice'),
    readAloudVoices: raw(ZP + 'readAloudVoices'),
    playerLayout: raw('readAloud.playerLayout'),
    volume: raw('readAloud.volume'),
    speedPercent: raw('readAloud.speedPercent'),
    memory: raw('readAloud.memory'),
    localEnabled: raw('local.enabled'),
    localEngine: raw('local.engine'),
    localBaseURL: raw('local.baseURL'),
    localVoice: raw('local.voice'),
    localHeaders: (() => { const h = raw('local.headers'); return { set: h.value !== null && h.value !== '', length: typeof h.value === 'string' ? h.value.length : 0, user: h.user }; })(),
    documentVoices: branchValues('documentVoices.'),
    highlightGranularity: raw(ZP + 'readAloud.highlightGranularity'),
    stripAngleBrackets: raw('readAloud.stripAngleBrackets'),
  };
  // never print the memory's voice id in full: a metered voice must not be picked
  out.baselineSummary = {
    replacementsValue: baseline.replacements.value,
    documentReplacementsKeys: Object.keys(baseline.documentReplacements),
    documentReplacementsChanged: baseline.documentReplacementsChanged,
    defaultVoice: baseline.defaultVoice.value,
    readAloudVoicesLength: typeof baseline.readAloudVoices.value === 'string' ? baseline.readAloudVoices.value.length : null,
    readAloudVoicesUser: baseline.readAloudVoices.user,
    playerLayout: baseline.playerLayout,
    volume: baseline.volume,
    speedPercent: baseline.speedPercent,
    memoryUser: baseline.memory.user,
    memoryHasValue: baseline.memory.value !== null && baseline.memory.value !== '',
    memoryIsMetered: typeof baseline.memory.value === 'string' && baseline.memory.value.includes('"') && !baseline.memory.value.includes('::'),
    localEnabled: baseline.localEnabled,
    localBaseURL: baseline.localBaseURL.value,
    localVoice: baseline.localVoice.value,
    documentVoicesKeys: Object.keys(baseline.documentVoices),
    highlightGranularity: baseline.highlightGranularity,
    stripAngleBrackets: baseline.stripAngleBrackets,
  };
  state.baseline = baseline;
  state.fixture = null;
  // 6. mute for the run (original kept in the snapshot)
  Services.prefs.setIntPref(P + 'readAloud.volume', 0);
  out.volumeNow = Services.prefs.getIntPref(P + 'readAloud.volume');
  return JSON.stringify(out, null, 1);
})()
