// Issue #155 run, cleanup (2026-09-29, 1.16.2-beta2).
// Closes the two fixture sessions and popups (this run's own sessions),
// closes the fixture tabs, erases the imported items, restores every
// preference this run touched (value and user flag), restores the WebDAV
// destination from the baseline snapshot after the transports settle,
// verifies the untouched prefs byte-identically, closes the settings
// window, minimizes the host, and audits what remains.
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

  // 3. Preferences this run touched: restore value and user flag exactly
  const restored = {};
  const lineName = prefix + 'readAloud.readingLine';
  if (p.prefHasUserValue(lineName)) p.clearUserPref(lineName);
  restored.readingLine = { value: p.getIntPref(lineName, -1), user: p.prefHasUserValue(lineName), expected: 'the default (30), no user value' };
  const modeName = prefix + 'readAloud.autoScrollMode';
  p.setStringPref(modeName, String(baseline['readAloud.autoScrollMode'].value));
  restored.autoScrollMode = { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), expectedValue: baseline['readAloud.autoScrollMode'].value, expectedUser: baseline['readAloud.autoScrollMode'].hasUser };
  const volName = prefix + 'readAloud.volume';
  if (!baseline['readAloud.volume'].hasUser && p.prefHasUserValue(volName)) p.clearUserPref(volName);
  else if (baseline['readAloud.volume'].hasUser) p.setIntPref(volName, Number(baseline['readAloud.volume'].value));
  restored.volume = { value: p.getIntPref(volName, -1), user: p.prefHasUserValue(volName), expectedValue: baseline['readAloud.volume'].value, expectedUser: baseline['readAloud.volume'].hasUser };
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

  // 5. WebDAV: settle, then restore the destination from the baseline
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
  if (host?.minimize) host.minimize();
  else if (host) host.windowState = host.STATE_MINIMIZED;
  await sleep(600);
  out.hostMinimized = host ? host.windowState === 2 : null;
  out.debugStoring = !!Zotero.Debug?.storing;
  return JSON.stringify(out);
})()
