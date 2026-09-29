// Item 4: used up. Keeps Zotero.Sync.Runner.getAPIClient and wraps it (the
// instance override, Proxy fallback) so every client it returns answers
// getReadAloudAudio() with { audio: null, error: <the current answer> } after
// 400 ms — the way a real 402 round trip is spaced. Keeps Zotero.launchURL
// and replaces it with a recorder (no page opens). The engine replays a
// failed segment's stored error without refetching (src/core/engine/session.ts
// speak(): failed.has(index) → handleError), so each case's fetch is reached
// by first clearing the manager's stored error (the fixture reset that stands
// for the error's cause going away) and stepping to the NEXT sentence, whose
// audio is not cached: play then fetches, the stub answers, and the status
// popover must open BY ITSELF: 'The time left on Zotero Premium is used up.',
// an 'Add more time' button (.buy-time), no .retry; the voice button's
// .time-left reads 0m with .low; the snapshot's alert is
// { kind: 'time-used-up', buy: true }. Clicking Add more time closes the
// popover and records exactly one launchURL call with
// https://www.zotero.org/settings/readaloud. The error is cleared again and
// play pressed once more: the popover must open by itself again.
// params: none. state: reads itemID/pickedVoice/item1; writes audioAnswer and
// launchCalls; keeps getAPIClientOriginal/launchURLOriginal (restored by
// 90-cleanup).
(async () => {
  const out = { step: 'used-up' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item1) throw new Error('run state missing -- t0/01 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MESSAGE = 'The time left on Zotero Premium is used up.';
  const URL = 'https://www.zotero.org/settings/readaloud';
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
    if (typeof child.zttsCommand !== 'function') throw new Error('zttsCommand export missing');
    const internal = reader._internalReader;
    const m = internal._readAloudManager;
    out.sessionBefore = { active: !!m.active, paused: !!m.paused, error: m ? (m.error ?? null) : null };

    // --- Wrap getAPIClient (reinstalled idempotently; 05/06 only change the answer). ---
    if (S.getAPIClientOriginal) Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.getAPIClientOriginal = orig;
    S.audioAnswer = 'quota-exceeded';
    const answerFn = () => new Promise((resolve) => setTimeout(() => resolve({ audio: null, error: S.audioAnswer }), 400));
    let wrappedHow = 'instance-override';
    Zotero.Sync.Runner.getAPIClient = function () {
      const client = orig.apply(this, arguments);
      try {
        client.getReadAloudAudio = answerFn;
      } catch (e) {
        wrappedHow = 'proxy-fallback (' + String(e).slice(0, 60) + ')';
        return new Proxy(client, {
          get(target, prop) {
            if (prop === 'getReadAloudAudio') return answerFn;
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      }
      return client;
    };
    S.getAPIClientWrappedHow = wrappedHow;
    out.wrappedHow = wrappedHow;

    // --- Stub launchURL with a recorder. ---
    if (!S.launchURLOriginal) {
      S.launchURLOriginal = Zotero.launchURL;
      S.launchCalls = [];
      Zotero.launchURL = (url) => { S.launchCalls.push(String(url)); };
    }
    out.launchStubbed = Array.isArray(S.launchCalls);

    // --- The shared pieces. ---
    const reads = () => {
      const pop = fdoc.querySelector('.popover');
      const msg = pop ? pop.querySelector('.error-message') : null;
      const buy = pop ? pop.querySelector('.buy-time') : null;
      const retry = pop ? pop.querySelector('.retry') : null;
      const btn = fdoc.querySelector('[data-pick="voice"]');
      const time = btn ? btn.querySelector('.time-left') : null;
      return {
        popoverOpen: !!pop,
        message: msg ? msg.textContent : null,
        buyText: buy ? buy.textContent : null,
        hasRetry: !!retry,
        voiceTime: time ? time.textContent : null,
        voiceLow: time ? time.classList.contains('low') : null,
      };
    };
    const clearStoredError = async () => {
      const wm = Components.utils.waiveXrays(m);
      wm._error = null;
      try { if (typeof wm._stateChanged === 'function') wm._stateChanged(); } catch (e) { out.stateChangedError = String(e); }
      // Let at least one player tick (250 ms) sample the error-free state.
      await sleep(500);
      const diag = JSON.parse(await diagnostics.pluginPlayer());
      const openRows = (diag.readers || []).filter((r) => r && r.open);
      const entry = openRows.find((r) => r.state && r.state.voice === S.item1.voice) || openRows[0] || null;
      return entry ? (entry.state.alert ?? null) : 'no entry';
    };
    const nextSentence = () => {
      // The player's own skip button sends this very command.
      child.zttsCommand('navigate', 'nextSentence');
      return 'navigate-nextSentence';
    };
    const playAndWaitForPopover = async (wantMessage, ms) => {
      if (internal && internal._readAloudManager && reader._iframeWindow.document.notifyUserGestureActivation) reader._iframeWindow.document.notifyUserGestureActivation();
      child.zttsCommand('play');
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const f = reads();
        if (f.popoverOpen && f.message === wantMessage) return { at: Date.now() - t0, frame: f };
        await sleep(60);
      }
      return { at: null, frame: reads() };
    };

    // --- First error: clear the stored error, step to an uncached sentence, play. ---
    const ensureNoPopover = () => { const pop = fdoc.querySelector('.popover'); if (pop) pop.remove(); };
    ensureNoPopover();
    const alertAfterClear = await clearStoredError();
    out.alertAfterClear = alertAfterClear;
    if (alertAfterClear !== null) throw new Error('the stored error did not clear for the fixture reset');
    const how = nextSentence();
    out.steppedBy = how;
    await sleep(400);
    const first = await playAndWaitForPopover(MESSAGE, 8000);
    out.openedAtMs = first.at;
    out.afterPlay = first.frame;
    const diag = JSON.parse(await diagnostics.pluginPlayer());
    const openRows = (diag.readers || []).filter((r) => r && r.open);
    const entry = openRows.find((r) => r.state && r.state.voice === S.item1.voice) || openRows[0] || null;
    out.stateAfterPlay = entry ? { alert: entry.state.alert ?? null, error: entry.state.error ?? null, playing: entry.state.playing, voiceRow: (entry.state.voices || []).find((v) => v.value === S.item1.voice) || null } : null;
    out.checks = first.at !== null ? {
      openedWithoutAClick: true,
      openedWithin2s: first.at <= 2000,
      messageExact: first.frame.message === MESSAGE,
      buyTextIsAddMoreTime: first.frame.buyText === 'Add more time',
      noRetry: first.frame.hasRetry === false,
      voiceTime0m: first.frame.voiceTime === '0m',
      voiceLow: first.frame.voiceLow === true,
      alertIsTimeUsedUpWithBuy: !!out.stateAfterPlay && !!out.stateAfterPlay.alert
        && out.stateAfterPlay.alert.kind === 'time-used-up' && out.stateAfterPlay.alert.buy === true,
    } : null;

    // --- Click Add more time: the popover closes, launchURL records the URL once. ---
    const buy = fdoc.querySelector('.popover .buy-time');
    if (!buy) throw new Error('the popover is not open with a buy button at the click step');
    buy.click();
    await sleep(300);
    out.afterBuy = { popoverClosed: !fdoc.querySelector('.popover'), launchCalls: (S.launchCalls || []).slice() };
    out.buyChecks = {
      popoverClosed: out.afterBuy.popoverClosed,
      oneCall: (S.launchCalls || []).length === 1,
      urlExact: (S.launchCalls || [])[0] === URL,
    };

    // --- The error comes back: clear, play (the replay path), the popover opens by itself again. ---
    ensureNoPopover();
    const alertAfterClear2 = await clearStoredError();
    out.alertAfterClear2 = alertAfterClear2;
    const second = await playAndWaitForPopover(MESSAGE, 8000);
    out.reopenedAtMs = second.at;
    out.reopened = second.frame;
    out.reopenedByItself = second.at !== null;

    // --- Close the popover (the status button toggles its own popover) and pause. ---
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
