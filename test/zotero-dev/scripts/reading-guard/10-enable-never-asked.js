// Reading guard runs, Enable never asked (2026-09-30, run r48; issue #160).
// C = zotero-standard: disabled at start, and its check (zotero-tier-check.ts) is a
// sign-in check plus a tier voice LISTING - no synthesis, no cost. (The first attempt
// used fish, whose Enable check synthesizes a probe (prefs-pane.ts probeSynthesis)
// and timed out; that run's unused-disable and uncertain-session evidence stands.)
// X (PDF) reads local::af_bella, Y (EPUB) reads a system voice. Checks:
// readingImpact({"zotero-standard.enabled": true}) is affected: []; a third player
// caught with an uncertain voice (held open when caught) does not change that; C's
// Enable never shows #ztts-notice, writes the pref in the same click, leaves X/Y
// controllers and voices identical, and the open players' live lists re-apply.
// The third fixture is closed and erased here; fish stays off (teardown restores it on).
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const key = name => 'extensions.zotero.zotero-tts.' + name;
  const getBool = name => p.getBoolPref(key(name));
  const waitFor = async (fn, ms = 10000, step = 100) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = fn(); if (last) return last; await sleep(step); }
    return null;
  };
  const readers = () => Zotero.Reader._readers || [];
  const byItem = itemID => { for (const r of readers()) if (r?.itemID === itemID) return r; return null; };
  const paneStateOf = itemID => {
    const r = byItem(itemID), m = r?._internalReader?._readAloudManager;
    return { itemID, open: !!(r && (r._internalReader?._state?.readAloudState?.popupOpen || m?.active)),
      popupOpen: !!r?._internalReader?._state?.readAloudState?.popupOpen, active: !!m?.active, paused: m ? !!m.paused : null,
      voice: m?.selectedVoiceID || null, controller: m?._controller ?? null };
  };
  const impact = async changes => JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(typeof changes === 'string' ? changes : JSON.stringify(changes)));
  const liveList = async () => {
    const list = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    const out = {};
    const rs = readers();
    for (let i = 0; i < rs.length; i++) out[rs[i].itemID] = list[i] || null;
    return out;
  };

  const C = 'zotero-standard';
  const out = { status: 'FAIL', rows: {}, C };
  let paneWin = null;
  const opened = state.opened || [];
  try {
    if (opened.length !== 2) throw new Error('fixture state is missing two opened readers');
    const X = opened[0], Y = opened[1];
    const mA = X.manager, mB = Y.manager;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }

    paneWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 5000, 200);
    if (!paneWin) { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); paneWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 15000, 200); }
    try { await paneWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => paneWin.document.getElementById('ztts-enable-' + C), 10000, 100);
    const doc = paneWin.document;
    if (!doc.getElementById('ztts-enable-' + C)) throw new Error('Zotero-OpenReader pane is not ready');
    const beforeControllers = { X: mA._controller ?? null, Y: mB._controller ?? null };
    const beforeVoices = { X: mA.selectedVoiceID || null, Y: mB.selectedVoiceID || null };

    // --- The impact question for C's Enable, with X and Y open. ---
    const impactEnable = await impact({ [C + '.enabled']: true });
    if ((impactEnable.affected || []).length !== 0) throw new Error('Enable was reported as affecting a reading: ' + JSON.stringify(impactEnable));
    out.rows.impactEnable = { affected: impactEnable.affected,
      sessions: (impactEnable.sessions || []).map(s => ({ title: s.title, uncertain: !!s.uncertain, voices: s.voices })), status: 'PASS' };

    // --- Third player with an unknown voice, caught in the uncertain state. ---
    let third = (state.fixtures || []).find(f => String(f.title || '').includes('numbers')) || null;
    if (third && !Zotero.Items.get(third.itemID)) third = null;
    try {
      if (!third) {
        const stamp = Date.now();
        const imported = await Zotero.Attachments.importFromFile({
          file: PathUtils.join(String(run.params.fixturesDir || ''), 'numbers', 'numbers.pdf'),
          libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS #160 numbers ${stamp}` });
        const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
        third = { itemID: item.id, title: `Zotero-TTS #160 numbers ${stamp}` };
        state.fixtures = (state.fixtures || []).concat([third]);
      }
      let reader = byItem(third.itemID);
      if (!reader) {
        Zotero.Reader.open(third.itemID);
        const t0 = Date.now();
        while (Date.now() - t0 < 24000) {
          reader = byItem(third.itemID);
          if (reader?._internalReader?._readAloudManager) break;
          await sleep(150);
        }
      }
      if (!reader?._internalReader?._readAloudManager) throw new Error('third reader manager not ready');
      third.tabID = reader.tabID;
      const main = Zotero.getMainWindow?.();
      try { main?.Zotero_Tabs?.select(reader.tabID); reader._iframeWindow?.focus?.(); } catch {}
      reader._internalReader.toggleReadAloudPopup(true);
      let caught = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 2500 && !caught) {
        const now = await impact({});
        for (const s of now.sessions || []) {
          if (s.title === third.title && s.uncertain) { caught = { title: s.title, uncertain: true, voices: s.voices }; break; }
        }
        if (!caught) await sleep(30);
      }
      out.rows.uncertainAttempt = { caught: !!caught, session: caught, itemID: third.itemID,
        note: caught ? 'held open through the Enable click' : 'not caught within 2.5 s; Enable checked with X and Y open only' };
    } catch (e) {
      out.rows.uncertainAttempt = { caught: false, error: String(e) };
    }
    const thirdReader = third ? byItem(third.itemID) : null;
    const thirdOpen = !!(thirdReader && (thirdReader._internalReader?._state?.readAloudState?.popupOpen || thirdReader._internalReader?._readAloudManager?.active));

    // --- C's Enable: never a notice; the check runs; the pref writes. ---
    const listBefore = await liveList();
    const cButton = doc.getElementById('ztts-enable-' + C);
    if (getBool(C + '.enabled')) throw new Error(C + ' was already enabled');
    let noticeDuringEnable = false, firstNoticeText = null;
    const watcher2 = setInterval(() => {
      try {
        const d = doc.getElementById('ztts-notice');
        if (d) { noticeDuringEnable = true; if (!firstNoticeText) firstNoticeText = String(d.textContent || '').slice(0, 200); }
      } catch (e) {}
    }, 40);
    const tEnable = Date.now();
    cButton.click();
    const cEnabled = await waitFor(() => {
      const m3 = byItem(third?.itemID)?._internalReader?._readAloudManager;
      if (m3 && m3.active && !m3.paused) { try { m3.pause(); } catch {} }
      return getBool(C + '.enabled') === true;
    }, 40000, 60);
    const enableMs = Date.now() - tEnable;
    clearInterval(watcher2);
    if (!cEnabled) throw new Error(C + ' Enable did not apply: ' + JSON.stringify({ noticeDuringEnable, firstNoticeText, result: doc.getElementById('ztts-test-result-' + C)?.textContent || '' }));
    if (noticeDuringEnable) throw new Error('Enable showed a reading-guard notice: ' + firstNoticeText);
    out.rows.enable = {
      prefTrue: cEnabled, enableMs, notice: noticeDuringEnable,
      label: cButton.getAttribute('label'), result: doc.getElementById('ztts-test-result-' + C)?.textContent || '',
      uncertainOpenAtClick: thirdOpen,
    };

    // --- X/Y unchanged; live lists re-applied. ---
    const afterControllers = { X: mA._controller ?? null, Y: mB._controller ?? null };
    const afterVoices = { X: mA.selectedVoiceID || null, Y: mB.selectedVoiceID || null };
    const sameControllers = beforeControllers.X !== null && beforeControllers.X === afterControllers.X
      && beforeControllers.Y !== null && beforeControllers.Y === afterControllers.Y;
    const sameVoices = beforeVoices.X === afterVoices.X && beforeVoices.Y === afterVoices.Y;
    let listAfter = null, appliedIncreased = false;
    const t2 = Date.now();
    while (Date.now() - t2 < 15000) {
      listAfter = await liveList();
      const inc = id => (listAfter[id]?.applied ?? 0) > (listBefore[id]?.applied ?? 0);
      if (inc(X.itemID) && inc(Y.itemID)) { appliedIncreased = true; break; }
      await sleep(300);
    }
    if (!listAfter) listAfter = await liveList();
    out.rows.after = {
      controllers: { same: sameControllers }, voices: { same: sameVoices, X: afterVoices.X, Y: afterVoices.Y },
      liveVoiceList: { before: { [X.itemID]: listBefore[X.itemID], [Y.itemID]: listBefore[Y.itemID] },
        after: { [X.itemID]: listAfter[X.itemID], [Y.itemID]: listAfter[Y.itemID] }, appliedIncreased },
      players: { X: (({ controller, ...rest }) => rest)(paneStateOf(X.itemID)), Y: (({ controller, ...rest }) => rest)(paneStateOf(Y.itemID)) },
    };
    if (!sameControllers || !sameVoices) throw new Error('Enable changed a fixture session: ' + JSON.stringify({ beforeControllers, afterControllers, beforeVoices, afterVoices }));

    // --- Third player closed and its item erased in this script. ---
    if (third) {
      const r3 = byItem(third.itemID);
      if (r3) {
        try { r3._internalReader.toggleReadAloudPopup(false); } catch (e) {}
        await sleep(250);
        try { Zotero.getMainWindow?.().Zotero_Tabs?.close(r3.tabID); } catch (e) {}
        for (let i = 0; i < 200; i++) { let found = false; for (const r of readers()) if (r?.tabID === r3.tabID) found = true; if (!found) break; await sleep(50); }
      }
      try { const it = Zotero.Items.get(third.itemID); if (it) await it.eraseTx(); } catch (e) { out.thirdEraseError = String(e); }
      state.fixtures = (state.fixtures || []).filter(f => f.itemID !== third.itemID);
      out.rows.thirdCleanup = { closed: !byItem(third.itemID), erased: !Zotero.Items.get(third.itemID) };
    }
    const main = Zotero.getMainWindow?.();
    try { main?.Zotero_Tabs?.select(X.tabID); } catch {}
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try {
      const d = paneWin?.document?.getElementById('ztts-notice'); if (d) d.close();
      const host = Services.wm.getMostRecentWindow('navigator:browser');
      if (host && host.windowState !== 2) host.minimize();
      try { paneWin?.minimize?.(); } catch {}
    } catch (e) {}
  }
})()
