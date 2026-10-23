// Check 7, first half: with every fixture player closed, disable the addon
// and prove Zotero's native getPack is back — the imported HTML is
// unavailable again and the bodyless snapshot yields a pack with zero
// blocks. Then attempt Zotero's own Read Aloud on the bodyless snapshot
// (bounded; a session that appears is paused at once): no segments is the
// native expectation; a voice/account failure is reported, not treated as
// HTML evidence. state: reads fx; writes lifecycle7.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fx;
  const out = { step: 'lifecycle-disable' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const win = Zotero.getMainWindow();
  const T = win.Zotero_Tabs;
  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const chromeRequire = (name) => Reflect.apply(Zotero.getMainWindow().require, Zotero.getMainWindow(), [name]);

  // 1. Close every player on THIS RUN's own fixtures only. An owner session
  // that would block disabling is never closed silently: it is reported and
  // the run stops there for a workflow-approved decision.
  const ownedIds = new Set([...Object.values(state.fx || {}), ...Object.values(state.fx2 || {})].filter((r) => r && r.id).map((r) => r.id));
  const playersClosed = [], ownerSessions = [];
  for (const r of (Zotero.Reader._readers || []).slice()) {
    const internal = waive(r._internalReader);
    const m = waive(internal._readAloudManager);
    if (!m?.active) continue;
    if (!ownedIds.has(r.itemID)) { ownerSessions.push({ itemID: r.itemID, voice: m.selectedVoiceID ?? null }); continue; }
    try { internal.toggleReadAloudPopup(false); playersClosed.push(r.itemID); } catch (e) { out['closeErr' + r.itemID] = String(e); }
  }
  out.playersClosed = playersClosed;
  out.ownerActiveSessions = ownerSessions;
  if (ownerSessions.length) {
    out.ok = false;
    out.blocked = 'an owner Read Aloud session is active; disabling the addon needs a workflow-approved close/report first';
    return JSON.stringify(out, null, 1);
  }
  await sleep(800);
  out.anyActiveBefore = (Zotero.Reader._readers || []).some((r) => !!waive(r._internalReader?._readAloudManager)?.active);

  // 2. Disable the addon.
  const AM = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.addonVersionBefore = addon?.version ?? null;
  await addon.disable();
  await sleep(1500);
  const addonAfter = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.addonActiveAfterDisable = addonAfter?.isActive ?? null;

  // 3. Native getPack is back.
  const importedPack = await Zotero.SDT.getPack(fx.bodylessImported.id);
  out.importedNative = { ok: !!importedPack?.ok, reason: importedPack?.reason ?? null };
  const snapshotPack = await Zotero.SDT.getPack(fx.bodylessSnapshot.id);
  let snapshotBlocks = null;
  if (snapshotPack?.ok) {
    try {
      const module = chromeRequire('resource://zotero/document-worker/structured-document-text.js');
      const pako = chromeRequire('pako');
      const reader = await module.openStructuredDocumentTextPack(snapshotPack.bytes, { inflate: (bytes) => pako.inflateRaw(bytes) });
      snapshotBlocks = reader.getTopLevelBlockCount();
    } catch (e) { snapshotBlocks = 'ERR ' + String(e); }
  }
  out.snapshotNative = { ok: !!snapshotPack?.ok, blocks: snapshotBlocks };

  // 4. Zotero's own Read Aloud attempt on the bodyless snapshot tab.
  const itemID = fx.bodylessSnapshot.id;
  let reader = findReader(itemID);
  if (!reader) {
    const opened = Zotero.Reader.open(itemID);
    if (opened && typeof opened.then === 'function') await opened;
    const t = Date.now();
    while (Date.now() - t < 24000 && !(reader = findReader(itemID))?.['_internalReader']) await sleep(250);
  }
  if (!reader?._internalReader) throw new Error('snapshot tab did not open');
  if (T.selectedID !== reader.tabID) T.select(reader.tabID);
  await sleep(800);
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  out.builtin = { managerPresent: !!manager, activeBefore: !!manager?.active };
  if (manager && !manager.active) {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    try { internal.toggleReadAloudPopup(true); } catch (e) { out.builtin.toggleError = String(e); }
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      if (manager.active) {
        if (!manager.paused) { try { manager.togglePaused(); } catch (e) { /* held */ } }
        break;
      }
    }
    out.builtin.activated = !!manager.active;
    out.builtin.segments = manager.segments ? (Number(waive(manager.segments)?.length) || 0) : (manager.segments === null ? 'null' : 'undefined');
    out.builtin.voice = manager.selectedVoiceID ?? null;
    out.builtin.error = String(manager.error ?? 'null');
    try { if (manager.active) internal.toggleReadAloudPopup(false); } catch (e) { out.builtin.closeErr = String(e); }
  }
  await sleep(500);
  out.anyActiveAfter = (Zotero.Reader._readers || []).some((r) => !!waive(r._internalReader?._readAloudManager)?.active);

  out.ok = out.addonActiveAfterDisable === false
    && out.importedNative.ok === false && out.importedNative.reason === 'unavailable'
    && out.snapshotNative.ok === true && out.snapshotNative.blocks === 0
    && out.anyActiveAfter === false;
  return JSON.stringify(out, null, 1);
})()
