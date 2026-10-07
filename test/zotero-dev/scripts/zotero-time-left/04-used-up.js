// Item 4 (REPLACED, issue #140 beta5): used up — the tier is switched off,
// every player reading with it is closed, and a reminder opens over the
// document; Zotero is NEVER ASKED. Setup (once, kept for 05-08):
//   - fixture B imported and opened in a second tab, its player opened,
//     paused AT ONCE and driven to Zotero Premium / en-US / 'Premium Voice 1'
//     while paused (t0's technique — no fetch while paused);
//   - a third tab (fixtureTitle + ' C') whose player is paused on a FREE
//     plugin voice: extensions.zotero.zotero-tts.system.enabled is turned on
//     (t0's snapshot holds the owner value; 90 restores it), the player is
//     driven to the System provider ('system' — its voices' ids read
//     'system::osx/…', '::'-bearing like any plugin voice) — never fish,
//     never Zotero. The brief: the third tab reads with a free plugin voice.
// Then, in fixture A (tab selected): the voice's provider figure set to 0
// (kept) — the voice's own minutesRemaining goes 0 with it — and
// Zotero.Sync.Runner.getAPIClient wrapped so getReadAloudCreditsRemaining()
// answers { standard: 114, premium: 0 } and getReadAloudAudio() answers
// { audio: null, error: S.audioAnswer } after 400 ms AND COUNTS ITS CALLS.
// Zotero.launchURL is stubbed with a recorder (no page opens). Play:
// within 3 s — getReadAloudAudio called 0 times (usedUp short-circuits,
// fetchFor never asks); A's and B's players CLOSED, C's still open;
// zotero-premium.enabled false; in A's document #ztts-zotero-reminder with
// the used-up text and 'Reading also stopped in 1 other tab.', an 'Add more
// time' button and a ✕ (aria-label Close);
// diagnostics.zoteroRefusals() → last { code: 'quota-exceeded', tier:
// 'premium', credits: 0, minutes: 0, action: 'used-up', closed: 2 }.
// Click Add more time → launchURL once with
// https://www.zotero.org/settings/readaloud, the reminder stays; click ✕ →
// gone. Settings → Premium: 'Enable', 'Remaining time: 0min' red with its
// link; the window is closed again. Leaves: the wrap + recorder installed
// (05-07 change the answers; 90 restores), Premium OFF (05 turns it on),
// A's player closed (05 re-opens it).
// params: none. state: reads itemID/tabID/pickedVoice/item1/item3; writes
// audioAnswer, audioCalls, launchCalls; keeps getAPIClientOriginal,
// launchURLOriginal, items B/C, the kept provider figure.
(async () => {
  const out = { step: 'used-up-never-asked' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item3) throw new Error('run state missing -- t0/03 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const URL = 'https://www.zotero.org/settings/readaloud';
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
  const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
  try {
    if (!host) throw new Error('no main window');

    // --- A fixture item: import once, open in its own tab, wait ready. ---
    const openFixture = async (title) => {
      const lib = Zotero.Libraries.userLibraryID;
      const s = new Zotero.Search();
      s.addCondition('libraryID', 'is', String(lib));
      s.addCondition('title', 'is', title);
      const ids = await s.search();
      let itemID = null;
      for (const id of ids) { const it = Zotero.Items.get(id); if (it && it.isAttachment()) { itemID = id; break; } }
      if (itemID === null) {
        const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(Zotero.ZoteroTTSRun.params.root, 'test', 'fixtures', 'fixture-a.pdf'), libraryID: lib, title });
        itemID = item.id;
      }
      const importedNow = !ids.length;
      let reader = readerOf(itemID);
      if (!reader) { await Zotero.Reader.open(itemID); reader = await waitFor(() => readerOf(itemID), 20000, 200); }
      await waitFor(() => reader && reader._internalReader && reader._internalReader._readAloudManager && reader._iframeWindow && reader._iframeWindow.document, 24000, 300);
      return { itemID, importedNow, reader };
    };

    // --- Open + pause + drive a tab's player (t0's reliable sequence). ---
    const setUpPlayer = async (entry, picks) => {
      const reader = entry.reader;
      const internal = reader._internalReader;
      host.Zotero_Tabs.select(entry.tabID);
      await waitFor(() => host.Zotero_Tabs.selectedID === entry.tabID, 8000, 100);
      const doc = reader._iframeWindow.document;
      const button = doc.getElementById('ztts-player-toggle');
      if (!button) throw new Error('player icon missing in ' + entry.title);
      let frame0 = doc.getElementById('ztts-player-frame');
      const m0 = internal._readAloudManager;
      const alreadyOpen = !!(frame0 && !frame0.hidden && m0 && m0.active);
      if (!alreadyOpen) button.click();
      const opened = await waitFor(() => {
        const m = internal._readAloudManager;
        const frame = doc.getElementById('ztts-player-frame');
        return m && m.active && frame && !frame.hidden && frame.contentDocument && frame.contentDocument.querySelector('.player') ? frame : null;
      }, 24000, 150);
      if (!opened) throw new Error('the player did not open in ' + entry.title);
      const child = Components.utils.waiveXrays(opened.contentWindow);
      if (typeof child.zttsCommand !== 'function') throw new Error('zttsCommand export missing in ' + entry.title);
      const isPaused = () => { const m = internal._readAloudManager; return !!(m && m.active && m.paused); };
      for (let attempt = 0; attempt < 3 && !isPaused(); attempt++) {
        const how = attempt === 0 ? 'play-button' : attempt === 1 ? 'zttsCommand-play' : 'manager-pause';
        try {
          if (how === 'play-button') { const playBtn = opened.contentDocument.querySelector('.play'); if (playBtn) playBtn.click(); }
          else if (how === 'zttsCommand-play') child.zttsCommand('play');
          else { const m = internal._readAloudManager; if (m && typeof m.pause === 'function') m.pause(); }
        } catch (_) { continue; }
        await waitFor(isPaused, 5000, 100);
      }
      if (!isPaused()) throw new Error('the session in ' + entry.title + ' would not pause');
      const snap = async () => {
        // Rows are positional over Zotero.Reader._readers: with three players
        // open, "first open row" would read fixture A's state, never this
        // entry's (found live 2026-09-30: C's provider pick "never settled"
        // while A's premium state was being tested).
        const diag = JSON.parse(await diagnostics.pluginPlayer());
        const readersNow = Zotero.Reader._readers || [];
        const rows = diag.readers || [];
        for (let i = 0; i < readersNow.length; i++) {
          if (readersNow[i].itemID !== entry.itemID) continue;
          const row = rows[i];
          return row && row.open && row.state ? row.state : null;
        }
        return null;
      };
      const pick = async (action, value, test) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!isPaused()) throw new Error('resumed before a pick in ' + entry.title);
          child.zttsCommand(action, value);
          const ok = await waitFor(async () => {
            const st = await snap();
            return st && test(st) ? st : null;
          }, 20000, 150);
          if (ok) return ok;
        }
        throw new Error('pick did not settle in ' + entry.title + ': ' + action);
      };
      const waitListed = (test, what) => waitFor(async () => {
        const st = await snap();
        return st && test(st) ? st : null;
      }, 45000, 250).then((st) => { if (!st) throw new Error(what + ' never listed in ' + entry.title); return st; });
      for (const pickStep of picks) {
        if (pickStep.listed) await waitListed(pickStep.listed, pickStep.what);
        await pick(pickStep.action, pickStep.value, pickStep.test);
      }
      const m = internal._readAloudManager;
      const st = await snap();
      if (!(m.active && m.paused)) throw new Error('the session in ' + entry.title + ' is not active+paused after the picks');
      return { child, state: st };
    };

    // --- Fixture B: second tab, paused on Zotero Premium Voice 1. ---
    if (!S.itemB) {
      const titleB = Zotero.ZoteroTTSRun.params.fixtureTitle.replace(/ A$/, '') + ' B';
      const entryB = await openFixture(titleB);
      entryB.title = titleB;
      entryB.tabID = entryB.reader.tabID;
      await setUpPlayer(entryB, [
        { what: 'the Zotero Premium provider', listed: (st) => (st.providers || []).some((v) => v.value === 'premium'), action: 'provider', value: 'premium', test: (st) => st.provider === 'premium' },
        { what: 'the en-US locale', listed: (st) => (st.locales || []).some((v) => v.value === 'en-US'), action: 'locale', value: 'en-US', test: (st) => st.locale === 'en-US' || st.locale === 'en' },
        { what: 'Premium Voice 1', listed: (st) => (st.voices || []).some((v) => v.label === 'Premium Voice 1'), action: 'voice', value: S.pickedVoice ? S.pickedVoice.id : null, test: (st) => st.voice === (S.pickedVoice ? S.pickedVoice.id : st.voice) },
      ]);
      const diagB = JSON.parse(await diagnostics.pluginPlayer());
      const openB = (diagB.readers || []).filter((r) => r && r.open);
      const stB = openB.map((r) => r.state)[0] || null;
      if (!stB || stB.voice !== (S.pickedVoice ? S.pickedVoice.id : stB.voice)) throw new Error('B did not settle on Premium Voice 1');
      S.itemB = { itemID: entryB.itemID, tabID: entryB.tabID, title: titleB, voice: stB.voice };
    }
    out.itemB = { itemID: S.itemB.itemID, tabID: S.itemB.tabID, voice: S.itemB.voice };

    // --- Fixture C: third tab, paused on a FREE plugin voice (System voices). ---
    if (!S.itemC) {
      const sysRec = S.baseline['system.enabled'];
      S.systemEnabledWasUser = sysRec ? sysRec.user : false;
      if (Zotero.Prefs.get('zotero-tts.system.enabled') !== true) p.setBoolPref(prefix + 'system.enabled', true);
      out.systemEnabled = Zotero.Prefs.get('zotero-tts.system.enabled') === true;
      const titleC = Zotero.ZoteroTTSRun.params.fixtureTitle.replace(/ A$/, '') + ' C';
      const entryC = await openFixture(titleC);
      entryC.title = titleC;
      entryC.tabID = entryC.reader.tabID;
      let settledVoice = null;
      const setUp = await setUpPlayer(entryC, [
        { what: 'the System voices provider', listed: (st) => (st.providers || []).some((v) => v.value === 'system'), action: 'provider', value: 'system', test: (st) => st.provider === 'system' },
      ]);
      const stC0 = setUp.state;
      const sysRow = (stC0.voices || []).find((v) => String(v.value).startsWith('system::'));
      if (!sysRow) throw new Error('no system voice listed in the System tier of ' + titleC);
      await setUpPlayer(entryC, [
        { what: 'the system voice row', listed: (st) => (st.voices || []).some((v) => String(v.value).startsWith('system::')), action: 'voice', value: sysRow.value, test: (st) => String(st.voice).startsWith('system::') },
      ]);
      settledVoice = sysRow.value;
      if (!String(settledVoice).startsWith('system::')) throw new Error('the third tab did not settle on a system voice: ' + settledVoice);
      S.itemC = { itemID: entryC.itemID, tabID: entryC.tabID, title: titleC, voice: settledVoice };
    }
    out.itemC = { itemID: S.itemC.itemID, tabID: S.itemC.tabID, voice: S.itemC.voice };

    // --- Back to fixture A. ---
    host.Zotero_Tabs.select(S.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === S.tabID, 8000, 100);
    const readerA = readerOf(S.itemID);
    if (!readerA) throw new Error('fixture reader gone');
    const docA = readerA._iframeWindow.document;
    const frameA = docA.getElementById('ztts-player-frame');
    const internalA = readerA._internalReader;
    if (!frameA || frameA.hidden) throw new Error('fixture A player frame is hidden');
    const childA = Components.utils.waiveXrays(frameA.contentWindow);
    const mA = internalA._readAloudManager;
    out.sessionBefore = { active: !!mA.active, paused: !!mA.paused, voice: mA ? mA.selectedVoiceID : null };

    // --- The provider figure to 0 (kept); the voice's minutesRemaining follows. ---
    const list = mA.voicesForLanguage;
    let provider = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const w = Components.utils.waiveXrays(list[i]);
      if (String(w.id) === S.item1.voice) { provider = Components.utils.waiveXrays(w.provider); break; }
    }
    if (!provider) throw new Error('the selected voice provider was not found');
    if (typeof S.item3.keptPremium !== 'number') throw new Error('kept provider figure missing');
    provider.premiumCreditsRemaining = 0;
    out.figureZeroed = true;
    await sleep(400); // one player tick: the voice's own figure reads 0 now
    let minutesNow = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const w = Components.utils.waiveXrays(list[i]);
      if (String(w.id) === S.item1.voice) minutesNow = typeof w.minutesRemaining === 'number' ? w.minutesRemaining : null;
    }
    out.voiceMinutesAfterZero = minutesNow;
    if (!(minutesNow !== null && minutesNow <= 0)) throw new Error('the voice minutesRemaining did not go 0 with the provider figure');

    // --- Wrap getAPIClient: credits answer 0 for premium; audio counts. ---
    if (S.getAPIClientOriginal) Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.getAPIClientOriginal = orig;
    S.audioAnswer = 'quota-exceeded';
    S.audioCalls = 0;
    // Both answers are mutable through the state so 05-07 only set fields:
    // the credits answer (the refusal's fresh read) and the audio error.
    S.creditsAnswer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 0 };
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
    S.getAPIClientWrappedHow = wrappedHow;
    out.wrappedHow = wrappedHow;

    // --- Stub launchURL with a recorder. ---
    if (!S.launchURLOriginal) {
      S.launchURLOriginal = Zotero.launchURL;
      S.launchCalls = [];
      Zotero.launchURL = (url) => { S.launchCalls.push(String(url)); };
    }
    out.launchStubbed = Array.isArray(S.launchCalls);

    // --- PLAY, and watch the refusal act. ---
    if (readerA._iframeWindow.document.notifyUserGestureActivation) readerA._iframeWindow.document.notifyUserGestureActivation();
    childA.zttsCommand('play');
    const tPlay = Date.now();
    const audioCallsBefore = S.audioCalls;
    const reminderAt = await waitFor(() => {
      const box = docA.getElementById('ztts-zotero-reminder');
      return box && box.textContent ? box : null;
    }, 8000, 100);
    out.reminderLatencyMs = reminderAt ? Date.now() - tPlay : null;
    if (!reminderAt) throw new Error('the reminder never appeared in fixture A');
    const refusals = JSON.parse(await diagnostics.zoteroRefusals());
    out.last = refusals.last;
    // The closes land one tick behind the reminder (this run's first read,
    // same beat as the reminder, still saw all three open while last.closed
    // was already 2): poll the diagnostic until A and B read closed.
    const readersNow = Zotero.Reader._readers || [];
    const readOpenByItem = async () => {
      const d = JSON.parse(await diagnostics.pluginPlayer());
      const openByItem = {};
      for (let i = 0; i < readersNow.length; i++) {
        const row = (d.readers || [])[i];
        if (row) openByItem[readersNow[i].itemID] = row.open === true;
      }
      return openByItem;
    };
    const settledOpen = await waitFor(async () => {
      const o = await readOpenByItem();
      return o[S.itemID] === false && o[S.itemB.itemID] === false ? o : null;
    }, 4000, 150);
    const openByItem = settledOpen || (await readOpenByItem());
    out.closesSettled = openByItem[S.itemID] === false && openByItem[S.itemB.itemID] === false;
    out.playersOpen = {
      A: openByItem[S.itemID] === true,
      B: openByItem[S.itemB.itemID] === true,
      C: openByItem[S.itemC.itemID] === true,
    };
    const mAAfter = readerA._internalReader._readAloudManager;
    out.sessionAAfter = { active: !!mAAfter.active };
    out.prefPremium = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    out.audioCallCount = S.audioCalls;
    out.audioCallsDelta = S.audioCalls - audioCallsBefore;

    // --- The reminder's content. ---
    const box = docA.getElementById('ztts-zotero-reminder');
    const buttons = Array.from(box.querySelectorAll('button'));
    const link = buttons.find((b) => b.textContent === 'Add more time') || null;
    const close = buttons.find((b) => b.getAttribute('aria-label') === 'Close') || null;
    out.reminder = {
      text: box.textContent,
      role: box.getAttribute('role'),
      textHasUsedUp: box.textContent.indexOf('Zotero Premium has no remaining time and has been switched off. Add more time, then enable it again in OpenReader settings.') === 0,
      textHasOthersLine: box.textContent.includes('Reading also stopped in 1 other tab.'),
      hasLink: !!link,
      hasClose: !!close,
      closeAriaLabel: close ? close.getAttribute('aria-label') : null,
    };

    // --- Add more time: one launchURL call, the reminder stays. ---
    const callsBefore = (S.launchCalls || []).length;
    if (link) link.click();
    await sleep(300);
    out.afterBuyClick = {
      launchCalls: (S.launchCalls || []).slice(callsBefore),
      reminderStillThere: !!docA.getElementById('ztts-zotero-reminder'),
    };

    // --- ✕: the reminder goes. ---
    if (close) close.click();
    await sleep(200);
    out.reminderGoneAfterClose = !docA.getElementById('ztts-zotero-reminder');

    // --- Settings: Premium reads Enable and 0min in red with its link. ---
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const tWin = Date.now();
    while (Date.now() - tWin < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (win) {
      await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
      const pdoc = win.document;
      let section = pdoc.getElementById('ztts-zotero-section');
      const tSec = Date.now();
      while (!section && Date.now() - tSec < 8000) { await sleep(150); section = pdoc.getElementById('ztts-zotero-section'); }
      let creditsText = null;
      const tTxt = Date.now();
      while (Date.now() - tTxt < 20000) {
        const tEl = pdoc.getElementById('ztts-zotero-credits-premium');
        if (tEl && tEl.textContent) { creditsText = tEl.textContent; break; }
        await sleep(200);
      }
      const tEl = pdoc.getElementById('ztts-zotero-credits-premium');
      const buyEl = pdoc.getElementById('ztts-zotero-buy-premium');
      const toggleEl = pdoc.getElementById('ztts-enable-zotero-premium');
      const redProbe = pdoc.createElement('description');
      pdoc.querySelector('.ztts-pane').appendChild(redProbe);
      redProbe.style.color = 'var(--accent-red)';
      const accentRed = win.getComputedStyle(redProbe).color;
      redProbe.remove();
      out.settingsPremium = {
        label: toggleEl ? toggleEl.getAttribute('label') : null,
        creditsText,
        creditsTextIsZeroMin: creditsText === 'Remaining time: 0min',
        noneAttr: tEl ? tEl.hasAttribute('data-ztts-none') : null,
        colorIsAccentRed: tEl ? win.getComputedStyle(tEl).color === accentRed : null,
        buyHidden: buyEl ? buyEl.hidden === true : null,
      };
      win.close();
      const tClose = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tClose < 10000) await sleep(200);
    }
    out.settingsOpened = !!win;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
