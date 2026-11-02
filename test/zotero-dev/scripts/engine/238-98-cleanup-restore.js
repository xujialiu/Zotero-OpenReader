// Issue #238 cleanup: the fixtures out, every named pref put back from the FIRST
// snapshot (238-01's baseline238, never the current values), the document-voice
// branch back to its set, the settings-sync stamps back (238-06's syncState238),
// the owner's tab compared with its baseline (read only), the window's tab
// reselected and the host minimized. Nothing here plays, pauses or scrolls the
// owner's tab. Order: players closed (toggleReadAloudPopup(false) only), fixture
// items erased, the position store settled, the document-voice branch, then the
// prefs -- local.enabled off BEFORE local.baseURL goes back to the owner's server,
// the native voice memory (extensions.zotero.reader.readAloudVoices), readAloud.memory
// (the last setting written; written only when it differs, an unchanged value
// notifies no observer) and last the sync bookkeeping (webdav.syncState: every
// restore above re-stamps its key, this puts the stamps back; it cannot move
// readAloud.memory, which is verified again after it). A second look 1.5 s later
// catches a reader observer that re-persists over a restore.
// Nothing secret is printed: booleans and lengths. The debug store is restored by
// 238-99, after the errors are read.
// params: ownerTabID. state: reads baseline238, docVoices238, syncState238, owner238,
// ownerAfter238, window238, fixtures, posBeforeRows; writes cleanup238.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const p = Services.prefs;
  const ZT = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mask = (v) => String(v ?? '').replace(/[0-9a-f]{32}/gi, (h) => h.slice(0, 4) + '…' + h.slice(-4));
  const out = { step: '238-98-cleanup-restore', at: new Date().toISOString(), errors: [] };
  const b = S.baseline238;
  if (!b || !S.window238 || !S.docVoices238) throw new Error('the first snapshot is not in state: restore by hand from .tmp/zotero-dev/<runId>/baseline-private.json');
  const ownerTab = P.ownerTabID || 'tab-ZEnh2nCY';

  const readRec = (full) => {
    const type = p.getPrefType(full);
    let value = null;
    try {
      if (type === p.PREF_STRING) value = p.getStringPref(full);
      else if (type === p.PREF_INT) value = p.getIntPref(full);
      else if (type === p.PREF_BOOL) value = p.getBoolPref(full);
    } catch (e) { /* no value */ }
    return { full, type, user: p.prefHasUserValue(full), value };
  };
  const restore = (rec) => {
    if (!rec.user) { if (p.prefHasUserValue(rec.full)) p.clearUserPref(rec.full); return; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.full, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(rec.full, Number(rec.value));
    else if (rec.type === p.PREF_STRING) p.setStringPref(rec.full, String(rec.value ?? ''));
  };
  const same = (rec) => { const now = readRec(rec.full); return now.user === rec.user && (!rec.user || now.value === rec.value); };
  const owner = async () => {
    const r = (Zotero.Reader._readers || []).find((x) => x.tabID === ownerTab);
    if (!r) return { gone: true };
    const ir = r._internalReader; const m = ir._readAloudManager;
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const e = eng.readers.find((x) => x.itemID === r.itemID) || {};
    return {
      active: m.active, paused: m.paused, voice: mask(String(m.selectedVoiceID || '')), tier: m.selectedTier, error: m.error || null,
      popupOpen: !!(ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen),
      position: e.session && e.session.position, sessionPaused: e.session && e.session.paused, playing: e.session && e.session.playing,
      audio: e.audio && e.audio.state, requests: e.session && e.session.store && e.session.store.requests, adopted: e.stats && e.stats.adopted,
    };
  };

  // --- 1. fixtures: players closed, tabs closed, items erased
  const fixtures = Object.entries(S.fixtures || {}).map(([label, f]) => ({ label, itemID: f.itemID, key: f.key }));
  out.fixtures = [];
  for (const f of fixtures) {
    const row = { label: f.label, itemID: f.itemID };
    const r = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    if (r) {
      try { r._internalReader.toggleReadAloudPopup(false); } catch (e) { out.errors.push('popup close ' + f.label + ': ' + e); }
      await sleep(400);
      try { r._window.Zotero_Tabs.close(r.tabID); } catch (e) { out.errors.push('tab close ' + f.label + ': ' + e); }
      for (let i = 0; i < 50 && (Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID); i++) await sleep(200);
    }
    row.readerGone = !(Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID);
    out.fixtures.push(row);
  }
  for (const f of fixtures) {
    const row = out.fixtures.find((x) => x.label === f.label);
    try {
      const item = Zotero.Items.get(f.itemID);
      if (item) { await item.eraseTx(); row.erased = true; } else row.erased = 'absent';
    } catch (e) { row.erased = false; out.errors.push('erase ' + f.label + ': ' + e); }
    row.itemGone = !Zotero.Items.get(f.itemID);
  }
  // The position store settles before the prefs move
  for (let i = 0; i < 75; i++) {
    try { const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); if (pos.store && pos.store.queued === 0 && pos.store.writing === false) break; } catch (e) { /* retry */ }
    await sleep(200);
  }

  // --- 2. the document-voice branch back to its set
  const dvNow = p.getChildList(ZT + 'documentVoices.');
  let dvCleared = 0, dvRewritten = 0;
  for (const n of dvNow) if (!(n in S.docVoices238)) { p.clearUserPref(n); dvCleared++; }
  for (const [n, v] of Object.entries(S.docVoices238)) {
    if (!p.prefHasUserValue(n) || p.getStringPref(n) !== v) { p.setStringPref(n, v); dvRewritten++; }
  }
  out.documentVoices = { snapshot: Object.keys(S.docVoices238).length, clearedExtra: dvCleared, rewritten: dvRewritten };

  // --- 3. the prefs, from the first snapshot; the provider switch off before its address goes back
  const order = ['volume', 'webdav', 'docVoicePulse', 'localEnabled', 'localBaseURL', 'defaultVoice', 'nativeVoices'];
  for (const k of order) {
    try { restore(b[k]); } catch (e) { out.errors.push('restore ' + k + ': ' + e); }
  }
  await sleep(600);
  try { if (!same(b.memory)) restore(b.memory); } catch (e) { out.errors.push('restore memory: ' + e); }
  // The sync bookkeeping, after every setting (each restore above re-stamped its key)
  const ss = S.syncState238;
  try {
    const full = ZT + 'webdav.syncState';
    if (ss.hasUser) p.setStringPref(full, ss.value); else if (p.prefHasUserValue(full)) p.clearUserPref(full);
  } catch (e) { out.errors.push('restore syncState: ' + e); }

  // --- 4. a second look after the observers have run
  await sleep(1500);
  const verdict = {};
  for (const k of [...order, 'memory']) verdict[k] = same(b[k]);
  verdict.webdavEnabledOff = Zotero.Prefs.get('zotero-tts.webdav.enabled') === false && !p.prefHasUserValue(ZT + 'webdav.enabled');
  {
    const full = ZT + 'webdav.syncState';
    verdict.syncState = p.prefHasUserValue(full) === ss.hasUser && (!ss.hasUser || p.getStringPref(full) === ss.value);
  }
  {
    const nowSet = p.getChildList(ZT + 'documentVoices.');
    verdict.documentVoices = nowSet.length === Object.keys(S.docVoices238).length && nowSet.every((n) => n in S.docVoices238 && p.getStringPref(n) === S.docVoices238[n]);
  }
  out.prefs = verdict;
  out.volumeNow = readRec(b.volume.full).value;
  out.localEnabledNow = { value: readRec(b.localEnabled.full).value, user: readRec(b.localEnabled.full).user };
  try { out.positionSyncFolder = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder; } catch (e) { out.errors.push('positionSync: ' + e); }
  try { const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); out.positionRows = { baseline: S.posBeforeRows, now: pos.database && pos.database.rows, legacyPref: pos.legacyPref }; } catch (e) { out.errors.push('position: ' + e); }
  out.readersOpen = (Zotero.Reader._readers || []).map((r) => r.tabID);

  // --- 5. the owner's tab (read only) against its baseline and its post-install state
  const o = await owner();
  const o0 = (S.owner238 || []).find((x) => x.tabID === ownerTab);
  const o1 = S.ownerAfter238;
  out.owner = {
    now: o,
    equalsBaseline: !!(o0 && o.active === o0.active && o.paused === o0.paused && o.voice === mask(o0.voice) && o.tier === o0.tier && o.popupOpen === o0.popupOpen && o.position === (o0.engine && o0.engine.session && o0.engine.session.position) && o.sessionPaused === true && o.playing === false && o.error === null),
    equalsPostInstall: !!(o1 && o.active === o1.active && o.paused === o1.paused && o.voice === mask(o1.voice) && o.position === o1.position && o.sessionPaused === o1.sessionPaused && o.playing === o1.playing && o.requests === o1.requests && o.adopted === o1.adopted),
  };

  // --- 6. the window: the owner's tab selected again, the host minimized
  const win = Zotero.getMainWindow();
  try { if (S.window238.selectedTab && win.Zotero_Tabs.selectedID !== S.window238.selectedTab) win.Zotero_Tabs.select(S.window238.selectedTab); } catch (e) { out.errors.push('tab select: ' + e); }
  try { if (win.windowState !== 2) win.minimize(); } catch (e) { out.errors.push('minimize: ' + e); }
  await sleep(900);
  out.window = { windowState: win.windowState, selectedTab: win.Zotero_Tabs.selectedID, baselineSelectedTab: S.window238.selectedTab, hidden: win.document.hidden };
  out.clean = out.errors.length === 0 && Object.values(verdict).every(Boolean) && out.fixtures.every((x) => x.readerGone && x.itemGone) && out.positionSyncFolder === false
    && out.positionRows.now === out.positionRows.baseline && out.owner.equalsPostInstall && out.window.windowState === 2 && out.window.selectedTab === S.window238.selectedTab;
  S.cleanup238 = out;
  return JSON.stringify(out, null, 1);
})();
