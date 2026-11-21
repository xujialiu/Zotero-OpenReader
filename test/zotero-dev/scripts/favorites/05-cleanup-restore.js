// Restore the isolated #195/#208 run: close only the fixture/settings,
// erase only the imported fixture item, restore named prefs and minimize.
return (async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const p = Services.prefs;
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.fix4Prefs;
  const fixture = state.fix4Fixture;
  const reader = state.fix4FixtureReader;
  const hostState = state.fix4Host;
  const debugBefore = state.fix4DebugStoring;
  if (!baseline || !fixture || !hostState) throw new Error('private baseline/fixture snapshot missing; refusing cleanup');
  const prefix = 'extensions.zotero.zotero-tts.';
  const restoreEntry = (name) => {
    const entry = baseline[name];
    if (!entry) throw new Error('baseline entry missing: ' + name);
    if (!entry.user) {
      if (p.prefHasUserValue(entry.key)) p.clearUserPref(entry.key);
    } else if (entry.type === p.PREF_BOOL) p.setBoolPref(entry.key, entry.value);
    else if (entry.type === p.PREF_INT) p.setIntPref(entry.key, entry.value);
    else if (entry.type === p.PREF_STRING) p.setStringPref(entry.key, entry.value);
  };
  const readEntry = (name) => {
    const entry = baseline[name];
    let value = null;
    try {
      if (entry.type === p.PREF_BOOL) value = p.getBoolPref(entry.key);
      else if (entry.type === p.PREF_INT) value = p.getIntPref(entry.key);
      else if (entry.type === p.PREF_STRING) value = p.getStringPref(entry.key);
    } catch (e) {}
    return { valueMatches: value === entry.value, flagMatches: p.prefHasUserValue(entry.key) === entry.user };
  };
  const prefs = [
    'readAloud.favoritesOnly', 'readAloud.favoriteVoices', 'readAloud.defaultVoice',
    'readAloud.sameForAllDocuments', 'highlight.sentence', 'highlight.word',
    'readAloud.volume', 'reader.readAloudVoices', 'system.enabled',
    'webdav.enabled', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.memory',
  ];

  const prefWindow = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWindow) {
    prefWindow.close();
    for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100);
  }
  if (reader) {
    try {
      if (reader._internalReader?._state?.readAloudState?.popupOpen) reader._internalReader.toggleReadAloudPopup(false);
    } catch (e) {}
    await sleep(200);
    try { await reader.close(); } catch (e) {}
    for (let i = 0; i < 60 && Zotero.Reader._readers.includes(reader); i++) await sleep(100);
  }
  const item = Zotero.Items.get(fixture.itemID);
  if (item) await item.eraseTx();

  const recordKey = prefix + 'documentVoices.user/' + fixture.key;
  const docVoiceRecordRemoved = !state.fix4DocumentVoiceRecords?.[fixture.key]
    && p.prefHasUserValue(recordKey) ? (p.clearUserPref(recordKey), true) : !p.prefHasUserValue(recordKey);

  const readTransports = async () => {
    const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    return {
      settingsRunning: settings.transport?.running ?? null,
      settingsPending: settings.transport?.pendingChange ?? null,
      uploadPending: upload.autoUpload?.pending ?? null,
    };
  };
  const idle = (value) => value.settingsRunning === false && value.settingsPending === false && value.uploadPending === false;

  // Restore ordinary prefs first, settle transports with WebDAV off, restore
  // WebDAV after fixture/data cleanup, and write memory last.
  for (const name of prefs.slice(0, 9)) restoreEntry(name);
  let transports = await readTransports();
  for (let i = 0; i < 40 && !idle(transports); i++) { await sleep(250); transports = await readTransports(); }
  if (!idle(transports)) throw new Error('settings transports did not settle before restoring WebDAV');
  for (const name of prefs.slice(9, 13)) restoreEntry(name);
  restoreEntry('readAloud.memory');
  await sleep(350);

  const main = Zotero.getMainWindow?.();
  if (hostState.selectedTabID) {
    try { main?.Zotero_Tabs?.select(hostState.selectedTabID); } catch (e) {}
  }
  await sleep(150);
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host && host.windowState !== 2) host.minimize();
  const folder = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder;
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const positionDatabaseRows = Number.isFinite(position?.database?.rows) ? position.database.rows : null;
  const readersRemaining = Zotero.Reader._readers.length;
  const prefResults = Object.fromEntries(prefs.map((name) => [name, readEntry(name)]));
  const highlight = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const highlightPinRestored = highlight.pin?.wanted === 'word' && highlight.pin?.zotero === 'word' && highlight.pin?.pinned === true;
  const hostMinimized = !!host && host.windowState === 2;
  const settingsClosed = !Services.wm.getMostRecentWindow('zotero:pref');
  const fixtureErased = !Zotero.Items.get(fixture.itemID);
  const allRestored = Object.values(prefResults).every((entry) => entry.valueMatches && entry.flagMatches);
  const selectedTabRestored = main?.Zotero_Tabs?.selectedID === hostState.selectedTabID;
  const success = settingsClosed && readersRemaining === 0
    && fixtureErased && positionDatabaseRows === 0 && docVoiceRecordRemoved
    && folder === false && highlightPinRestored && hostMinimized && allRestored && selectedTabRestored;

  const result = {
    fixtureErased, readersRemaining, positionDatabaseRows, docVoiceRecordRemoved,
    preferences: prefResults, webdavFolder: folder, highlightPinRestored,
    settingsClosed, selectedTabRestored,
    hostMinimized, debugWasStoring: debugBefore, allRestored, snapshotRetained: !success,
  };
  if (!success) return JSON.stringify({ ...result, status: 'FAIL' }, null, 1);

  try { Zotero.Debug.setStore(!!debugBefore); } catch (e) {}
  for (const key of ['fix4Prefs', 'fix4Fixture', 'fix4FixtureManager', 'fix4FixtureReader', 'fix4Voice',
    'fix4DefaultVoiceWritten', 'fix4VoicesWritten', 'fix4Host', 'fix4DebugStoring', 'fix4DocumentVoiceRecords']) delete state[key];
  return JSON.stringify({ ...result, status: 'PASS', debugStoringRestored: !!Zotero.Debug.storing, snapshotRetained: false }, null, 1);
})();
