// system-voice-refresh 00: baseline 0 snapshot before anything else (issue #241).
// Snapshots ONLY — no preference writes. Each named pref is stored with its EFFECTIVE
// value (default or user-set) plus its user-value flag, so a restore can verify both.
// Enabling the debug store is recorded, not a preference write. Muting happens in 01,
// after WebDAV isolation is confirmed (the 2026-11-05 part-1 run muted here, before the
// folder switch was off — a procedural FAIL, corrected in this revision).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const NAMES = [
    prefix + 'system.enabled',
    prefix + 'readAloud.volume',
    prefix + 'readAloud.favoritesOnly',
    prefix + 'readAloud.defaultVoice',
    prefix + 'readAloud.memory',
    prefix + 'readAloud.favoriteVoices',
    'extensions.zotero.reader.readAloudVoices',
    prefix + 'webdav.enabled',
    prefix + 'webdav.syncPositions',
    prefix + 'webdav.syncSettings',
    prefix + 'webdav.autoUploadSettings',
  ];
  const readPref = (name) => {
    const t = Services.prefs.getPrefType(name);
    const hasUser = Services.prefs.prefHasUserValue(name);
    if (t === Ci.nsIPrefBranch.PREF_STRING) return { type: 'string', hasUser, value: Services.prefs.getStringPref(name) };
    if (t === Ci.nsIPrefBranch.PREF_INT) return { type: 'int', hasUser, value: Services.prefs.getIntPref(name) };
    if (t === Ci.nsIPrefBranch.PREF_BOOL) return { type: 'bool', hasUser, value: Services.prefs.getBoolPref(name) };
    return { type: 'none', hasUser, value: null };
  };
  const titleOf = (r) => {
    try {
      const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
      return (item?.parentItem ?? item)?.getField('title') ?? null;
    } catch (e) { return 'unreadable'; }
  };
  try {
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    const readers = (Zotero.Reader?._readers || []).map((r) => ({
      itemID: r.itemID,
      title: titleOf(r),
      active: !!(r._internalReader?._readAloudManager?.active),
      paused: !!(r._internalReader?._readAloudManager?.paused),
    }));
    state.prefs = {};
    for (const name of NAMES) state.prefs[name] = readPref(name);
    const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    state.docVoicesBefore = docVoices.records || [];
    state.docVoicesReaders = docVoices.readers || [];
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    state.rowsBaseline = pos.database ? pos.database.rows : null;
    state.legacyPref = pos.legacyPref ?? null;
    const posSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    state.posSyncBefore = {
      enabled: posSync.enabled, folder: posSync.folder, configured: posSync.configured,
      localEntries: posSync.localEntries, transport: posSync.transport,
      sharedTransport: posSync.shared ? posSync.shared.transport : null,
    };
    state.windowBefore = {
      windowState: win ? win.windowState : null,
      screenX: win ? win.screenX : null, screenY: win ? win.screenY : null,
      outerWidth: win ? win.outerWidth : null, outerHeight: win ? win.outerHeight : null,
    };
    state.selectedTabBefore = win && win.Zotero_Tabs ? { selectedID: win.Zotero_Tabs.selectedID, tabs: (win.Zotero_Tabs._tabs || []).map((t) => ({ id: t.id, type: t.type })) } : null;
    state.readersBefore = readers;
    state.settingsWindowBefore = !!Services.wm.getMostRecentWindow('zotero:pref');
    state.debugStoringBefore = !!Zotero.Debug.storing;
    if (!state.debugStoringBefore) Zotero.Debug.setStore(true);
    const errs = Zotero.getErrors();
    state.errorsBefore = { count: errs.length, sample: errs.slice(0, 5).map((e) => String(e).slice(0, 160)) };
    state.volumeBefore = { ...state.prefs[prefix + 'readAloud.volume'] };
    let startupOld = null;
    try { startupOld = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { startupOld = { error: String(e) }; }
    state.startupOld = startupOld;
    return JSON.stringify({
      zotero: Zotero.version, platform: Zotero.isWin ? 'win' : 'other',
      readersBefore: readers, settingsWindowBefore: state.settingsWindowBefore,
      windowBefore: state.windowBefore, selectedTabBefore: state.selectedTabBefore,
      prefsSnapshotted: NAMES.length,
      volumeBefore: state.volumeBefore,
      debugStoringBefore: state.debugStoringBefore, debugStoringNow: !!Zotero.Debug.storing,
      rowsBaseline: state.rowsBaseline, legacyPref: state.legacyPref,
      posSyncBefore: state.posSyncBefore,
      docVoiceKeyCount: Object.keys(state.docVoicesBefore).length,
      startupOld: { version: startupOld.version, failed: startupOld.failed ?? null },
      errorsBefore: state.errorsBefore,
      noPrefWrites: true,
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
