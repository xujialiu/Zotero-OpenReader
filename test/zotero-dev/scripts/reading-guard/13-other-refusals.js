// Reading guard runs, Close for the other refusals (2026-09-30, run r47; issue #160).
// (a) Re-enables local (X's player closed: an unused-provider enable, no question),
// restarts X on local::af_bella, marks Y's current system voice as a favorite
// (allowed while favorites-only is off), then turns "Offer only favorite voices" on
// over X's unmarked current voice: the question lists X only, and Close and continue
// closes X only, leaves Y untouched, and writes readAloud.favoritesOnly in the same
// click (ms reported). (b) The restore refusal is NOT TESTABLE live: both restore
// entries open a blocking native dialog (the file restore's nsIFilePicker and the
// WebDAV restore's Services.prompt.confirm, prefs-pane.ts), which the kit must not
// trigger; the case file keeps those paths unit-tested. favoritesOnly is restored to
// its captured value and user flag in the finally.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const key = name => 'extensions.zotero.zotero-tts.' + name;
  const waitFor = async (fn, ms = 10000, step = 100) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = fn(); if (last) return last; await sleep(step); }
    return null;
  };
  const readers = () => Zotero.Reader._readers || [];
  const byItem = itemID => { for (const r of readers()) if (r?.itemID === itemID) return r; return null; };
  const favString = () => p.getStringPref(key('readAloud.favoriteVoices'), '');
  const idList = value => { try { const x = JSON.parse(value || '[]'); return Array.isArray(x) ? x.map(String) : []; } catch { return []; } };
  const hasFavorite = id => idList(favString()).includes(id);
  const out = { status: 'FAIL', rows: {} };
  let paneWin = null;
  let favOriginal = null, favOriginalUser = null, favoritesOnlyOriginal = null, favoritesOnlyOriginalUser = null;
  try {
    const opened = state.opened || [];
    const X = opened[0], Y = opened[1];
    const mA = X.manager, mB = Y.manager;
    favOriginal = favString(); favoritesOnlyOriginal = p.getBoolPref(key('readAloud.favoritesOnly'));
    favOriginalUser = p.prefHasUserValue(key('readAloud.favoriteVoices'));
    favoritesOnlyOriginalUser = p.prefHasUserValue(key('readAloud.favoritesOnly'));

    paneWin = Services.wm.getMostRecentWindow('zotero:pref');
    try { if (paneWin && paneWin.windowState === 2) paneWin.restore(); } catch {}
    try { paneWin?.focus?.(); } catch {}
    try { await paneWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => paneWin.document.getElementById('ztts-enable-local'), 10000, 100);
    const doc = paneWin.document;

    // --- Re-enable local if the previous check left it off (X's player closed then:
    // an unused-provider enable, no question). ---
    if (!p.getBoolPref(key('local.enabled'))) {
      let noticeDuringEnable = false;
      const w1 = setInterval(() => { try { if (doc.getElementById('ztts-notice')) noticeDuringEnable = true; } catch (e) {} }, 50);
      doc.getElementById('ztts-enable-local').click();
      const localEnabled = await waitFor(() => p.getBoolPref(key('local.enabled')) === true, 30000, 100);
      clearInterval(w1);
      if (!localEnabled) throw new Error('local re-enable did not apply');
      if (noticeDuringEnable) throw new Error('re-enabling local showed a reading-guard notice');
      out.rows.reEnableLocal = { applied: true, notice: false, result: doc.getElementById('ztts-test-result-local')?.textContent || '' };
    } else {
      out.rows.reEnableLocal = { applied: true, alreadyOn: true };
    }

    // --- X reads on its local voice: restart it if the previous check closed it
    // (open and pause in the same script). ---
    let xReader = byItem(X.itemID);
    if (!xReader) throw new Error('X reader is gone');
    if (!(mA.active && mA.paused && String(mA.selectedVoiceID || '').startsWith('local::'))) {
      const main = Zotero.getMainWindow?.();
      try { main?.Zotero_Tabs?.select(xReader.tabID); xReader._iframeWindow?.focus?.(); } catch {}
      xReader._internalReader.toggleReadAloudPopup(true);
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        if (mA.active && !mA.paused) { try { mA.pause(); } catch {} }
        if (mA.active && mA._allVoices?.length && mA._controller && String(mA.selectedVoiceID || '').startsWith('local::')) break;
        await sleep(100);
      }
      if (String(mA.selectedVoiceID || '').startsWith('local::') === false) {
        let picked = null, tier = null;
        for (let i = 0; i < (mA._allVoices?.length || 0); i++) {
          const v = mA._allVoices[i];
          if (typeof v?.id === 'string' && v.id.startsWith('local::') && /en/i.test(v.id)) { picked = v.id; tier = v.tier; break; }
        }
        if (picked) {
          try { mA.selectTier(tier); mA.selectVoice(picked); } catch (e) {}
          const t1 = Date.now();
          while (Date.now() - t1 < 15000) {
            if (mA.active && !mA.paused) { try { mA.pause(); } catch {} }
            if (mA.active && mA.paused && mA.selectedVoiceID === picked) break;
            await sleep(100);
          }
        }
      }
      const t2 = Date.now();
      while (Date.now() - t2 < 15000) {
        if (mA.active && !mA.paused) { try { mA.pause(); } catch {} }
        if (mA.active && mA.paused && String(mA.selectedVoiceID || '').startsWith('local::')) break;
        await sleep(100);
      }
      if (!mA.active || !mA.paused || !String(mA.selectedVoiceID || '').startsWith('local::')) {
        throw new Error('X did not restart on a local voice: ' + JSON.stringify({ active: !!mA.active, paused: !!mA.paused, voice: mA.selectedVoiceID || null }));
      }
      try { main?.Zotero_Tabs?.select(Y.tabID); await sleep(150); main?.Zotero_Tabs?.select(X.tabID); } catch {}
    }
    const startXController = mA._controller ?? null, startXVoice = mA.selectedVoiceID;
    out.rows.restartX = { voice: startXVoice, active: true, paused: true, popupOpen: !!xReader._internalReader?._state?.readAloudState?.popupOpen };

    // --- Mark EVERY protected voice of Y as a favorite (allowed; favorites-only off).
    // The guard protects a prepared handoff voice beside the current one, so one
    // favorite is not enough: the readingImpact sessions name them all. ---
    const yVoice = mB.selectedVoiceID;
    const startYController = mB._controller ?? null;
    const impactNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact('{}'));
    const ySession = (impactNow.sessions || []).find(s => s.title === Y.title);
    const yIds = [...new Set([...(ySession?.voices || []).map(v => v.id), yVoice].filter(Boolean))];
    if (!yIds.length) throw new Error('Y has no protected voices');
    const markVia = [], markErrors = [];
    for (const id of yIds) {
      const label = String((() => {
        for (let i = 0; i < (mB._allVoices?.length || 0); i++) if (mB._allVoices[i]?.id === id) return mB._allVoices[i]?.label || mB._allVoices[i]?.name || id;
        return id;
      })()).trim();
      let done = null, err = null;
      try {
        const frame = byItem(Y.itemID)?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument;
        if (!frame) throw new Error('player frame is missing');
        const trigger = frame.querySelector('button[data-pick="voice"]');
        if (!trigger) throw new Error('plugin voice picker is missing');
        trigger.click();
        const pop = await waitFor(() => frame.querySelector('.picker-popover'), 3000, 50);
        if (!pop) throw new Error('voice picker popover did not open');
        let heart = null;
        for (const rowEl of pop.querySelectorAll('.option-row')) {
          const option = rowEl.querySelector('.option');
          if (String(option?.textContent || '').trim() === label) { heart = rowEl.querySelector('.favorite-heart'); break; }
        }
        if (!heart) throw new Error('favorite heart not found for ' + label);
        // The heart toggles: only click when the voice is not marked yet.
        const glyph = String(heart.textContent || '').trim();
        const pressed = heart.getAttribute('aria-pressed');
        if (glyph !== '♥' && pressed !== 'true') heart.click();
        const marked = await waitFor(() => hasFavorite(id), 4000, 100);
        trigger.click();
        if (!marked) throw new Error('favorite did not register');
        done = (glyph === '♥' || pressed === 'true') ? 'already marked' : 'player heart';
      } catch (e) {
        err = String(e);
        try {
          const clickText = (selector, test) => {
            for (const b of doc.querySelectorAll(selector + ' button')) if (test(String(b.textContent || '').trim(), b)) { b.click(); return b; }
            return null;
          };
          let b = clickText('#ztts-voices-tiers', t => t.toLowerCase().includes('system'));
          if (!b) throw new Error('settings provider column missing: System');
          await sleep(150);
          b = clickText('#ztts-voices-locales', t => t.toLowerCase().includes('english'));
          if (!b) throw new Error('settings locale column missing for System voices');
          await sleep(150);
          let target = null;
          for (const rowEl of doc.querySelectorAll('#ztts-voices-list > div')) {
            const buttons = rowEl.querySelectorAll('button');
            if (buttons.length >= 3 && String(buttons[2].textContent || '').trim() === label) { target = buttons[1]; break; }
          }
          if (!target) throw new Error('settings voice row missing: ' + label);
          const glyph2 = String(target.textContent || '').trim();
          const pressed2 = target.getAttribute('aria-pressed');
          if (glyph2 !== '♥' && pressed2 !== 'true') target.click();
          const marked = await waitFor(() => hasFavorite(id), 4000, 100);
          if (!marked) throw new Error('favorite did not register via settings browser');
          done = 'settings browser';
        } catch (e2) { err = err + ' | fallback: ' + String(e2); }
      }
      if (done) markVia.push({ id, label, via: done }); else markErrors.push({ id, label, error: err });
    }
    if (markErrors.length || !yIds.every(id => hasFavorite(id))) {
      throw new Error('could not mark every protected Y voice: ' + JSON.stringify({ markVia, markErrors }));
    }
    out.rows.markY = { voices: markVia, allMarked: yIds.every(id => hasFavorite(id)) };

    // --- Favorites-only over X's unmarked current voice: question, then Close and continue. ---
    const box = doc.getElementById('ztts-favorites-only');
    if (!box) throw new Error('favorites-only checkbox is missing');
    if (p.getBoolPref(key('readAloud.favoritesOnly'))) throw new Error('favoritesOnly was already on');
    box.checked = true;
    box.doCommand();
    const d = await waitFor(() => doc.getElementById('ztts-notice'), 8000, 50);
    if (!d) throw new Error('no question for favorites-only over an unmarked current voice');
    const divs = [...d.querySelectorAll('div')].map(x => ({ text: String(x.textContent || ''), style: x.getAttribute('style') || '' }));
    const lead = divs.find(x => x.style.includes('font-weight: 600') && x.text.startsWith('This change affects'));
    const rest = divs.find(x => x.style.includes('pre-wrap'));
    const buttons = [...d.querySelectorAll('button')].map(b => String(b.textContent || '').trim());
    const question = {
      lead: lead?.text ?? null, rest: rest?.text ?? null,
      restNamesXOnly: rest ? rest.text.includes('  • ' + X.title) && !rest.text.includes(Y.title) : false,
      buttons,
    };
    const questionOk = question.lead === 'This change affects the reading in a tab:'
      && question.rest === '  • ' + X.title + '\n\nClosing the player there lets the change through. The tab stays open and keeps its place.'
      && question.restNamesXOnly && buttons.join('|') === 'Close and continue|Cancel';
    if (!questionOk) throw new Error('favorites question mismatch: ' + JSON.stringify(question));

    const t0c = Date.now();
    d.querySelectorAll('button')[0].click();
    let applied = false, noticeAgain = null;
    while (Date.now() - t0c < 10000) {
      // A NEW dialog is a failure; the clicked one is mid-removal for a tick or two.
      if (!noticeAgain) { const again = doc.getElementById('ztts-notice'); if (again && again !== d) noticeAgain = String(again.textContent || '').slice(0, 300); }
      if (p.getBoolPref(key('readAloud.favoritesOnly')) === true) { applied = true; break; }
      await sleep(5);
    }
    const msToWrite = applied ? Date.now() - t0c : null;
    if (!applied) throw new Error('favoritesOnly did not write after Close and continue: ' + JSON.stringify({ noticeAgain }));
    await sleep(1500);
    xReader = byItem(X.itemID);
    const xMgr = xReader?._internalReader?._readAloudManager, yMgr = byItem(Y.itemID)?._internalReader?._readAloudManager;
    const row = {
      msToWrite, noticeAgain, question,
      X: { readerStillOpen: !!xReader, popupOpen: !!xReader?._internalReader?._state?.readAloudState?.popupOpen, active: !!xMgr?.active },
      Y: { open: !!byItem(Y.itemID), popupOpen: !!byItem(Y.itemID)?._internalReader?._state?.readAloudState?.popupOpen,
        active: !!yMgr?.active, paused: yMgr ? !!yMgr.paused : null,
        voiceSame: (yMgr?.selectedVoiceID || null) === yVoice,
        controllerUnchanged: (yMgr?._controller ?? null) === startYController },
      favoritesOnlyTrue: p.getBoolPref(key('readAloud.favoritesOnly')),
    };
    out.rows.favoritesCloseAndContinue = row;
    const ok = !row.noticeAgain && row.X.readerStillOpen && !row.X.popupOpen && !row.X.active
      && row.Y.open && row.Y.popupOpen && row.Y.active && row.Y.voiceSame && row.Y.controllerUnchanged && row.favoritesOnlyTrue;
    if (!ok) throw new Error('favorites Close and continue mismatch: ' + JSON.stringify(row));

    // --- (b) Restore refusal: not driven live (blocking native dialog). ---
    out.rows.restore = {
      testable: false,
      reason: 'both restore entries open a blocking native dialog - the file restore its nsIFilePicker and the WebDAV restore its Services.prompt.confirm (prefs-pane.ts confirm wiring); the kit must not trigger a blocking native prompt, and the case file keeps these paths unit-tested',
    };
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try {
      const d = paneWin?.document?.getElementById('ztts-notice'); if (d) d.close();
      if (favoritesOnlyOriginal !== null) {
        const k = key('readAloud.favoritesOnly');
        if (!favoritesOnlyOriginalUser) { if (p.prefHasUserValue(k)) p.clearUserPref(k); }
        else p.setBoolPref(k, !!favoritesOnlyOriginal);
      }
      try { paneWin?.minimize?.(); } catch {}
      const host = Services.wm.getMostRecentWindow('navigator:browser');
      if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }
    } catch (e) {}
  }
})()
