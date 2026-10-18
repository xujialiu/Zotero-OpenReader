// Case item 2 (final form): the fixture view at page 1, volume 0, a trusted
// Shift+Space — the resume pulls first (`position sync (resume)`) and the
// first segment read is page 4's crafted sentence, not the page in view. The
// session's voice is switched to a non-metered System voice while the manager
// is active, then reading stops. Requires the 13a reset + reinstall before it.
(async () => {
  const out = { trace: [] };
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const p = Services.prefs;
  const realKey = 'extensions.zotero.zotero-tts.webdav.syncPositions';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;

  // Guards: the store still holds the craft, the reader is attached.
  const position = JSON.parse(await d.position());
  const mine0 = (position.readers || []).find((r) => r.itemID === f.itemID) || null;
  out.storedPos = mine0?.stored ?? null;
  if (!mine0?.stored || JSON.stringify(mine0.stored) !== JSON.stringify(s.craftPos)) throw new Error('store does not hold the crafted point — run 13a + reinstall first');

  // The switch on; its poke settles before the press.
  p.setBoolPref(realKey, true);
  const swStart = Date.now();
  while (Date.now() - swStart < 30000) {
    await sleep(600);
    const st = JSON.parse(await d.positionSync());
    if (st.transport?.running === false && st.shared?.transport?.running === false && st.transport?.lastTrigger === 'switch-on') break;
  }
  out.volume = p.getIntPref('extensions.zotero.zotero-tts.readAloud.volume');
  if (out.volume !== 0) throw new Error('volume is not 0');

  // The System voice id, off the provider listing (used after the start).
  const sysDiag = JSON.parse(await d.systemProvider());
  const sysVoice = (sysDiag.voices || []).find((v) => /en[-_]/i.test(v.id) && /samantha|daniel/i.test(v.name || v.id))
    || (sysDiag.voices || []).find((v) => /en[-_]/i.test(v.id))
    || (sysDiag.voices || [])[0] || null;
  if (!sysVoice) throw new Error('no System voice listed');
  out.sysVoiceName = String(sysVoice.name ?? '');

  const win = Zotero.getMainWindow();
  // The earlier attempt's session paused while the host stayed minimized —
  // this check needs a live window: restore it, and minimize again at the end.
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(800); }
  out.hostRestored = host ? host.windowState !== 2 : null;
  const reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
  if (!reader?._internalReader?._readAloudManager) throw new Error('fixture reader not attached');
  win.Zotero_Tabs.select(reader.tabID);
  win.focus();
  await sleep(600);
  out.tabSelected = win.Zotero_Tabs.selectedID === String(reader.tabID);

  // A leftover session closes; Shift+Space must be a fresh resume.
  const preM = waive(reader._internalReader._readAloudManager);
  if (preM?.active) {
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(1500);
    out.closedStaleSession = true;
  }

  // The view to page 1, and the page it reports.
  const view = waive(reader._internalReader._primaryView);
  try { view.navigateToFirstPage(); out.scrolled = true; } catch (e) { out.scrollError = String(e).slice(0, 80); }
  await sleep(1000);
  out.pageAfterScroll = (() => {
    try {
      const st = reader._internalReader._state?.viewStats ?? null;
      if (st && typeof st.pageIndex === 'number') return st.pageIndex;
    } catch {}
    try { const w = waive(reader._internalReader._primaryView); if (typeof w._stats?.pageIndex === 'number') return w._stats.pageIndex; } catch {}
    return null;
  })();

  // Zotero's own first segment, for the negative check.
  let firstSegmentText = null;
  try {
    const segs = waive(reader._internalReader._readAloudSegments?.segments);
    if (segs && segs.length) firstSegmentText = String(waive(segs[0]).text ?? '').slice(0, 60);
  } catch {}
  out.zoteroFirstSegment = firstSegmentText;

  const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const before = (await linesNow()).length;

  // Trusted Shift+Space.
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(win);
  const key = (k, code, keyCode, shift) => new win.KeyboardEvent('', { key: k, code, keyCode, shiftKey: !!shift });
  tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
  out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
  tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
  tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));

  const started = Date.now();
  let seg = null;
  let segPageIndex = null;
  while (Date.now() - started < 25000) {
    const m = reader?._internalReader?._readAloudManager ?? null;
    const w = m ? waive(m) : null;
    const active = w?.activeSegment ?? null;
    if (active && typeof active.text === 'string' && active.text !== seg) {
      seg = active.text;
      const sp = active.sourcePosition ?? null;
      segPageIndex = typeof sp?.pageIndex === 'number' ? sp.pageIndex : null;
      out.trace.push(`${Date.now() - started} ms segment (pageIndex ${segPageIndex}): ${String(seg).slice(0, 70)}`);
      if (segPageIndex !== null) break;
    }
    await sleep(250);
  }
  out.firstSegmentText = seg === null ? null : String(seg).slice(0, 90);
  out.firstSegmentPageIndex = segPageIndex;
  out.newLines = (await linesNow()).slice(before);
  const resumeIdx = out.newLines.findIndex((l) => l.includes('position sync (resume)'));
  out.resumeLineFirst = resumeIdx !== -1;
  out.resumeLine = resumeIdx !== -1 ? out.newLines[resumeIdx] : null;

  // The session's voice becomes a non-metered System voice (pick with the
  // manager active, so it survives activation).
  const m = reader?._internalReader?._readAloudManager ?? null;
  const w = m ? waive(m) : null;
  if (w?.active && sysVoice) {
    try {
      w.selectTier('system');
      await sleep(500);
      w.selectVoice('system::' + sysVoice.id);
      await sleep(2500);
    } catch (e) { out.voicePickError = String(e).slice(0, 120); }
    out.voiceAfterPick = String(waive(m).selectedVoiceID ?? '').slice(0, 48);
  }

  // Stop reading; the pause/stop sync carries the newer ts.
  if (m?.active) {
    reader._internalReader.toggleReadAloudPopup(false);
    out.stopped = true;
    await sleep(4000);
  }
  const stopM = reader?._internalReader?._readAloudManager ?? null;
  out.managerFinal = { active: !!stopM?.active };
  const pos = JSON.parse(await d.positionSync());
  out.afterStop = { ownTrigger: pos.transport?.lastTrigger, ownOutcome: pos.transport?.lastOutcome, ownUploaded: pos.transport?.uploaded, localEntries: pos.localEntries };
  out.stopLines = (await linesNow()).filter((l) => l.includes('position sync (')).slice(-3);
  if (host) { try { host.minimize(); } catch {} }
  await sleep(400);
  out.hostMinimizedAgain = host ? host.windowState === 2 : null;
  return JSON.stringify(out);
})()
