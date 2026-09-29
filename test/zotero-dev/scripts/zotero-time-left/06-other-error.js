// Item 6: every other error stays as it was. Changes the wrapped client's
// answer to 'network', clears the manager's stored error (the engine replays
// a failed segment without refetching — src/core/engine/session.ts speak()),
// steps to the next sentence and presses play: the fetch fails with 'network'
// and NO popover opens (a non-Zotero error is no alert); the status button
// shows; clicking it shows "Playback failed. Check your provider connection
// and try again." with a Retry button and no .buy-time. The popover is
// closed and the session left paused at the end. params: none. state: reads
// itemID/pickedVoice; sets audioAnswer.
(async () => {
  const out = { step: 'other-error' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.getAPIClientOriginal) throw new Error('run state missing -- 04 did not install the wrap');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MESSAGE = 'Playback failed. Check your provider connection and try again.';
  try {
    const diagnostics = Zotero.ZoteroTTS.diagnostics;
    const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
    const reader = readerOf(S.itemID);
    if (!reader) throw new Error('fixture reader gone');
    const doc = reader._iframeWindow.document;
    const frame = doc.getElementById('ztts-player-frame');
    if (!frame || frame.hidden) throw new Error('the player frame is hidden');
    const fdoc = frame.contentDocument;
    const child = Components.utils.waiveXrays(frame.contentWindow);
    const internal = reader._internalReader;
    const m = internal._readAloudManager;

    S.audioAnswer = 'network';
    out.audioAnswer = S.audioAnswer;

    const ensureNoPopover = () => { const pop = fdoc.querySelector('.popover'); if (pop) pop.remove(); };
    ensureNoPopover();
    const launchCountBefore = (S.launchCalls || []).length;
    const wm = Components.utils.waiveXrays(m);
    wm._error = null;
    try { if (typeof wm._stateChanged === 'function') wm._stateChanged(); } catch (e) { out.stateChangedError = String(e); }
    await sleep(500);
    child.zttsCommand('navigate', 'nextSentence');
    await sleep(400);
    if (reader._iframeWindow.document.notifyUserGestureActivation) reader._iframeWindow.document.notifyUserGestureActivation();
    child.zttsCommand('play');

    const popoverTrace = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const pop = fdoc.querySelector('.popover');
      if (pop && !popoverTrace.length) popoverTrace.push('opened at ' + (Date.now() - t0) + 'ms');
      await sleep(100);
    }
    out.popoverTrace = popoverTrace;
    out.noPopoverOpened = popoverTrace.length === 0;
    const statusBtn = fdoc.querySelector('.status-button');
    out.statusButton = {
      hidden: statusBtn ? statusBtn.hidden === true : null,
      text: statusBtn ? statusBtn.textContent : null,
    };
    const diag = JSON.parse(await diagnostics.pluginPlayer());
    const openRows = (diag.readers || []).filter((r) => r && r.open);
    const entry = openRows.find((r) => r.state && r.state.voice === S.item1.voice) || openRows[0] || null;
    out.stateAfterPlay = entry ? { alert: entry.state.alert ?? null, error: entry.state.error ?? null } : null;
    out.stateChecks = entry ? {
      alertNull: entry.state.alert == null,
      errorIsPlaybackMessage: entry.state.error === MESSAGE,
    } : null;

    // --- Click the ! : the popover opens on click with the message and Retry, no buy. ---
    if (!statusBtn) throw new Error('status button missing');
    statusBtn.click();
    let pop = null, msg = null, retry = null, buy = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 3000) {
      pop = fdoc.querySelector('.popover');
      if (pop) {
        msg = pop.querySelector('.error-message');
        retry = pop.querySelector('.retry');
        buy = pop.querySelector('.buy-time');
        if (msg) break;
      }
      await sleep(100);
    }
    out.afterClick = {
      popoverOpen: !!pop,
      message: msg ? msg.textContent : null,
      retryText: retry ? retry.textContent : null,
      hasBuy: !!buy,
    };
    out.clickChecks = {
      messageExact: !!msg && msg.textContent === MESSAGE,
      hasRetry: !!retry && retry.textContent === 'Retry',
      noBuy: !buy,
    };

    // --- Close the popover, pause, done. ---
    statusBtn.click();
    await sleep(200);
    out.popoverClosedAtEnd = !fdoc.querySelector('.popover');
    out.sessionAtEnd = { active: !!m.active, paused: !!m.paused, error: m ? (m.error ?? null) : null };
    out.noLaunchCall = (S.launchCalls || []).length === launchCountBefore;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
