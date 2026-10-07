// Item 6 (REPLACED, issue #140 beta5): the daily limit. Closes item 5's
// reminder (✕) and its player (the stop close — a fresh session, the stored
// quota error gone), re-opens the player with fresh document activation (the
// reopen sequence 05 paid for: settle → activate → click, again if it folds),
// pauses at once (the session resumes on the per-document voice a6ac2542-en-US,
// verified '::'-less), sets the wrap's audio answer to 'daily-limit-exceeded'
// with the credits answer above 0 ({ standard: 114, premium: 20 }) and steps
// to the next sentence. Play → the stub answers the daily limit → the refusal
// reads NO credits (only a quota-exceeded reads them) → the tier is switched
// off as for used up: the player CLOSES, zotero-tts.zotero-premium.enabled
// goes false, the reminder is the daily-limit text with NO Add more time link
// (✕ present); zoteroRefusals() → last { code: 'daily-limit-exceeded',
// credits: null, action: 'daily-limit', closed: 1 } (only fixture A reads
// with the tier; B was closed in item 4, C reads System). Zotero Standard's
// pref is untouched (read before and after). The reminder is CLOSED (✕) at
// the end — item 7 must find none. Leaves: the wrap installed (07 changes the
// answers), Premium OFF (07 turns it on), A's player closed (07 reopens).
// CACHE NOTE (found live 2026-09-30): Zotero's own side keeps sentence audio
// per voice+text, so the reopened session plays through a run of already
// cached sentences and a read-ahead failure never reaches playback. The play
// therefore goes to a voice never fetched in this document: pause, rewind to
// sentence 0, pick 'Premium Voice 2' ('5c8d9d0d-en-US') while paused, play —
// its sentence 0 is uncached, the stub's daily-limit answer fails PLAYBACK.
// REOPEN NOTE (found live 2026-10-01, on the rebase): a cached sentence 0 is
// NOT guaranteed — error answers are not cached, so a session whose sentence
// 0 only ever failed refetches it at the reopen. The wrap must therefore
// answer 'network' (no account code) BEFORE the reopen and the credits
// answer above 0 too, or a leftover 'daily-limit-exceeded' acts as a second
// refusal at the reopen itself — closing the player and switching the tier
// off before the item even starts. 'daily-limit-exceeded' is set only after
// the pause gate, right before the pick. params: none. state: reads
// itemID/tabID/item1/item3.
(async () => {
  const out = { step: 'daily-limit' };
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
  try {
    if (!host) throw new Error('no main window');
    // The wrap answers 'network' with credits above 0 BEFORE the reopen (see
    // the REOPEN NOTE): the fresh session's first fetch must not meet the
    // previous item's account-code answer.
    S.creditsAnswer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 20 };
    S.audioAnswer = 'network';
    out.audioAnswerAtReopen = S.audioAnswer;
    host.Zotero_Tabs.select(S.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === S.tabID, 8000, 100);
    const readers = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < readers.length; i++) if (readers[i] && readers[i].itemID === S.itemID) reader = readers[i];
    if (!reader) throw new Error('fixture reader gone');
    const internal = reader._internalReader;
    const doc = reader._iframeWindow.document;

    // --- Close the reminder (✕) and the player. ---
    const oldBox = doc.getElementById('ztts-zotero-reminder');
    if (oldBox) {
      const buttons = Array.from(oldBox.querySelectorAll('button'));
      const close = buttons.find((b) => b.getAttribute('aria-label') === 'Close');
      if (close) close.click();
      await sleep(200);
    }
    out.oldReminderClosed = !doc.getElementById('ztts-zotero-reminder');
    const mOld = internal._readAloudManager;
    if (mOld && mOld.active) {
      internal.toggleReadAloudPopup(false);
      const gone = await waitFor(() => { const mm = internal._readAloudManager; return !mm || !mm.active; }, 12000, 200);
      if (!gone) throw new Error('the previous session would not close');
    }
    out.previousSessionClosed = true;

    // --- Reopen (settle → activate → click, again if it folds); pause at once. ---
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
    const m = internal._readAloudManager;
    out.sessionVoice = String(m.selectedVoiceID || '');
    if (out.sessionVoice.includes('::')) throw new Error('the fresh session is not on the Zotero voice: ' + out.sessionVoice);
    out.standardPrefBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');

    // --- The wrap's answers: the daily limit, credits above 0. ---
    S.audioAnswer = 'daily-limit-exceeded';
    out.audioAnswer = S.audioAnswer;
    const launchBefore = (S.launchCalls || []).length;

    // --- Pause, rewind to sentence 0, switch to a never-fetched voice. ---
    // The SWITCH ITSELF fails the item: a voice being switched to counts at
    // once (the pick's own fetch goes through the stub), so the refusal — the
    // player closing, the pref going off, the reminder — happens AT THE PICK,
    // before any play (found live 2026-09-30: waiting for the pick to settle
    // waited forever; the refusal had already acted). Wait for the reminder.
    if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 5000, 100); }
    for (let i = 0; i < 8; i++) { child.zttsCommand('navigate', 'previousSentence'); await sleep(120); }
    if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 5000, 100); }
    const list = m.voicesForLanguage;
    let freshVoice = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const w = Components.utils.waiveXrays(list[i]);
      if (String(w.id) === '5c8d9d0d-en-US') { freshVoice = String(w.id); break; }
    }
    if (!freshVoice) throw new Error('Premium Voice 2 (5c8d9d0d-en-US) is not among the voices');
    out.pickedVoice = freshVoice;
    const tPlay = Date.now();
    child.zttsCommand('voice', freshVoice);
    const reminderAt = await waitFor(() => {
      const box = doc.getElementById('ztts-zotero-reminder');
      return box && box.textContent.indexOf('Zotero Premium has reached today\'s limit') === 0 ? box : null;
    }, 15000, 100);
    out.refusalAtPick = !!reminderAt;
    out.reminderLatencyMs = reminderAt ? Date.now() - tPlay : null;
    if (!reminderAt) throw new Error('the daily-limit reminder never appeared');
    await sleep(600);

    const refusals = JSON.parse(await diagnostics.zoteroRefusals());
    out.last = refusals.last;
    const diagAfter = JSON.parse(await diagnostics.pluginPlayer());
    const readersNow = Zotero.Reader._readers || [];
    const openByItem = {};
    for (let i = 0; i < readersNow.length; i++) {
      const row = (diagAfter.readers || [])[i];
      if (row) openByItem[readersNow[i].itemID] = row.open === true;
    }
    out.playersOpen = { A: openByItem[S.itemID] === true, B: openByItem[S.itemB.itemID] === true, C: openByItem[S.itemC.itemID] === true };
    out.prefPremium = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.standardPrefAfter = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.standardPrefUntouched = out.standardPrefBefore === out.standardPrefAfter;
    out.noLaunchCall = (S.launchCalls || []).length === launchBefore;

    const box = doc.getElementById('ztts-zotero-reminder');
    const buttons = Array.from(box.querySelectorAll('button'));
    const link = buttons.find((b) => b.textContent === 'Add more time') || null;
    const close = buttons.find((b) => b.getAttribute('aria-label') === 'Close') || null;
    out.reminder = {
      text: box.textContent,
      textHasDailyLimit: box.textContent.indexOf('Zotero Premium has reached today\'s limit and has been switched off. Enable it again in OpenReader settings tomorrow.') === 0,
      hasLink: !!link,
      hasClose: !!close,
    };

    // --- ✕: the reminder goes (item 7 must find none). ---
    if (close) close.click();
    await sleep(200);
    out.reminderGoneAfterClose = !doc.getElementById('ztts-zotero-reminder');
    out.sessionAAfter = { active: !!(reader._internalReader._readAloudManager && reader._internalReader._readAloudManager.active) };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
