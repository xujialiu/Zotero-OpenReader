// Reading guard runs, Close and continue (2026-09-30, run r47; issue #160).
// Disable local (fixture X reads local::af_bella) and press Close and continue:
// local.enabled false right after the same click (no second dialog, no OK-only
// notice); X popupOpen false and active false with its reader still in
// Zotero.Reader._readers (tab open); Y (system) unchanged - open, same
// controller object, same voice, paused. Reports the ms from click to pref write.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const key = name => 'extensions.zotero.zotero-tts.' + name;
  const waitFor = async (fn, ms = 10000, step = 50) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = fn(); if (last) return last; await sleep(step); }
    return null;
  };
  const readers = () => Zotero.Reader._readers || [];
  const byItem = itemID => { for (const r of readers()) if (r?.itemID === itemID) return r; return null; };
  const out = { status: 'FAIL', rows: {} };
  let paneWin = null;
  try {
    const opened = state.opened || [];
    const X = opened[0], Y = opened[1];
    const mA = X.manager, mB = Y.manager;
    // Guarded prep for a re-run from the post-close state: re-enable local (X's player
    // is closed, Y reads system: an unused-provider enable, no question) and restart X.
    if (!p.getBoolPref(key('local.enabled'))) {
      let prepWin = Services.wm.getMostRecentWindow('zotero:pref');
      try { if (prepWin && prepWin.windowState === 2) prepWin.restore(); } catch {}
      try { prepWin?.focus?.(); } catch {}
      try { await prepWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
      await waitFor(() => prepWin.document.getElementById('ztts-enable-local'), 10000, 100);
      const prepDoc = prepWin.document;
      let prepNotice = false;
      const w0 = setInterval(() => { try { if (prepDoc.getElementById('ztts-notice')) prepNotice = true; } catch (e) {} }, 50);
      prepDoc.getElementById('ztts-enable-local').click();
      const prepEnabled = await waitFor(() => p.getBoolPref(key('local.enabled')) === true, 30000, 100);
      clearInterval(w0);
      if (!prepEnabled || prepNotice) throw new Error('prep re-enable failed: ' + JSON.stringify({ prepEnabled, prepNotice }));
      const xPrep = byItem(X.itemID);
      if (!xPrep) throw new Error('X reader is gone during prep');
      const main0 = Zotero.getMainWindow?.();
      try { main0?.Zotero_Tabs?.select(xPrep.tabID); xPrep._iframeWindow?.focus?.(); } catch {}
      xPrep._internalReader.toggleReadAloudPopup(true);
      const tPrep = Date.now();
      while (Date.now() - tPrep < 30000) {
        if (mA.active && !mA.paused) { try { mA.pause(); } catch {} }
        if (mA.active && mA._allVoices?.length && mA._controller && String(mA.selectedVoiceID || '').startsWith('local::')) break;
        await sleep(100);
      }
      const tPrep2 = Date.now();
      while (Date.now() - tPrep2 < 15000) {
        if (mA.active && !mA.paused) { try { mA.pause(); } catch {} }
        if (mA.active && mA.paused && String(mA.selectedVoiceID || '').startsWith('local::')) break;
        await sleep(100);
      }
      if (!mA.active || !mA.paused || !String(mA.selectedVoiceID || '').startsWith('local::')) {
        throw new Error('prep did not restart X on a local voice: ' + JSON.stringify({ active: !!mA.active, paused: !!mA.paused, voice: mA.selectedVoiceID || null }));
      }
      try { main0?.Zotero_Tabs?.select(Y.tabID); await sleep(150); main0?.Zotero_Tabs?.select(X.tabID); } catch {}
      try { prepWin?.minimize?.(); } catch {}
    }
    if (!p.getBoolPref(key('local.enabled'))) throw new Error('local.enabled was false before Close and continue');
    const startY = { active: !!mB.active, paused: !!mB.paused, voice: mB.selectedVoiceID || null, controller: mB._controller ?? null,
      popupOpen: !!byItem(Y.itemID)?._internalReader?._state?.readAloudState?.popupOpen };
    const startX = { active: !!mA.active, paused: !!mA.paused, voice: mA.selectedVoiceID || null,
      popupOpen: !!byItem(X.itemID)?._internalReader?._state?.readAloudState?.popupOpen };

    paneWin = Services.wm.getMostRecentWindow('zotero:pref');
    try { if (paneWin && paneWin.windowState === 2) paneWin.restore(); } catch {}
    try { paneWin?.focus?.(); } catch {}
    try { await paneWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => paneWin.document.getElementById('ztts-enable-local'), 10000, 100);
    const doc = paneWin.document;
    const button = doc.getElementById('ztts-enable-local');
    if (!button || button.disabled) throw new Error('Disable button missing or held');

    button.click();
    const d = await waitFor(() => doc.getElementById('ztts-notice'), 8000, 50);
    if (!d) throw new Error('no question appeared for the used-provider Disable');
    const buttons = [...d.querySelectorAll('button')].map(b => String(b.textContent || '').trim());
    if (buttons.join('|') !== 'Close and continue|Cancel') throw new Error('unexpected buttons: ' + JSON.stringify(buttons));

    // Press Close and continue; time the click to the pref write.
    let noticeAgain = null;
    const t0 = Date.now();
    d.querySelectorAll('button')[0].click();
    let applied = false;
    while (Date.now() - t0 < 10000) {
      // A NEW dialog is a failure; the clicked one is mid-removal for a tick or two.
      if (!noticeAgain) { const again = doc.getElementById('ztts-notice'); if (again && again !== d) noticeAgain = String(again.textContent || '').slice(0, 300); }
      if (p.getBoolPref(key('local.enabled')) === false) { applied = true; break; }
      await sleep(5);
    }
    const msToWrite = applied ? Date.now() - t0 : null;
    if (!applied) throw new Error('pref did not write after Close and continue: ' + JSON.stringify({ noticeAgain }));

    // Settle, then the full evidence.
    await sleep(1500);
    const noticeAfter = doc.getElementById('ztts-notice');
    const xReader = byItem(X.itemID), yReader = byItem(Y.itemID);
    const xMgr = xReader?._internalReader?._readAloudManager, yMgr = yReader?._internalReader?._readAloudManager;
    const row = {
      msToWrite, noticeAgain, noticeAfterSettle: !!noticeAfter,
      labelAfter: button.getAttribute('label'),
      X: { readerStillOpen: !!xReader, popupOpen: !!xReader?._internalReader?._state?.readAloudState?.popupOpen,
        active: !!xMgr?.active, voiceBefore: startX.voice },
      Y: { readerStillOpen: !!yReader, popupOpen: !!yReader?._internalReader?._state?.readAloudState?.popupOpen,
        active: !!yMgr?.active, paused: yMgr ? !!yMgr.paused : null,
        voiceSame: (yMgr?.selectedVoiceID || null) === startY.voice, controllerSame: (yMgr?._controller ?? null) === startY.controller },
    };
    const players = JSON.parse(await Zotero.ZoteroTTS.diagnostics.players());
    row.players = (players.before || []).filter(r => r.itemID === X.itemID || r.itemID === Y.itemID);
    out.rows.closeAndContinue = row;
    const ok = !row.noticeAgain && !row.noticeAfterSettle
      && row.X.readerStillOpen && !row.X.popupOpen && !row.X.active
      && row.Y.readerStillOpen && row.Y.popupOpen && row.Y.active && row.Y.paused && row.Y.voiceSame && row.Y.controllerSame;
    if (!ok) throw new Error('Close and continue mismatch: ' + JSON.stringify(row));
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try {
      const d = paneWin?.document?.getElementById('ztts-notice'); if (d) d.close();
    } catch (e) {}
  }
})()
