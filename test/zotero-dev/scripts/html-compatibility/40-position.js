// Check 4, final form: the normal resume action. A fresh idle reopened
// reader (no popup, no manager activation, no selection) gets a TRUSTED
// Shift+Space (nsITextInputProcessor, the plugin-lifecycle 03b recipe).
// smartPlay on an idle manager routes through resumeLastPosition
// (read-aloud-shortcuts.ts:378-412) -> resumeAfterPull (index.ts:1335-1348)
// which consumes the plugin's stored row and calls startReadAloudAtPosition
// (index.ts:1688-1718) - the trace('resume item ... target ...') entry lands
// in diagnostics.position().trace. A setup session first writes the saved
// second-paragraph position (popup start, paused, repositioned, <=1
// sentence); the tested resume is bounded to the same single sentence and
// paused the moment the active position is available. Voice: the configured
// remembered voice (system::osx ... Samantha). params: htmlFixturesDir,
// tmpDir. state: writes fx2.bodyless, pos.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'position-shift-space-resume' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  state.fx2 = state.fx2 || {};
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  win.focus();
  const T = win.Zotero_Tabs;
  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const diagRows = async (itemID) => {
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (pos?.readers || []).find((r) => r.itemID === itemID) ?? null;
    const item = Zotero.Items.get(itemID);
    let persisted = null;
    try { persisted = item.getAttachmentLastReadAloudPosition(); } catch (e) { persisted = 'ERR ' + String(e); }
    return {
      pluginStored: row?.stored ?? null,
      zoteroSavedLive: row?.zoteroSaved ?? null,
      zoteroPersistedSeed: persisted ? JSON.parse(JSON.stringify(persisted)) : persisted,
    };
  };
  const enginePosition = async (itemID) => {
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const row = (rep.readers || []).find((r) => r.itemID === itemID);
    return { position: row?.session?.position ?? null, voice: row?.session?.voice ?? null };
  };

  // Fresh fixture item.
  if (!state.fx2.bodyless) {
    const imported = await Zotero.Attachments.importFromFile({ file: PathUtils.join(p.htmlFixturesDir, 'bodyless.html'), libraryID: Zotero.Libraries.userLibraryID, title: 'ztts228c bodyless' });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    state.fx2.bodyless = { id: item.id, key: item.key, linkMode: item.attachmentLinkMode, contentType: item.attachmentContentType };
  }
  const itemID = state.fx2.bodyless.id;
  out.itemID = itemID;

  // ---- Setup session: write the saved second-paragraph position ----
  let reader = findReader(itemID);
  if (!reader) {
    const opened = Zotero.Reader.open(itemID);
    if (opened && typeof opened.then === 'function') await opened;
    const t = Date.now();
    while (Date.now() - t < 24000 && !(reader = findReader(itemID))?.['_internalReader']) await sleep(250);
  }
  if (!reader?._internalReader) throw new Error('setup tab did not open');
  if (T.selectedID !== reader.tabID) T.select(reader.tabID);
  await sleep(1000);
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  reader._iframeWindow.document.notifyUserGestureActivation?.();
  internal.toggleReadAloudPopup(true);
  let setupActive = false;
  for (let i = 0; i < 80 && !setupActive; i++) {
    await sleep(250);
    setupActive = !!manager.active;
    if (setupActive && !manager.paused) { try { manager.togglePaused(); } catch (e) { /* held */ } }
  }
  if (!setupActive) throw new Error('setup session never activated');
  await sleep(400);
  const segments = [];
  {
    const list = waive(internal._readAloudSegments?.segments);
    for (let i = 0; i < (Number(list?.length) || 0); i++) segments.push(String(waive(list[i])?.text ?? ''));
  }
  const para2 = segments.findIndex((t) => t.startsWith('The second paragraph'));
  out.saved = { para2Index: para2, segmentText: segments[para2] ?? null };
  try { manager.repositionTo(para2); } catch (e) { out.setupRepositionError = String(e); }
  await sleep(400);
  reader._iframeWindow.document.notifyUserGestureActivation?.();
  try { if (manager.paused) manager.togglePaused(); } catch (e) { out.setupPlayError = String(e); }
  await sleep(2000);
  try { if (!manager.paused) manager.togglePaused(); } catch (e) { out.setupPauseError = String(e); }
  await sleep(600);
  try { internal.toggleReadAloudPopup(false); } catch (e) { out.setupCloseError = String(e); }
  await sleep(600);
  out.savedRowBeforeClose = await diagRows(itemID);

  // ---- Close the reader; the tested reopen must be fresh and idle ----
  if (reader.tabID) T.close(reader.tabID);
  for (let i = 0; i < 60 && findReader(itemID); i++) await sleep(200);
  out.setupClosed = !findReader(itemID);
  await sleep(800);
  const opened = Zotero.Reader.open(itemID);
  if (opened && typeof opened.then === 'function') await opened;
  let reopened = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000 && !(reopened = findReader(itemID))?.['_internalReader']) await sleep(250);
  if (!reopened?._internalReader) throw new Error('reader did not reopen');
  if (T.selectedID !== reopened.tabID) T.select(reopened.tabID);
  await sleep(1200);
  const internal2 = waive(reopened._internalReader);
  const manager2 = waive(internal2._readAloudManager);
  out.preKey = {
    idle: !manager2.active,
    popupDisplay: (function () {
      try {
        const popup = reopened._iframeWindow.document.querySelector('.read-aloud-popup');
        return popup ? reopened._iframeWindow.getComputedStyle(popup).display : 'ABSENT';
      } catch (e) { return 'ERR ' + String(e); }
    })(),
    selectionPosition: (function () { try { return internal2._lastView?.getSelectionPosition?.() ?? null; } catch (e) { return 'ERR'; } })(),
  };
  if (out.preKey.idle !== true) throw new Error('reopened reader is not idle before the key');
  out.rowsBeforeResume = await diagRows(itemID);

  // ---- The tested action: a trusted Shift+Space on the idle reader ----
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(win);
  const keyFlags = { shiftKey: true, bubbles: true, cancelable: true };
  tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...keyFlags }));
  const consumed = tip.keydown(new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...keyFlags }));
  tip.keyup(new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...keyFlags }));
  tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...keyFlags }));
  try { tip.endInputTransaction?.(); } catch (e) { /* optional */ }
  out.shiftSpaceConsumed = consumed;

  // Pause the moment the active position is available; one sentence at most.
  let activeAt = null, positionAt = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    await sleep(200);
    if (activeAt === null && manager2.active) activeAt = Date.now() - t1;
    if (activeAt !== null) {
      const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const row = (rep.readers || []).find((r) => r.itemID === itemID);
      const pos = row?.session?.position ?? null;
      if (pos !== null) { positionAt = Date.now() - t1; break; }
    }
  }
  out.resume = { activeAt, positionAt, position: await enginePosition(itemID), paused: !!manager2.paused };
  try { if (!manager2.paused) manager2.togglePaused(); } catch (e) { out.pauseError = String(e); }
  await sleep(600);
  out.resumedSegment = typeof out.resume.position.position === 'number' ? segments[out.resume.position.position] ?? null : null;
  out.rowsAfterResume = await diagRows(itemID);

  // The resume trace: 'resume item ... target ...' in position().trace.
  const posDiag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.traceEntries = (posDiag?.trace || []).filter((t) => t.includes('resume item'));
  out.traceHasThisItem = out.traceEntries.some((t) => t.includes('resume item ' + itemID + ' '));

  try { internal2.toggleReadAloudPopup(false); } catch (e) { out.closeError = String(e); }
  await sleep(500);
  out.sessionClosed = !manager2.active;

  out.savedMatchesResumed = out.saved.para2Index >= 0
    && out.resume.position.position === out.saved.para2Index;
  out.ok = out.shiftSpaceConsumed === 1
    && out.traceHasThisItem
    && out.savedMatchesResumed
    && out.resumedSegment === out.saved.segmentText
    && out.preKey.selectionPosition === null
    && out.sessionClosed;
  return JSON.stringify(out, null, 1);
})()
