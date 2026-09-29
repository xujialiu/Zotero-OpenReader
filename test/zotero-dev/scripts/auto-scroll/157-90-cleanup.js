// Issue #157 run, cleanup (adapts 155-90 to this run's baseline).
// Closes this run's two fixture sessions/popups and tabs, erases the
// imported items, restores every pref to its baseline byte-for-byte —
// autoScrollMode had NO user value (cleared, so it reads the new `line`
// default; under the pre-install build the same state read `sentence`),
// readingLine keeps its baseline user value 30, volume and highlight.word
// lose the run's user flags — verifies the untouched prefs byte-identically,
// settles the transports, restores the WebDAV destination, then re-enables
// the sync switches per baseline (they were already off as found), audits
// positions, closes the settings window, minimizes the host.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.baseline;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const errors = [];
  const out = { errors };

  // 1. Close this run's sessions and players, then the fixture tabs
  const fixtureSlots = [state.fixturesImported?.pdf, state.fixturesImported?.epub].filter(Boolean);
  const closed = [];
  for (const slot of fixtureSlots) {
    const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
    if (!reader) { closed.push({ itemID: slot.itemID, was: 'already closed' }); continue; }
    const internal = reader._internalReader;
    try { if (internal?._readAloudManager?.active && !internal._readAloudManager.paused) internal._readAloudManager.pause(); } catch (e) { errors.push('pause ' + slot.itemID + ': ' + String(e)); }
    await sleep(250);
    try { internal.toggleReadAloudPopup(false); } catch (e) { errors.push('popup ' + slot.itemID + ': ' + String(e)); }
    await sleep(250);
    try { reader.close(); } catch (e) { errors.push('close ' + slot.itemID + ': ' + String(e)); }
    closed.push({ itemID: slot.itemID, was: 'closed' });
  }
  await sleep(800);
  out.closed = closed;
  out.readersRemaining = (Zotero.Reader._readers ?? []).map(r => r?.itemID ?? null);

  // 2. Erase the imported fixture items
  const erased = [];
  for (const slot of fixtureSlots) {
    try {
      const item = Zotero.Items.get(slot.itemID);
      if (item) await item.eraseTx();
      erased.push({ itemID: slot.itemID, erased: !Zotero.Items.get(slot.itemID) });
    } catch (e) { errors.push('erase ' + slot.itemID + ': ' + String(e)); erased.push({ itemID: slot.itemID, error: String(e) }); }
  }
  out.erased = erased;

  // 3. Prefs this run touched: restore value AND user flag exactly
  const restored = {};
  const lineName = prefix + 'readAloud.readingLine';
  const lineBase = baseline['readAloud.readingLine'];
  if (lineBase.hasUser) p.setIntPref(lineName, Number(lineBase.value));
  else if (p.prefHasUserValue(lineName)) p.clearUserPref(lineName);
  restored.readingLine = { value: p.getIntPref(lineName, -1), user: p.prefHasUserValue(lineName), expected: { value: lineBase.value, user: lineBase.hasUser } };
  const modeName = prefix + 'readAloud.autoScrollMode';
  const modeBase = baseline['readAloud.autoScrollMode'];
  if (modeBase.hasUser) p.setStringPref(modeName, String(modeBase.value));
  else if (p.prefHasUserValue(modeName)) p.clearUserPref(modeName);
  restored.autoScrollMode = { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), expected: { value: modeBase.value, user: modeBase.hasUser }, note: 'baseline held no user value: the same state reads `sentence` under the pre-install build and `line` under beta4 (the #157 default change)' };
  const volName = prefix + 'readAloud.volume';
  if (!baseline['readAloud.volume'].hasUser && p.prefHasUserValue(volName)) p.clearUserPref(volName);
  else if (baseline['readAloud.volume'].hasUser) p.setIntPref(volName, Number(baseline['readAloud.volume'].value));
  restored.volume = { value: p.getIntPref(volName, -1), user: p.prefHasUserValue(volName), expected: { value: baseline['readAloud.volume'].value, user: baseline['readAloud.volume'].hasUser } };
  const wordName = prefix + 'highlight.word';
  if (!baseline['highlight.word'] || !baseline['highlight.word'].hasUser) {
    if (p.prefHasUserValue(wordName)) p.clearUserPref(wordName);
  } else p.setBoolPref(wordName, !!baseline['highlight.word'].value);
  restored.highlightWord = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
  out.restored = restored;

  // 4. Untouched prefs: verify byte-identically against the baseline snapshot
  const verify = {};
  const eq = (name, current) => {
    const base = baseline[name];
    const same = JSON.stringify(base?.value ?? null) === JSON.stringify(current.value ?? null) && !!base?.hasUser === !!current.user;
    return { same, value: typeof current.value === 'string' && (name.includes('password') || name.includes('apiKey') || name.includes('memory') || name.includes('readAloudVoices')) ? `<${String(current.value ?? '').length} chars>` : current.value, user: current.user };
  };
  const readPref = name => {
    const key = name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
    const type = p.getPrefType(key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    return { key, value, user: p.prefHasUserValue(key) };
  };
  for (const name of ['readAloud.keepFollowingWhileVisible', 'readAloud.playerLayout', 'shortcuts.toggleAutoScroll', 'readAloud.memory', 'reader.readAloudVoices']) {
    verify[name] = eq(name, readPref(name));
  }
  out.untouchedVerify = verify;

  // 5. WebDAV: settle the transports, restore the destination, switches per baseline
  const d = Zotero.ZoteroTTS?.diagnostics;
  let settled = false;
  if (d) {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      try {
        const position = JSON.parse(await d.position());
        const settings = JSON.parse(await d.settingsSync());
        const upload = JSON.parse(await d.settingsUpload());
        if (position.store?.queued === 0 && position.store?.writing === false && settings.transport?.pendingChange === false && upload.autoUpload?.pending === false) { settled = true; break; }
      } catch (e) {}
      await sleep(300);
    }
  }
  const urlName = prefix + 'webdav.url';
  const baseConfig = baseline['webdav.url'];
  if (baseConfig?.hasUser) p.setStringPref(urlName, String(baseConfig.value));
  else if (p.prefHasUserValue(urlName)) p.clearUserPref(urlName);
  const urlRestoredMatches = (p.getStringPref(urlName) ?? null) === (baseConfig?.value ?? null);
  for (const [name, val] of [['webdav.syncPositions', baseline['webdav.syncPositions'].value], ['webdav.autoUploadSettings', baseline['webdav.autoUploadSettings'].value], ['webdav.syncSettings', baseline['webdav.syncSettings'].value]]) {
    if (typeof val === 'boolean') p.setBoolPref(prefix + name, val);
  }
  const switchesNow = { positions: p.getBoolPref(prefix + 'webdav.syncPositions'), autoUpload: p.getBoolPref(prefix + 'webdav.autoUploadSettings'), settings: p.getBoolPref(prefix + 'webdav.syncSettings') };
  out.webdav = {
    settledBeforeRestore: settled,
    urlRestoredMatchesBaseline: urlRestoredMatches,
    switches: switchesNow,
    switchesAsFound: switchesNow.positions === baseline['webdav.syncPositions'].value && switchesNow.autoUpload === baseline['webdav.autoUploadSettings'].value && switchesNow.settings === baseline['webdav.syncSettings'].value,
  };

  // 6. Positions audit and the store's queue
  let positions = null;
  try {
    const pos = JSON.parse(await d.position());
    positions = { rows: pos.database?.rows ?? null, queued: pos.store?.queued ?? null, writing: pos.store?.writing ?? null, lastError: pos.store?.lastError ?? null };
  } catch (e) { positions = String(e); }
  out.positions = positions;

  // 7. Settings window and the host window
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  out.settingsWindowClosed = !prefWin;
  if (prefWin) { try { prefWin.close(); await sleep(500); out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref'); } catch (e) { errors.push('close prefs: ' + String(e)); } }
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host?.minimize) { try { host.minimize(); } catch (e) {} }
  await sleep(700);
  out.hostMinimized = host ? host.windowState === 2 : null;
  out.debugStoring = !!Zotero.Debug?.storing;
  return JSON.stringify(out);
})()
