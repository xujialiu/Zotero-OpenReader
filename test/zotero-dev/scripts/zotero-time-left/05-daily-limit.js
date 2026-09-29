// Item 5: the daily limit. Changes the wrapped client's answer to
// 'daily-limit-exceeded' (the wrap itself was installed by 04), clears the
// manager's stored error (the engine replays a failed segment without
// refetching — src/core/engine/session.ts speak()), steps to the next
// sentence and presses play: the fetch fails with the daily answer and the
// status popover opens BY ITSELF with "You have reached today's limit for
// the Zotero voices. Try again tomorrow, or choose another voice.", no
// .buy-time, no .retry; the voice's time is unchanged (item 1's, read live
// from the snapshot too); no launchURL call is recorded. The popover is
// closed at the end (the status button toggles its own popover).
// params: none. state: reads itemID/pickedVoice/item1; sets audioAnswer.
(async () => {
  const out = { step: 'daily-limit' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.getAPIClientOriginal) throw new Error('run state missing -- 04 did not install the wrap');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MESSAGE = "You have reached today's limit for the Zotero voices. Try again tomorrow, or choose another voice.";
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

    S.audioAnswer = 'daily-limit-exceeded';
    out.audioAnswer = S.audioAnswer;
    const launchCountBefore = (S.launchCalls || []).length;

    const ensureNoPopover = () => { const pop = fdoc.querySelector('.popover'); if (pop) pop.remove(); };
    ensureNoPopover();
    const wm = Components.utils.waiveXrays(m);
    wm._error = null;
    try { if (typeof wm._stateChanged === 'function') wm._stateChanged(); } catch (e) { out.stateChangedError = String(e); }
    await sleep(500);
    const diag1 = JSON.parse(await diagnostics.pluginPlayer());
    const open1 = (diag1.readers || []).filter((r) => r && r.open);
    const entry1 = open1.find((r) => r.state && r.state.voice === S.item1.voice) || open1[0] || null;
    out.alertAfterClear = entry1 ? (entry1.state.alert ?? null) : 'no entry';

    child.zttsCommand('navigate', 'nextSentence');
    await sleep(400);
    if (reader._iframeWindow.document.notifyUserGestureActivation) reader._iframeWindow.document.notifyUserGestureActivation();
    child.zttsCommand('play');
    const reads = () => {
      const pop = fdoc.querySelector('.popover');
      const msg = pop ? pop.querySelector('.error-message') : null;
      const buy = pop ? pop.querySelector('.buy-time') : null;
      const retry = pop ? pop.querySelector('.retry') : null;
      const btn = fdoc.querySelector('[data-pick="voice"]');
      const time = btn ? btn.querySelector('.time-left') : null;
      return {
        popoverOpen: !!pop, message: msg ? msg.textContent : null,
        hasBuy: !!buy, hasRetry: !!retry,
        voiceTime: time ? time.textContent : null, voiceLow: time ? time.classList.contains('low') : null,
      };
    };
    let openedAtMs = null, seen = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const f = reads();
      if (f.popoverOpen && f.message === MESSAGE) { openedAtMs = Date.now() - t0; seen = f; break; }
      await sleep(60);
    }
    out.openedAtMs = openedAtMs;
    out.afterPlay = seen || reads();
    const diag = JSON.parse(await diagnostics.pluginPlayer());
    const openRows = (diag.readers || []).filter((r) => r && r.open);
    const entry = openRows.find((r) => r.state && r.state.voice === S.item1.voice) || openRows[0] || null;
    const voiceRow = entry ? (entry.state.voices || []).find((v) => v.value === S.item1.voice) || null : null;
    out.stateAfterPlay = entry ? { alert: entry.state.alert ?? null, error: entry.state.error ?? null } : null;
    out.voiceTime = { frame: seen ? seen.voiceTime : null, snapshot: voiceRow ? (voiceRow.time ?? null) : null, item1: S.item1.time };
    out.checks = seen ? {
      openedByItself: openedAtMs !== null,
      messageExact: seen.message === MESSAGE,
      noBuy: seen.hasBuy === false,
      noRetry: seen.hasRetry === false,
      voiceTimeUnchanged: seen.voiceTime === S.item1.time && (!voiceRow || voiceRow.time === S.item1.time),
      alertIsDailyLimit: !!out.stateAfterPlay && !!out.stateAfterPlay.alert && out.stateAfterPlay.alert.kind === 'daily-limit',
      noLaunchCall: (S.launchCalls || []).length === launchCountBefore,
    } : null;

    // --- Close the popover and leave the session paused. ---
    const statusBtn = fdoc.querySelector('.status-button');
    if (statusBtn && fdoc.querySelector('.popover')) statusBtn.click();
    await sleep(200);
    out.popoverClosedAtEnd = !fdoc.querySelector('.popover');
    out.sessionAtEnd = { active: !!m.active, paused: !!m.paused, error: m ? (m.error ?? null) : null };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
