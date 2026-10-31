// Cleanup, fixture scope only, fail closed. The owner's reader, its tab and its
// session are never touched (its Player stays closed, as 02 left it). Steps:
//  1. the Players of FIXTURE readers closed (toggleReadAloudPopup(false)), their tabs closed;
//  2. the fixture items erased (the snapshot's disposable parent cascades its child);
//  3. the Document voice records back to the baseline set: the fixtures' keys cleared, any
//     other changed or missing record put back verbatim;
//  4. every pref of the 01 snapshot restored by its exact full name — value, type and user
//     flag; Zotero's native voice map second to last (a write to it is a voice pick to
//     memory-sync's observer) and readAloud.memory last; observers get 2.5 s, then ONE
//     synchronous audit rereads every captured pref and the Document voice branch, and
//     one retry follows only if the audit disagrees;
//  5. the WebDAV folder switch back to its exact snapshot (00), the debug store back to
//     what it was, the owner's tab reselected, the window minimized;
//  6. the owner's saved position, Document voice record and idle session compared with 02.
// Never prints a credential: no provider key is in the snapshot.
// params: none. state: reads baseline, webdav, fx, owner; writes cleanupOk.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'cleanup' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const P = 'extensions.zotero.zotero-tts.';
  const win = Zotero.getMainWindow();
  const base = state.baseline;
  if (!base || !state.webdav || !state.fx) { out.ok = false; out.stop = 'no baseline / webdav / fixture snapshot; nothing touched'; return JSON.stringify(out, null, 1); }

  // 1. Fixture Players and tabs.
  const fixtureIds = new Set(Object.values(state.fx).map((r) => r.id));
  const keys = new Set(Object.values(state.fx).map((r) => r.key));
  out.closed = [];
  for (const r of (Zotero.Reader._readers || []).slice()) {
    if (!fixtureIds.has(r.itemID)) continue;
    try {
      const internal = waive(r._internalReader);
      if (waive(internal._readAloudManager)?.active) { internal.toggleReadAloudPopup(false); for (let i = 0; i < 24 && waive(internal._readAloudManager).active; i++) await sleep(250); }
      await sleep(300);
      win.Zotero_Tabs.close(r.tabID);
      out.closed.push(r.itemID);
    } catch (e) { out['closeError' + r.itemID] = String(e); }
    await sleep(400);
  }
  for (let i = 0; i < 50 && (Zotero.Reader._readers || []).some((r) => fixtureIds.has(r.itemID)); i++) await sleep(200);
  out.fixtureReadersLeft = (Zotero.Reader._readers || []).filter((r) => fixtureIds.has(r.itemID)).length;

  // 2. Erase the fixture items (parent first: it cascades its child).
  out.erased = []; out.eraseErrors = [];
  const order = [state.fx.parent?.id, state.fx.epub?.id, state.fx.snapshot?.id].filter(Boolean);
  for (const id of order) {
    try { const item = Zotero.Items.get(id); if (item) { await item.eraseTx(); out.erased.push(id); } } catch (e) { out.eraseErrors.push(id + ': ' + String(e)); }
  }
  out.itemsRemaining = order.filter((id) => Zotero.Items.get(id)).length;

  // 3. Document voice records.
  const dvPrefix = P + 'documentVoices.';
  const readPref = (full) => {
    const t = Services.prefs.getPrefType(full);
    if (t === 0) return { type: 'none', value: null, user: false };
    const value = t === 32 ? Services.prefs.getStringPref(full) : t === 64 ? Services.prefs.getIntPref(full) : Services.prefs.getBoolPref(full);
    return { type: ({ 32: 'str', 64: 'int', 128: 'bool' })[t], value, user: Services.prefs.prefHasUserValue(full) };
  };
  const same = (a, b) => a.type === b.type && a.value === b.value && a.user === b.user;
  const writePref = (full, snap) => {
    if (snap.type === 'none' || !snap.user) { if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); return; }
    if (snap.type === 'int') Services.prefs.setIntPref(full, snap.value);
    else if (snap.type === 'bool') Services.prefs.setBoolPref(full, snap.value);
    else Services.prefs.setStringPref(full, snap.value);
  };
  const dvAudit = () => {
    const now = Services.prefs.getChildList(dvPrefix).filter((n) => n !== dvPrefix);
    const foreign = now.filter((n) => !(n in base.documentVoices));
    const missing = Object.keys(base.documentVoices).filter((n) => !now.includes(n));
    const changed = Object.keys(base.documentVoices).filter((n) => now.includes(n) && !same(readPref(n), base.documentVoices[n]));
    return { foreign, missing, changed };
  };
  let dv = dvAudit();
  out.documentVoicesFoundForeign = dv.foreign.map((n) => n.slice(dvPrefix.length));
  out.documentVoicesFoundChanged = dv.changed.map((n) => n.slice(dvPrefix.length));
  for (const n of dv.foreign) if (keys.has(n.split('/').pop())) Services.prefs.clearUserPref(n); // fixture keys only
  for (const n of dv.changed.concat(dv.missing)) writePref(n, base.documentVoices[n]);

  // 4. The snapshot, by exact full name. Order: everything, the native voice map, memory last.
  const NATIVE = 'extensions.zotero.reader.readAloudVoices';
  const MEMORY = P + 'readAloud.memory';
  const names = Object.keys(base.prefs);
  const ordered = [...names.filter((n) => n !== NATIVE && n !== MEMORY), NATIVE, MEMORY];
  out.changedByRun = names.filter((n) => !same(readPref(n), base.prefs[n])).map((n) => n.replace(P, 'tts:').replace('extensions.zotero.', 'z:'));
  const restoreAll = () => { for (const n of ordered) if (!same(readPref(n), base.prefs[n])) writePref(n, base.prefs[n]); };
  restoreAll();
  await sleep(2500); // observers (memory-sync, volume, ...) settle
  const audit = () => ({ prefs: names.filter((n) => !same(readPref(n), base.prefs[n])), dv: dvAudit() });
  let a = audit();
  out.retried = false;
  if (a.prefs.length || a.dv.foreign.length || a.dv.missing.length || a.dv.changed.length) {
    out.retried = true;
    for (const n of a.dv.foreign) Services.prefs.clearUserPref(n);
    for (const n of a.dv.changed.concat(a.dv.missing)) writePref(n, base.documentVoices[n]);
    restoreAll();
    await sleep(2500);
    a = audit();
  }

  // 5. WebDAV switch, debug store, tab, window.
  const full = P + 'webdav.enabled';
  if (state.webdav.user) Services.prefs.setBoolPref(full, !!state.webdav.value); else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.webdav = { value: Services.prefs.getBoolPref(full, false), user: Services.prefs.prefHasUserValue(full), snapshot: state.webdav, folder: sync.folder, matches: Services.prefs.getBoolPref(full, false) === state.webdav.value && Services.prefs.prefHasUserValue(full) === state.webdav.user };
  try { if (base.window.selectedTab && (win.Zotero_Tabs._tabs || []).some((t) => t.id === base.window.selectedTab)) win.Zotero_Tabs.select(base.window.selectedTab); } catch (e) { out.tabError = String(e); }
  await sleep(600);
  out.selectedTab = { now: win.Zotero_Tabs.selectedID, baseline: base.window.selectedTab, same: win.Zotero_Tabs.selectedID === base.window.selectedTab };

  // 6. The owner's reader against 02's record.
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const row = (pos.readers || []).find((r) => r.itemID === state.owner?.itemID) ?? null;
  const before = state.owner?.before?.position?.row ?? null;
  const dvDiag = JSON.parse(Zotero.ZoteroTTS.diagnostics.documentVoices());
  const ownerKey = 'user/' + Zotero.Items.get(state.owner.itemID).key;
  const ownerDv = (dvDiag.readers || []).find((r) => r.key === ownerKey) ?? null;
  out.owner = {
    readerOpen: !!row, active: row?.active ?? null,
    storedSame: !!row && !!before && JSON.stringify(row.stored) === JSON.stringify(before.stored),
    zoteroPersistedSame: !!row && !!before && JSON.stringify(row.zoteroPersisted) === JSON.stringify(before.zoteroPersisted),
    documentRecordSame: JSON.stringify(ownerDv?.saved ?? null) === JSON.stringify(state.owner.before.documentVoice.saved),
    selectedVoiceSame: ownerDv?.selected === state.owner.before.voice,
  };
  out.positionRows = { now: pos.database?.rows ?? null, baseline: base.positionRows };

  out.prefAudit = { mismatched: a.prefs.map((n) => n.replace(P, 'tts:').replace('extensions.zotero.', 'z:')), documentVoices: { foreign: a.dv.foreign.length, missing: a.dv.missing.length, changed: a.dv.changed.length } };
  out.volume = { now: readPref(P + 'readAloud.volume'), baseline: base.prefs[P + 'readAloud.volume'] };
  out.defaultVoiceSame = same(readPref(P + 'readAloud.defaultVoice'), base.prefs[P + 'readAloud.defaultVoice']);
  out.memorySame = same(readPref(MEMORY), base.prefs[MEMORY]);
  out.nativeVoiceMapSame = same(readPref(NATIVE), base.prefs[NATIVE]);

  // Debug store last (the log reads are done); then minimize.
  try { if (typeof base.debugStoring === 'boolean') Zotero.Debug.setStore(base.debugStoring); } catch (e) { out.debugError = String(e); }
  out.debugStoring = { now: !!Zotero.Debug.storing, baseline: base.debugStoring };
  try { win.minimize(); } catch (e) { out.minimizeError = String(e); }
  await sleep(600);
  out.windowState = win.windowState;

  out.ok = out.fixtureReadersLeft === 0 && out.eraseErrors.length === 0 && out.itemsRemaining === 0
    && a.prefs.length === 0 && !a.dv.foreign.length && !a.dv.missing.length && !a.dv.changed.length
    && out.webdav.matches && out.webdav.folder === false && out.selectedTab.same
    && out.owner.readerOpen && out.owner.active === false && out.owner.storedSame && out.owner.documentRecordSame && out.owner.selectedVoiceSame
    && out.positionRows.now === out.positionRows.baseline && out.debugStoring.now === out.debugStoring.baseline && out.windowState === 2;
  state.cleanupOk = out.ok === true;
  return JSON.stringify(out, null, 1);
})()
