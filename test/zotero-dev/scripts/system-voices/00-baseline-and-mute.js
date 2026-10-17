// 1.17 baseline: named prefs, owner readers, host window, debug store; mute; favoritesOnly precondition.
// Reads prefs by name only; secrets are never touched. Everything it changes is restored by 06-cleanup.js.
return (async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const PREF = 'extensions.zotero.';
  const typed = (name) => {
    const t = Services.prefs.getPrefType(PREF + name);
    if (t === Services.prefs.PREF_BOOL) return { type: 'bool', value: Services.prefs.getBoolPref(PREF + name) };
    if (t === Services.prefs.PREF_INT) return { type: 'int', value: Services.prefs.getIntPref(PREF + name) };
    if (t === Services.prefs.PREF_STRING) return { type: 'string', value: Services.prefs.getStringPref(PREF + name) };
    return { type: 'none', value: null };
  };
  const user = (name) => Services.prefs.prefHasUserValue(PREF + name);
  try {
    // Snapshot of every pref the run may touch (verbatim values kept in state, not logged).
    state.baseline = {
      'zotero-tts.system.enabled': { ...typed('zotero-tts.system.enabled'), user: user('zotero-tts.system.enabled') },
      'zotero-tts.azure.enabled': { ...typed('zotero-tts.azure.enabled'), user: user('zotero-tts.azure.enabled') },
      'zotero-tts.azure.region': { ...typed('zotero-tts.azure.region'), user: user('zotero-tts.azure.region') },
      'zotero-tts.readAloud.volume': { ...typed('zotero-tts.readAloud.volume'), user: user('zotero-tts.readAloud.volume') },
      'zotero-tts.readAloud.memory': { ...typed('zotero-tts.readAloud.memory'), user: user('zotero-tts.readAloud.memory') },
      'zotero-tts.readAloud.favoritesOnly': { ...typed('zotero-tts.readAloud.favoritesOnly'), user: user('zotero-tts.readAloud.favoritesOnly') },
      'reader.readAloudVoices': { ...typed('reader.readAloudVoices'), user: user('reader.readAloudVoices') },
      'zotero-tts.webdav.enabled': { ...typed('zotero-tts.webdav.enabled'), user: user('zotero-tts.webdav.enabled') }
    };
    // Redacted echo: values of harmless prefs, presence + shape only for the rest.
    out.snapshot = {
      'zotero-tts.system.enabled': state.baseline['zotero-tts.system.enabled'],
      'zotero-tts.azure.enabled': state.baseline['zotero-tts.azure.enabled'],
      'zotero-tts.azure.region': state.baseline['zotero-tts.azure.region'],
      'zotero-tts.readAloud.volume': state.baseline['zotero-tts.readAloud.volume'],
      'zotero-tts.readAloud.favoritesOnly': state.baseline['zotero-tts.readAloud.favoritesOnly'],
      'zotero-tts.readAloud.memory': { type: state.baseline['zotero-tts.readAloud.memory'].type, user: state.baseline['zotero-tts.readAloud.memory'].user, present: state.baseline['zotero-tts.readAloud.memory'].type !== 'none' },
      'reader.readAloudVoices': { type: state.baseline['reader.readAloudVoices'].type, user: state.baseline['reader.readAloudVoices'].user, bytes: (state.baseline['reader.readAloudVoices'].value || '').length },
      'zotero-tts.webdav.enabled': state.baseline['zotero-tts.webdav.enabled']
    };
    // Precondition of the item: Offer only favorite voices off.
    out.favoritesOnlyOff = state.baseline['zotero-tts.readAloud.favoritesOnly'].value === false;

    // Host window + tabs (restored to minimized at cleanup; selected tab left alone).
    const w = Zotero.getMainWindow();
    state.host = { windowState: w.windowState, selectedTab: w.Zotero_Tabs ? w.Zotero_Tabs.selectedID : null };
    out.host = state.host;
    out.tabs = w.Zotero_Tabs ? w.Zotero_Tabs._tabs.map(t => ({ id: t.id, title: t.title })) : null;

    // Owner readers: named, with their session state; never driven.
    out.readers = (Zotero.Reader._readers || []).map(r => {
      const m = r._internalReader && r._internalReader._readAloudManager;
      const it = Zotero.Items.get(r.itemID);
      return {
        itemID: r.itemID,
        title: (it.parentItem || it).getField('title'),
        active: !!(m && m.active), paused: !!(m && m.paused),
        selectedVoiceID: m && m.selectedVoiceID ? String(m.selectedVoiceID) : null
      };
    });

    // Mute for the whole run (restored by 06).
    Services.prefs.setIntPref(PREF + 'zotero-tts.readAloud.volume', 0);
    out.muted = Services.prefs.getIntPref(PREF + 'zotero-tts.readAloud.volume') === 0;

    // Debug store on for the run (restored by 06); holds the `macOS lists N voices` line.
    state.debugStoringBefore = Zotero.Debug.storing;
    Zotero.Debug.setStore(true);
    out.debugStoring = Zotero.Debug.storing;

    // Position rows baseline, for counting a fixture row in and out.
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.databaseRows = pos.database && pos.database.rows;
    state.rowsBefore = out.databaseRows;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e) });
  }
})()
