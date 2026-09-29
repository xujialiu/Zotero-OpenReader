// Item 5 (NEW, issue #140 beta5): short — Zotero refused while credits are
// left. The kept getAPIClient wrap is REINSTALLED here with the live-reading
// closures (04's successful run predated the S.creditsAnswer patch, so its
// installed wrap answers a hard-coded premium 0 — found live 2026-09-30: the
// first 05 run's fresh credits read saw 0, a used-up answer, and the refusal
// never reached `last`): getReadAloudCreditsRemaining answers
// S.creditsAnswer ({ standard: 114, premium: 20 }), getReadAloudAudio answers
// { audio: null, error: S.audioAnswer } ('quota-exceeded') after 400 ms and
// counts. Premium is ON through the pref; fixture A's player is CLOSED and
// REOPENED (a fresh session, the previous one's failed read-aheads gone), it
// resumes on the memory voice — which the earlier picks moved to
// 'a6ac2542-en-US' (Premium Voice 1), verified '::'-less = Zotero before
// opening — and is PAUSED AT ONCE (no fetch while paused). Play is pressed,
// paused again, the player steps to the NEXT sentence (sentence 0 sits in
// Zotero's own local audio cache — it came from there, no network — and the
// next one is uncached) and plays: the fetch IS made through the stub (counts
// ≥ 1), the reading's own voice fails, the fresh credits read says 20 →
// SHORT: nothing closed or switched off; the reminder with the short text and
// the link, NO other-tabs line; the ! shows and, CLICKED, opens "Not enough
// remaining time on Zotero Premium for this voice." with Retry (no .buy-time
// — gone since beta5); zoteroRefusals() → last { action: 'short', credits:
// 20, closed: 0 }. Player stays open, pref stays true. NO real Zotero audio:
// the only network audio proof is the HTTP log (no tts/audio line) — the
// stub answers everything. Leaves the reminder UP and the player open+paused
// (item 6 closes both). params: none. state: reads itemID/tabID/item1/item3;
// keeps getAPIClientOriginal, launchURLOriginal.
(async () => {
  const out = { step: 'short-refusal' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item3 || !S.getAPIClientOriginal) throw new Error('run state missing -- 04 did not run');
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
  try {
    if (!host) throw new Error('no main window');

    // --- Premium ON through the pref; the wrap REINSTALLED with live closures. ---
    if (Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') !== true) p.setBoolPref(prefix + 'zotero-premium.enabled', true);
    out.premiumOn = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.audioAnswer = 'quota-exceeded';
    S.creditsAnswer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 20 };
    const answerFn = () => new Promise((resolve) => setTimeout(() => { S.audioCalls = (S.audioCalls || 0) + 1; resolve({ audio: null, error: S.audioAnswer }); }, 400));
    const creditsFn = async () => ({ ...(S.creditsAnswer || { standardCreditsRemaining: 114, premiumCreditsRemaining: 0 }) });
    let wrappedHow = 'instance-override';
    Zotero.Sync.Runner.getAPIClient = function () {
      const client = orig.apply(this, arguments);
      try {
        client.getReadAloudAudio = answerFn;
        client.getReadAloudCreditsRemaining = creditsFn;
      } catch (e) {
        wrappedHow = 'proxy-fallback (' + String(e).slice(0, 60) + ')';
        return new Proxy(client, {
          get(target, prop) {
            if (prop === 'getReadAloudAudio') return answerFn;
            if (prop === 'getReadAloudCreditsRemaining') return creditsFn;
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      }
      return client;
    };
    out.wrappedHow = wrappedHow;
    if (!S.launchURLOriginal) {
      S.launchURLOriginal = Zotero.launchURL;
      S.launchCalls = [];
      Zotero.launchURL = (url) => { S.launchCalls.push(String(url)); };
    }
    S.audioAnswer = 'quota-exceeded';
    out.audioAnswer = S.audioAnswer;

    // --- Fixture A selected; its player CLOSED then reopened (fresh session). ---
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
      const gone = await waitFor(() => { const mm = internal._readAloudManager; return !mm || !mm.active; }, 12000, 200);
      if (!gone) throw new Error('the previous session would not close');
    }
    out.previousSessionClosed = true;
    const memory = String(Zotero.Prefs.get('zotero-tts.readAloud.memory') || '');
    out.memoryBeforeOpen = { chars: memory.length, isZoteroVoice: !memory.includes('::'), namesPremiumVoice: memory.includes('a6ac2542-en-US') };
    const button = doc.getElementById('ztts-player-toggle');
    const openWait = (timeout) => waitFor(() => {
      const m = internal._readAloudManager;
      const fr = doc.getElementById('ztts-player-frame');
      return m && m.active && fr && !fr.hidden && fr.contentDocument && fr.contentDocument.querySelector('.player') ? fr : null;
    }, timeout, 150);
    // The close's teardown folds a reopen that lands too soon, and the open
    // needs fresh document activation (found live 2026-09-30: 'A player did
    // not reopen' twice; the working sequence was settle -> activate -> click,
    // and when the frame is mounted but folded, one more click reopens it).
    await sleep(800);
    if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
    button.click();
    let opened = await openWait(8000);
    if (!opened) {
      if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
      button.click();
      opened = await openWait(12000);
    }
    if (!opened) throw new Error('A player did not reopen');
    const frame = opened;
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
    const m = internal._readAloudManager;
    out.sessionVoice = String(m.selectedVoiceID || '');
    if (out.sessionVoice.includes('::')) throw new Error('the fresh session is not on the Zotero voice: ' + out.sessionVoice);

    // --- The provider figure back (a figure left at 0 short-circuits the
    // --- fetch at usedUp and the stub is never asked: found live). ---
    const list = m.voicesForLanguage;
    let provider = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const w = Components.utils.waiveXrays(list[i]);
      if (String(w.id) === S.item1.voice) { provider = Components.utils.waiveXrays(w.provider); break; }
    }
    if (!provider) throw new Error('the selected voice provider was not found');
    provider.premiumCreditsRemaining = S.item3.keptPremium;
    out.figureRestored = provider.premiumCreditsRemaining === S.item3.keptPremium;

    // --- Step to the NEXT sentence while paused (0 sits in Zotero's local cache). ---
    const callsBefore = S.audioCalls || 0;
    const launchBefore = (S.launchCalls || []).length;
    child.zttsCommand('navigate', 'nextSentence');
    await sleep(400);
    if (!isPaused()) throw new Error('the session resumed on the navigate');

    // --- Play: the stub answers quota-exceeded after 400 ms; SHORT refusal. ---
    if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
    child.zttsCommand('play');
    const tPlay = Date.now();
    const reminderAt = await waitFor(() => {
      const box = doc.getElementById('ztts-zotero-reminder');
      return box && box.textContent.indexOf('Not enough remaining time on Zotero Premium') === 0 ? box : null;
    }, 10000, 100);
    out.reminderLatencyMs = reminderAt ? Date.now() - tPlay : null;
    if (!reminderAt) throw new Error('the short reminder never appeared');
    await sleep(600);

    const refusals = JSON.parse(await diagnostics.zoteroRefusals());
    out.last = refusals.last;
    const diagAfter = JSON.parse(await diagnostics.pluginPlayer());
    const readersNow = Zotero.Reader._readers || [];
    let rowA = null;
    for (let i = 0; i < readersNow.length; i++) {
      if (readersNow[i].itemID !== S.itemID) continue;
      rowA = (diagAfter.readers || [])[i];
    }
    out.playerStillOpen = !!(rowA && rowA.open);
    out.prefStillTrue = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    out.audioCallsDelta = (S.audioCalls || 0) - callsBefore;
    out.noLaunchCall = (S.launchCalls || []).length === launchBefore;

    const box = doc.getElementById('ztts-zotero-reminder');
    const buttons = Array.from(box.querySelectorAll('button'));
    const link = buttons.find((b) => b.textContent === 'Add more time') || null;
    const close = buttons.find((b) => b.getAttribute('aria-label') === 'Close') || null;
    out.reminder = {
      text: box.textContent,
      textHasShort: box.textContent.indexOf('Not enough remaining time on Zotero Premium for this voice. Choose a cheaper voice, or add more time.') === 0,
      textHasOthersLine: box.textContent.includes('other tab'),
      hasLink: !!link,
      hasClose: !!close,
    };

    // --- The ! : shown (it paints on the player's 250 ms tick — poll), and
    // --- CLICKED it opens the popover with Retry. ---
    let statusBtn = null;
    const tBtn = Date.now();
    while (Date.now() - tBtn < 4000) {
      const b = frame.contentDocument.querySelector('.status-button');
      if (b && b.hidden !== true) { statusBtn = b; break; }
      await sleep(100);
    }
    out.statusButton = { hidden: statusBtn ? statusBtn.hidden === true : null };
    if (!statusBtn) throw new Error('the status button is not shown');
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
      retryText: retry ? retry.textContent : null,
      hasBuy: !!buy,
    };
    statusBtn.click();
    await sleep(200);
    out.popoverClosedAgain = !frame.contentDocument.querySelector('.popover');
    out.sessionAtEnd = { active: !!m.active, paused: isPaused() };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
