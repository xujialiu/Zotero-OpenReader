// 10-cleanup.js — case 6: close the fixture's Player, close its tab, erase
// the item, bring the documentVoices branch back to the baseline set,
// restore every pref byte-identically honoring user-value flags (memory
// LAST), restore the debug store, reselect the owner's tab, restore the
// window, and leave Zotero minimized. Runner reset happens separately,
// after this result is verified.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const full = n => P + n;

  // 1. Close the fixture's Player (our session; never the owner's).
  const reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === state.fixtureItemID);
  if (reader) {
    let closed = false;
    try { reader._internalReader.toggleReadAloudPopup(false); closed = true; } catch (e) { out.playerCloseError = String(e); }
    out.playerClosed = closed;
    await sleep(500);
    out.tabID = state.fixtureTabID ?? safe(() => reader.tabID);
    try { Zotero.getMainWindow().Zotero_Tabs.close(out.tabID); } catch (e) { out.closeError = String(e); }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await sleep(500);
      if (!(Zotero.Reader._readers ?? []).some(r => r.itemID === state.fixtureItemID)) { out.readerGone = true; break; }
    }
  } else { out.readerGone = true; out.playerClosed = 'already gone'; }

  // 2. Erase the fixture item.
  if (state.fixtureItemID) {
    try { await Zotero.Items.erase([state.fixtureItemID]); out.erased = true; }
    catch (e) { out.eraseError = String(e); }
    await sleep(1000);
  }
  const pos = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()));
  out.positionRowsAfter = pos?.database?.rows ?? null;
  out.positionRowsBaseline = safe(() => state.positionRowsBefore);
  out.rowsBack = out.positionRowsAfter === out.positionRowsBaseline;

  // 3. Prefs, byte-identical, honoring user-value flags. memory LAST. Done
  //    before the documentVoices branch: the readAloudVoices write is a pick
  //    to memory-sync's observer and spreads to reading tabs, which can
  //    dirty a record — let it settle, then restore the records.
  const prefs = safe(() => state.prefs, {}) ?? {};
  const order = ['reader.readAloudVoices', 'zotero-tts.readAloud.volume', 'zotero-tts.readAloud.defaultVoice', 'zotero-tts.webdav.enabled', 'zotero-tts.readAloud.memory'];
  out.restored = {};
  for (const name of order) {
    const snap = prefs[name];
    if (!snap) { out.restored[name] = 'no snapshot'; continue; }
    try {
      if (!snap.has) Services.prefs.clearUserPref(full(name));
      else if (name === 'zotero-tts.readAloud.volume') Zotero.Prefs.set(full(name), Number(snap.value), true);
      else if (name === 'zotero-tts.webdav.enabled') Zotero.Prefs.set(full(name), snap.value === true, true);
      else Zotero.Prefs.set(full(name), String(snap.value), true);
    } catch (e) { out.restored[name] = 'restore threw: ' + String(e); }
  }
  // Let observers settle, then verify byte-identically.
  await sleep(2500);
  out.verify = {};
  for (const name of order) {
    const snap = prefs[name];
    if (!snap) continue;
    let nowValue = null, nowHas = false;
    try { nowHas = Services.prefs.prefHasUserValue(full(name)); nowValue = nowHas ? Zotero.Prefs.get(full(name), true) : null; } catch (e) { nowValue = 'ERR'; }
    out.verify[name] = {
      has: nowHas, hasMatches: nowHas === snap.has,
      // Without a user value there is nothing to compare: hasMatches covers it.
      valueMatches: !nowHas || JSON.stringify(nowValue) === JSON.stringify(snap.value),
    };
  }

  // 4. The documentVoices branch back to the baseline set (00's snapshot).
  //    The diagnostic's records are keyed 'documentVoices.<record>' with
  //    JSON-string values; the branch's children are named '<record>'.
  const branch = full('zotero-tts.documentVoices.');
  const before = safe(() => state.documentVoicesBefore, {}) ?? {};
  const childPrefs = safe(() => Services.prefs.getBranch(branch).getChildList(''), []) ?? [];
  let deleted = 0, restored = 0;
  for (const child of childPrefs) {
    if (!child) continue;
    if (Object.prototype.hasOwnProperty.call(before, 'documentVoices.' + child)) continue;
    safe(() => Services.prefs.clearUserPref(branch + child));
    deleted++;
  }
  for (const [k, v] of Object.entries(before)) {
    const rel = k.slice('documentVoices.'.length);
    let nowValue = null, has = false;
    try { has = Services.prefs.prefHasUserValue(branch + rel); nowValue = has ? Zotero.Prefs.get(branch + rel, true) : null; } catch (e) { /* below */ }
    if (JSON.stringify(nowValue) !== JSON.stringify(v)) {
      safe(() => Zotero.Prefs.set(branch + rel, v, true));
      restored++;
    }
  }
  out.documentVoiceBranch = { deleted, restored, baselineKeys: Object.keys(before).length };
  const dvNow = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()));
  out.documentVoiceRecordsNow = dvNow ? Object.keys(dvNow.records ?? {}).length : null;
  out.documentVoicesEqual = JSON.stringify(dvNow?.records ?? {}) === JSON.stringify(before);

  // 5. WebDAV confirmation.
  const ps = safe(() => JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()));
  out.positionSync = ps ? { folder: ps.folder, enabled: ps.enabled } : null;
  out.webdavRestored = ps?.folder === prefs['zotero-tts.webdav.enabled']?.value;

  // 6. Debug store back.
  out.debugStoringBefore = safe(() => state.debugStoring);
  safe(() => Zotero.Debug.setStore(!!state.debugStoring));
  out.debugStoringNow = safe(() => Zotero.Debug.storing);

  // 7. The owner's tab back, window as found, then minimized (the owner's
  //    explicit exception).
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const found = safe(() => state.window, null);
  if (win && found) {
    if (found.selectedTabID && win.Zotero_Tabs) { try { win.Zotero_Tabs.select(found.selectedTabID); } catch (e) { out.tabSelect = String(e); } }
    try {
      if (win.windowState !== 2) {
        if (win.outerWidth !== found.outerWidth || win.outerHeight !== found.outerHeight) win.resizeTo(found.outerWidth, found.outerHeight);
        if (win.screenX !== found.screenX || win.screenY !== found.screenY) win.moveTo(found.screenX, found.screenY);
      }
    } catch (e) { out.geometry = String(e); }
    try { win.minimize(); out.minimized = true; } catch (e) { out.minimized = String(e); }
  }
  out.ownerReaders = safe(() => (Zotero.Reader._readers ?? []).map(r => ({
    itemID: safe(() => r.itemID),
    active: safe(() => !!r._internalReader?._readAloudManager?.active),
    paused: safe(() => !!r._internalReader?._readAloudManager?.paused),
  })), []);
  out.errorsNow = safe(() => Zotero.getErrors().length);
  out.ok = out.rowsBack !== false && out.webdavRestored !== false
    && Object.values(out.verify).every(v => v.hasMatches && v.valueMatches)
    && out.documentVoicesEqual !== false;
  return JSON.stringify(out);
})();
