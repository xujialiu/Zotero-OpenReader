// Item 7 (NEW, issue #140 beta5): every other error keeps the ! with Retry
// and switches nothing off. Premium is turned back ON through the pref (item
// 6's refusal switched it off), fixture A's player is re-opened (settle →
// activate → click, again if it folds — 05's sequence), paused at once, and
// the wrap's audio answer set to 'network'. Playback is then walked forward
// sentence by sentence: Zotero's own side caches sentence audio per
// voice+text, so already-cached sentences play without asking (found live
// 2026-09-30); each play also prefetches ahead, and the FIRST UNCACHED
// sentence goes through the stub ({ audio: null, error: 'network' }) and
// fails playback. Expected: NO reminder at any point, the pref stays true,
// the player stays open with the ! (title 'Playback failed. Check your
// provider connection and try again.'), and CLICKED it opens that message
// with Retry and no .buy-time; diagnostics.zoteroRefusals() → last UNCHANGED
// from item 6 (the daily-limit record — 'network' is no account code).
// The popover is closed and the session left paused at the end. params: none.
// state: reads itemID/tabID/item1/item3; sets audioAnswer.
(async () => {
  const out = { step: 'other-error' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item3 || !S.getAPIClientOriginal) throw new Error('run state missing -- 04/05 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const waitFor = async (test, timeout = 24000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(step);
    }
    return test();
  };
  const MESSAGE = 'Playback failed. Check your provider connection and try again.';
  try {
    if (!host) throw new Error('no main window');
    const refusalsBefore = JSON.parse(await diagnostics.zoteroRefusals());
    out.lastBefore = refusalsBefore.last;

    // --- Premium back on; fixture A selected, player re-opened, paused. ---
    if (Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') !== true) p.setBoolPref(prefix + 'zotero-premium.enabled', true);
    out.premiumOn = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    host.Zotero_Tabs.select(S.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === S.tabID, 8000, 100);
    const readers = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < readers.length; i++) if (readers[i] && readers[i].itemID === S.itemID) reader = readers[i];
    if (!reader) throw new Error('fixture reader gone');
    const internal = reader._internalReader;
    const doc = reader._iframeWindow.document;
    const mOld = internal._readAloudManager;
    if (mOld && mOld.active) {
      internal.toggleReadAloudPopup(false);
      await waitFor(() => { const mm = internal._readAloudManager; return !mm || !mm.active; }, 12000, 200);
    }
    const button = doc.getElementById('ztts-player-toggle');
    const openWait = (timeout) => waitFor(() => {
      const m = internal._readAloudManager;
      const fr = doc.getElementById('ztts-player-frame');
      return m && m.active && fr && !fr.hidden && fr.contentDocument && fr.contentDocument.querySelector('.player') ? fr : null;
    }, timeout, 150);
    await sleep(800);
    if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
    button.click();
    let frame = await openWait(8000);
    if (!frame) {
      if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
      button.click();
      frame = await openWait(12000);
    }
    if (!frame) throw new Error('A player did not reopen');
    const child = Components.utils.waiveXrays(frame.contentWindow);
    const isPaused = () => { const m = internal._readAloudManager; return !!(m && m.active && m.paused); };
    for (let attempt = 0; attempt < 3 && !isPaused(); attempt++) {
      const how = attempt === 0 ? 'play-button' : attempt === 1 ? 'zttsCommand-play' : 'manager-pause';
      try {
        if (how === 'play-button') { const playBtn = frame.contentDocument.querySelector('.play'); if (playBtn) playBtn.click(); }
        else if (how === 'zttsCommand-play') child.zttsCommand('play');
        else { const m = internal._readAloudManager; if (m && typeof m.pause === 'function') m.pause(); }
      } catch (_) { continue; }
      await waitFor(isPaused, 5000, 100);
    }
    if (!isPaused()) throw new Error('the reopened session would not pause');

    // --- The wrap answers 'network'; walk forward until the fetch happens. ---
    S.audioAnswer = 'network';
    out.audioAnswer = S.audioAnswer;
    const noReminder = () => !doc.getElementById('ztts-zotero-reminder');
    out.noReminderAtStart = noReminder();
    let statusBtn = null;
    const callsBefore = S.audioCalls || 0;
    for (let round = 0; round < 15 && !statusBtn; round++) {
      if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 4000, 100); }
      child.zttsCommand('navigate', 'nextSentence');
      await sleep(250);
      if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
      child.zttsCommand('play');
      const t0 = Date.now();
      while (Date.now() - t0 < 1600 && !statusBtn) {
        const b = frame.contentDocument.querySelector('.status-button');
        if (b && b.hidden !== true) statusBtn = b;
        else if (!noReminder()) throw new Error('a reminder appeared on a network error');
        await sleep(120);
      }
    }
    out.audioCallsDelta = (S.audioCalls || 0) - callsBefore;
    out.roundsPlayed = null;
    out.noReminder = noReminder();
    if (!statusBtn) throw new Error('the ! never showed after 15 sentences');
    out.prefStillTrue = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    const diagAfter = JSON.parse(await diagnostics.pluginPlayer());
    const readersNow = Zotero.Reader._readers || [];
    let rowA = null;
    for (let i = 0; i < readersNow.length; i++) {
      if (readersNow[i].itemID !== S.itemID) continue;
      rowA = (diagAfter.readers || [])[i];
    }
    out.playerStillOpen = !!(rowA && rowA.open);
    out.statusTitle = statusBtn.getAttribute('title');

    // --- Click the ! : the popover with the playback message and Retry. ---
    statusBtn.click();
    let pop = null, msg = null, retry = null, buy = null;
    const tPop = Date.now();
    while (Date.now() - tPop < 3000) {
      pop = frame.contentDocument.querySelector('.popover');
      if (pop) {
        msg = pop.querySelector('.error-message');
        retry = pop.querySelector('.retry');
        buy = pop.querySelector('.buy-time');
        if (msg) break;
      }
      await sleep(100);
    }
    out.popover = {
      openedOnClick: !!pop,
      message: msg ? msg.textContent : null,
      messageExact: !!msg && msg.textContent === MESSAGE,
      retryText: retry ? retry.textContent : null,
      hasBuy: !!buy,
    };
    statusBtn.click();
    await sleep(200);
    out.popoverClosedAgain = !frame.contentDocument.querySelector('.popover');

    // --- last unchanged; pause at the end. ---
    const refusalsAfter = JSON.parse(await diagnostics.zoteroRefusals());
    out.lastAfter = refusalsAfter.last;
    out.lastUnchanged = JSON.stringify(refusalsAfter.last) === JSON.stringify(refusalsBefore.last);
    if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 4000, 100); }
    out.sessionAtEnd = { active: !!internal._readAloudManager.active, paused: isPaused() };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
