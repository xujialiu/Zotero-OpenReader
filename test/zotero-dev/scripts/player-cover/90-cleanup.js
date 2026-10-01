// Cleanup: close both fixture readers' find/selection/session, erase the
// fixtures, clear the documentVoices.user/<key> records opening a player
// wrote, confirm position rows back to baseline, restore every touched
// pref (documentVoiceChanged with the rest, readAloud.memory, then Zotero's
// readAloudVoices last, byte-identical using the FULL values 01-baseline
// kept in state), scan the debug store for [zotero-tts]/dead-object lines,
// restore Debug.storing to its baseline, then the selected tab and the
// window: minimized last, per the workflow's own exception.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };
  const restore = (k, snap) => {
    if (snap.hasUser) Zotero.Prefs.set(PREFIX + k, snap.value);
    else { try { Services.prefs.clearUserPref(FULL(k)); } catch (e) {} }
    return { key: k, nowValue: get(k), nowHasUser: hasUser(k), matchesValue: get(k) === snap.value, matchesHasUser: hasUser(k) === snap.hasUser };
  };

  const report = { readers: {} };

  for (const kind of Object.keys(state.fixtures)) {
    const itemID = state.fixtures[kind].itemID;
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
    if (!reader) { report.readers[kind] = { found: false }; continue; }
    const ir = reader._internalReader;
    try { ir.toggleFindPopup({ primary: true, open: false }); } catch (e) {}
    try { ir.toggleFindPopup({ primary: false, open: false }); } catch (e) {}
    try { Components.utils.waiveXrays(ir._primaryView)._setSelectionRanges(undefined); } catch (e) {}
    try { ir.disableSplitView(); } catch (e) {}
    const m = ir._readAloudManager;
    if (m && m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    try { ir.toggleReadAloudPopup(false); } catch (e) {}
    const closed = await wait(() => !ir._readAloudManager?.active ? true : null, 8000);
    try { host.Zotero_Tabs.close(reader.tabID); } catch (e) {}
    report.readers[kind] = { found: true, closedActive: closed };
  }
  await sleep(300);
  report.readersRemainingForFixtures = (Zotero.Reader._readers || []).filter((r) => Object.values(state.fixtures).some((f) => f.itemID === r.itemID)).length;

  for (const kind of Object.keys(state.fixtures)) {
    const it = Zotero.Items.get(state.fixtures[kind].itemID);
    if (it) await it.eraseTx();
  }

  // Opening a player on a fixture writes documentVoices.user/<key>; clear it.
  report.documentVoices = {};
  for (const kind of Object.keys(state.fixtures)) {
    const recordName = 'extensions.zotero.zotero-tts.documentVoices.user/' + state.fixtures[kind].key;
    const existed = (() => { try { return Services.prefs.prefHasUserValue(recordName); } catch (e) { return null; } })();
    try { Services.prefs.clearUserPref(recordName); } catch (e) {}
    report.documentVoices[kind] = { existed, gone: (() => { try { return !Services.prefs.prefHasUserValue(recordName); } catch (e) { return null; } })() };
  }

  const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  report.posBeforeRows = state.posBeforeRows;
  report.posAfterRows = posAfter && posAfter.database ? posAfter.database.rows : null;
  report.rowsBackToBaseline = report.posAfterRows === report.posBeforeRows;

  // Debug store scan, before turning it back off.
  const debugText = await Zotero.Debug.get();
  const lines = String(debugText || '').split('\n');
  const zttsLines = lines.filter((l) => l.includes('[zotero-tts]') || l.includes('zotero-tts.js'));
  const deadObjectLines = lines.filter((l) => l.includes("can't access dead object"));
  report.debug = { totalLines: lines.length, zttsLineCount: zttsLines.length, zttsSample: zttsLines.slice(0, 5), deadObjectCount: deadObjectLines.length };

  // Prefs: restore in order, memory last, byte-identical.
  const results = {};
  results['readAloud.volume'] = restore('readAloud.volume', state.baseline['readAloud.volume']);
  results['readAloud.playerLayout'] = restore('readAloud.playerLayout', state.baseline['readAloud.playerLayout']);
  results['readAloud.usePluginPlayer'] = restore('readAloud.usePluginPlayer', state.baseline['readAloud.usePluginPlayer']);
  results['readAloud.autoScrollMode'] = restore('readAloud.autoScrollMode', state.baseline['readAloud.autoScrollMode']);
  results['readAloud.keepFollowingWhileVisible'] = restore('readAloud.keepFollowingWhileVisible', state.baseline['readAloud.keepFollowingWhileVisible']);
  const memSnap = state.baseline['readAloud.memory'];
  const memFull = state.readAloudMemoryFullValue;
  if (memSnap.hasUser) Zotero.Prefs.set(PREFIX + 'readAloud.memory', memFull);
  else { try { Services.prefs.clearUserPref(FULL('readAloud.memory')); } catch (e) {} }
  const memNow = get('readAloud.memory');
  results['readAloud.memory'] = { matchesValue: memNow === memFull, matchesHasUser: hasUser('readAloud.memory') === memSnap.hasUser, byteIdentical: memNow === memFull };

  // Debug store back to its baseline (on or off as found).
  if (Zotero.Debug.storing !== state.debugStoring) Zotero.Debug.setStore(state.debugStoring);
  report.debugStoring = { baseline: state.debugStoring, now: Zotero.Debug.storing };

  // Full-name prefs: documentVoiceChanged with the rest; Zotero's own
  // readAloudVoices LAST of every pref -- a chrome write of it is a voice
  // pick to memory-sync's observer, which may re-touch readAloud.memory, so
  // memory is re-verified byte-identical afterwards.
  report.prefsFull = {};
  const dvc = state.prefsFull['extensions.zotero.zotero-tts.documentVoiceChanged'];
  if (dvc.hasUser) Zotero.Prefs.set('extensions.zotero.zotero-tts.documentVoiceChanged', dvc.value, true);
  else { try { Services.prefs.clearUserPref('extensions.zotero.zotero-tts.documentVoiceChanged'); } catch (e) {} }
  report.prefsFull['extensions.zotero.zotero-tts.documentVoiceChanged'] = { matchesValue: Zotero.Prefs.get('extensions.zotero.zotero-tts.documentVoiceChanged', true) === dvc.value, matchesHasUser: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.documentVoiceChanged') === dvc.hasUser };
  const rav = state.prefsFull['extensions.zotero.reader.readAloudVoices'];
  if (rav.hasUser) Zotero.Prefs.set('extensions.zotero.reader.readAloudVoices', rav.value, true);
  else { try { Services.prefs.clearUserPref('extensions.zotero.reader.readAloudVoices'); } catch (e) {} }
  report.prefsFull['extensions.zotero.reader.readAloudVoices'] = { matchesValue: Zotero.Prefs.get('extensions.zotero.reader.readAloudVoices', true) === rav.value, matchesHasUser: Services.prefs.prefHasUserValue('extensions.zotero.reader.readAloudVoices') === rav.hasUser };
  const memAfter = get('readAloud.memory');
  report.memoryAfterVoicesRestore = { byteIdentical: memAfter === memFull, matchesHasUser: hasUser('readAloud.memory') === memSnap.hasUser };

  // Owner readers untouched, still present with the same active/paused state.
  report.ownerReaders = (state.ownerReaders || []).map((ow) => {
    const r = (Zotero.Reader._readers || []).find((x) => x.itemID === ow.itemID);
    if (!r) return { itemID: ow.itemID, present: false };
    return { itemID: ow.itemID, present: true, active: !!r._internalReader?._readAloudManager?.active, paused: !!r._internalReader?._readAloudManager?.paused, activeBefore: ow.active, pausedBefore: ow.paused };
  });

  report.prefResults = results;
  report.settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');

  // Selected tab back to its baseline pick, then minimized (the owner's
  // explicit exception; the window's own bounds were never changed).
  if (state.selectedTabBaseline) { try { host.Zotero_Tabs.select(state.selectedTabBaseline); } catch (e) {} }
  await sleep(200);
  try { host.minimize(); } catch (e) {}
  await sleep(200);
  report.windowState = host.windowState;
  return JSON.stringify(report, null, 1);
})();
