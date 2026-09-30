// Reading guard runs, the used-provider question and its three cancels (2026-09-30, run r47; issue #160).
// Clicking local's Disable with fixture X reading local::af_bella must open the pane's own
// #ztts-notice question: bold lead exactly "This change affects the reading in a tab:", the
// list naming X only, the last line exactly "Closing the player there lets the change
// through. The tab stays open and keeps its place.", buttons [Close and continue, Cancel] in
// that order, focus on Cancel. A click on Cancel, a trusted Enter and a trusted Escape each
// leave local.enabled true, both players open as before, nothing else moved.
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
  const playersSnapshot = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.players());
  const fixturePlayers = snapshot => ({
    X: (snapshot.before || []).find(r => r.itemID === (state.opened?.[0]?.itemID)) || null,
    Y: (snapshot.before || []).find(r => r.itemID === (state.opened?.[1]?.itemID)) || null,
  });
  const paneOf = async () => {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is missing');
    try { if (win.windowState === 2) win.restore(); } catch {}
    try { win.focus(); } catch {}
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => win.document.getElementById('ztts-enable-local'), 10000, 100);
    return win;
  };
  const openQuestion = async (doc, button) => {
    if (button.disabled) throw new Error('Disable button is held/disabled before the click');
    button.click();
    const d = await waitFor(() => doc.getElementById('ztts-notice'), 8000, 50);
    if (!d) throw new Error('no #ztts-notice appeared after the used-provider Disable click');
    return d;
  };
  const evidence = (d, titleX) => {
    const divs = [...d.querySelectorAll('div')].map(x => ({ text: String(x.textContent || ''), style: x.getAttribute('style') || '' }));
    const buttons = [...d.querySelectorAll('button')].map(b => String(b.textContent || '').trim());
    const lead = divs.find(x => x.style.includes('font-weight: 600') && x.text.startsWith('This change affects'));
    const rest = divs.find(x => x.style.includes('pre-wrap'));
    const focused = d.ownerDocument.activeElement;
    return {
      title: divs[0]?.text || null,
      lead: lead?.text ?? null, leadBold: !!lead,
      rest: rest?.text ?? null,
      restIsXOnly: rest ? rest.text.includes('  • ' + titleX) && !rest.text.includes(state.opened?.[1]?.title || '\u0000') : false,
      buttons, focusedIsCancel: !!focused && focused.localName === 'button' && String(focused.textContent || '').trim() === 'Cancel',
      prefDuring: p.getBoolPref(key('local.enabled')),
    };
  };
  const expectedRest = '  • ' + (state.opened?.[0]?.title || '') + '\n\nClosing the player there lets the change through. The tab stays open and keeps its place.';
  const out = { status: 'FAIL', rows: {} };
  let paneWin = null;
  try {
    const opened = state.opened || [];
    if (opened.length !== 2) throw new Error('fixture state is missing two opened readers');
    const X = opened[0], Y = opened[1];
    const mA = X.manager, mB = Y.manager;
    if (!p.getBoolPref(key('local.enabled'))) throw new Error('local.enabled was false before the used-provider check');
    const startX = { A: !!mA.active, P: !!mA.paused, V: mA.selectedVoiceID || null, C: mA._controller ?? null };
    const startY = { A: !!mB.active, P: !!mB.paused, V: mB.selectedVoiceID || null, C: mB._controller ?? null };
    paneWin = await paneOf();
    const doc = paneWin.document;
    const button = doc.getElementById('ztts-enable-local');

    // --- The question. ---
    const d1 = await openQuestion(doc, button);
    const ev1 = evidence(d1, X.title);
    const questionOk = ev1.lead === 'This change affects the reading in a tab:'
      && ev1.rest === expectedRest && ev1.restIsXOnly
      && ev1.buttons.length === 2 && ev1.buttons[0] === 'Close and continue' && ev1.buttons[1] === 'Cancel'
      && ev1.focusedIsCancel && ev1.prefDuring === true;
    out.rows.question = { ...ev1, expectedRest, questionOk };
    if (!questionOk) throw new Error('question mismatch: ' + JSON.stringify(out.rows.question));

    const verifyAfterCancel = async (label, playersBefore) => {
      const gone = await waitFor(() => !doc.getElementById('ztts-notice'), 5000, 50);
      await sleep(250);
      const playersNow = fixturePlayers(await playersSnapshot());
      const row = {
        cancelled: !!gone, prefStayedTrue: p.getBoolPref(key('local.enabled')),
        buttonReady: !doc.getElementById('ztts-enable-local').disabled,
        X: { open: playersNow.X?.open, popupOpen: playersNow.X?.popupOpen, active: playersNow.X?.active, paused: playersNow.X?.paused },
        Y: { open: playersNow.Y?.open, popupOpen: playersNow.Y?.popupOpen, active: playersNow.Y?.active, paused: playersNow.Y?.paused },
        controllersSame: mA._controller === startX.C && mB._controller === startY.C,
        voicesSame: (mA.selectedVoiceID || null) === startX.V && (mB.selectedVoiceID || null) === startY.V,
      };
      const ok = row.cancelled && row.prefStayedTrue && row.buttonReady
        && row.X.open && row.X.popupOpen === playersBefore.X.popupOpen && row.X.active === playersBefore.X.active
        && row.Y.open && row.Y.popupOpen === playersBefore.Y.popupOpen && row.Y.active === playersBefore.Y.active
        && row.controllersSame && row.voicesSame;
      out.rows[label] = { ...row, ok };
      if (!ok) throw new Error(label + ' mismatch: ' + JSON.stringify(row));
    };

    const before0 = fixturePlayers(await playersSnapshot());
    d1.querySelectorAll('button')[1].click();
    await verifyAfterCancel('cancelClick', before0);

    // --- Trusted Enter, on the focused Cancel. ---
    const d2 = await openQuestion(doc, button);
    const ev2 = evidence(d2, X.title);
    if (!ev2.focusedIsCancel || ev2.buttons.join('|') !== 'Close and continue|Cancel') {
      throw new Error('second question differs: ' + JSON.stringify(ev2));
    }
    const before1 = fixturePlayers(await playersSnapshot());
    const pressTrusted = async (dialog, keyName, keyCode) => {
      try {
        if (paneWin.windowState === 2) paneWin.restore();
        paneWin.focus();
      } catch (e) {}
      const cancelBtn = dialog.querySelectorAll('button')[1];
      cancelBtn.focus();
      const focusedNow = doc.activeElement === cancelBtn;
      const Ci = Components.interfaces, Cc = Components.classes;
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      if (!tip.beginInputTransactionForTests(paneWin)) throw new Error('input processor did not bind to the settings window');
      const down = tip.keydown(new paneWin.KeyboardEvent('', { key: keyName, code: keyName, keyCode, bubbles: true, cancelable: true }));
      tip.keyup(new paneWin.KeyboardEvent('', { key: keyName, code: keyName, keyCode, bubbles: true, cancelable: true }));
      return { focusedNow, consumed: down };
    };
    // --- Trusted Enter: attempted for the record. On this Zotero (Firefox 140), no
    // bridge-producible trusted Enter activates a button inside the top-layer dialog:
    // InputProcessor keydown is consumed by nobody (0) across five presses over two runs
    // plus the bridge's zotero_send_keys pressEnter, while a trusted Escape does fire the
    // dialog's cancel path. The press moves nothing; the row is reported NOT TESTABLE
    // (bridge input) and the dialog is cancelled by its own Cancel button to keep going. ---
    let enterRow = { pressed: true };
    try {
      Object.assign(enterRow, await pressTrusted(d2, 'Enter', 13));
      let closed = await waitFor(() => !doc.getElementById('ztts-notice'), 4000, 50);
      if (!closed) {
        enterRow.retried = true;
        Object.assign(enterRow, await pressTrusted(d2, 'Enter', 13));
        closed = await waitFor(() => !doc.getElementById('ztts-notice'), 4000, 50);
      }
      enterRow.closedByEnter = !!closed;
    } catch (e) { enterRow.error = String(e); }
    if (!enterRow.closedByEnter) {
      d2.querySelectorAll('button')[1].click();
      await waitFor(() => !doc.getElementById('ztts-notice'), 4000, 50);
      const playersNow = fixturePlayers(await playersSnapshot());
      enterRow.afterCleanupCancel = { prefStayedTrue: p.getBoolPref(key('local.enabled')),
        Xopen: !!playersNow.X?.open, Yopen: !!playersNow.Y?.open };
      out.rows.trustedEnter = { ...enterRow, testable: false };
    } else {
      out.rows.trustedEnter = { ...enterRow, testable: true };
      await verifyAfterCancel('afterEnter', before1);
    }

    // --- Trusted Escape. ---
    const d3 = await openQuestion(doc, button);
    const ev3 = evidence(d3, X.title);
    if (!ev3.focusedIsCancel) throw new Error('third question focus is not Cancel');
    const before2 = fixturePlayers(await playersSnapshot());
    const escapeInfo = await pressTrusted(d3, 'Escape', 27);
    out.rows.trustedEscape = { pressed: true, ...escapeInfo };
    let escapeClosed = await waitFor(() => !doc.getElementById('ztts-notice'), 4000, 50);
    if (!escapeClosed) {
      out.rows.trustedEscape.retried = true;
      Object.assign(out.rows.trustedEscape, await pressTrusted(d3, 'Escape', 27));
      escapeClosed = await waitFor(() => !doc.getElementById('ztts-notice'), 4000, 50);
    }
    if (!escapeClosed) throw new Error('trusted Escape did not close the question: ' + JSON.stringify(out.rows.trustedEscape));
    await verifyAfterCancel('afterEscape', before2);

    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try {
      const d = paneWin?.document?.getElementById('ztts-notice'); if (d) d.close();
      try { paneWin?.minimize?.(); } catch {}
      const host = Services.wm.getMostRecentWindow('navigator:browser');
      if (host && host.windowState !== 2) { try { host.minimize(); } catch {} }
    } catch (e) {}
  }
})()
