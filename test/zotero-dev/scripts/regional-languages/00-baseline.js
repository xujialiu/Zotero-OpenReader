// 00-baseline.js — the #223 baseline: snapshot every state this case may
// touch (with user-value flags), turn the WebDAV folder off, mute, turn the
// debug store on, and record the error ring, tabs and window as found.
// Reads named prefs only; secrets are never read (webdav.url etc. absent).
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };

  // 1. Prefs the case may touch: value + user-value flag (named reads only).
  const prefNames = [
    'reader.readAloudVoices',
    'zotero-tts.readAloud.memory',
    'zotero-tts.readAloud.defaultVoice',
    'zotero-tts.readAloud.volume',
    'zotero-tts.webdav.enabled',
  ];
  const prefs = {};
  for (const n of prefNames) {
    prefs[n] = {
      value: safe(() => Zotero.Prefs.get(P + n, true)),
      has: safe(() => Services.prefs.prefHasUserValue(P + n), false),
    };
  }
  state.prefs = prefs;
  out.prefs = Object.fromEntries(Object.entries(prefs).map(([k, v]) => [
    k,
    k === 'zotero-tts.readAloud.volume' ? v.value
      : typeof v.value === 'string' && v.value ? 'set (' + v.value.length + ' chars)' : v.value,
  ]));

  // 2. Named provider/switch prefs (booleans only).
  out.switches = {};
  for (const n of ['zotero-tts.azure.enabled', 'zotero-tts.fish.enabled', 'zotero-tts.zotero-premium.enabled',
    'zotero-tts.readAloud.favoritesOnly', 'zotero-tts.webdav.syncPositions', 'zotero-tts.webdav.syncSettings',
    'zotero-tts.webdav.autoUploadSettings']) {
    out.switches[n] = safe(() => Zotero.Prefs.get(P + n, true), 'unset');
  }

  // 3. Zotero identity and window as found.
  out.zoteroVersion = Zotero.version;
  out.zoteroLocale = Zotero.locale;
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  state.window = win ? {
    windowState: win.windowState, outerWidth: win.outerWidth, outerHeight: win.outerHeight,
    screenX: win.screenX, screenY: win.screenY,
    selectedTabID: win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null,
  } : null;
  out.window = state.window;
  out.settingsWindowOpen = !!safe(() => Services.wm.getMostRecentWindow('zotero:pref'));

  // 4. The owner's readers: title, itemID, manager state (never touched).
  state.ownerReaders = (Zotero.Reader._readers ?? []).map((r, i) => ({
    i, itemID: safe(() => r.itemID), tabID: safe(() => r.tabID),
    title: safe(() => { const it = Zotero.Items.get(r.itemID); return (it?.parentItem ?? it)?.getField('title') ?? null; }),
    active: safe(() => !!r._internalReader?._readAloudManager?.active),
    paused: safe(() => !!r._internalReader?._readAloudManager?.paused),
    selectedVoiceID: safe(() => r._internalReader?._readAloudManager?.selectedVoiceID ?? null),
  }));
  out.readers = state.ownerReaders.map(r => ({ title: r.title, active: r.active, paused: r.paused }));

  // 5. Debug store and the error ring's contents (ring, not length).
  state.debugStoring = safe(() => Zotero.Debug.storing, false);
  safe(() => Zotero.Debug.setStore(true));
  out.debugStoringBefore = state.debugStoring;
  state.errorsBefore = safe(() => Zotero.getErrors().slice(), []);
  out.errorCountBefore = state.errorsBefore.length;
  out.runStart = new Date().toISOString();

  // 6. Diagnostics before anything is driven.
  out.startupBefore = safe(() => JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()));
  out.positionBefore = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()));
  state.positionRowsBefore = out.positionBefore?.database?.rows ?? null;
  out.positionRowsBefore = state.positionRowsBefore;
  out.legacyPref = out.positionBefore?.database?.legacyPref ?? null;
  const dv = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()));
  state.documentVoicesBefore = dv?.records ?? null;
  out.documentVoiceRecordsBefore = dv ? Object.keys(dv.records ?? {}).length : null;

  // 7. WebDAV first (not about WebDAV): snapshot taken above, folder off,
  //    confirmed through positionSync().
  const wasFolder = prefs['zotero-tts.webdav.enabled'];
  out.webdavFolderWas = wasFolder;
  safe(() => Zotero.Prefs.set(P + 'zotero-tts.webdav.enabled', false, true));
  await new Promise(r => setTimeout(r, 2000));
  const ps = safe(() => JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()));
  out.positionSyncAfterOff = ps ? { folder: ps.folder, enabled: ps.enabled, configured: ps.configured, localEntries: ps.localEntries } : null;
  out.webdavOff = ps?.folder === false;

  // 8. Mute for the run (volume restored byte-identically at cleanup).
  safe(() => Zotero.Prefs.set(P + 'zotero-tts.readAloud.volume', 0, true));
  out.muted = safe(() => Zotero.Prefs.get(P + 'zotero-tts.readAloud.volume', true)) === 0;

  out.ok = out.webdavOff && out.muted;
  return JSON.stringify(out);
})();
