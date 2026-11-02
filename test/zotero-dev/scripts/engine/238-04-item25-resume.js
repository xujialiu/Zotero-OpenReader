// Issue #238, engine item 25: Play after a pause on Zotero 10.0.7. A plugin
// voice playing fixture-a.pdf (238-03), paused a moment into a long sentence,
// then resumed by each route in turn -- a trusted Shift+Space into the reader
// (nsITextInputProcessor) and the Player's Play button (#ztts-player-frame ->
// button.play) -- pausing again between them. Per resume, read ~2.5 s and
// ~3.0 s after the press:
//   manager.paused false; session.paused false and playing true; playbackTime
//   (clip seconds, so it moves `speed` x faster than the wall clock) larger at
//   the second read; audio.state running; the Play button's aria-label
//   "Pause"; no "clearFailures is not a function" in Services.console since
//   the press (by timestamp). Beta6 (measured): manager.paused false while
//   session.paused true, playing false, playbackTime unchanged, the TypeError
//   at reader.js:82616 once per press.
// The setup of each trial is a jump (manager.repositionTo) to a long sentence:
// the session is then playing, and the trial pauses it ~0.5 clip-s in; it is
// NOT the path under test. The pause before the resume lasts ~1.0 s (< 5 s:
// the resume is at the exact place, item 11), so playbackTime should advance
// by about speed x elapsed from the pause point.
// Window: the trusted key goes through the main window. The first trials run
// as the window stands (restored, as the reader's open left it); then the
// window is minimized and the next trials run minimized, to learn which route
// needs the foreground. A key that is not consumed minimized is recorded, not
// retried. The window is NOT restored by this script (the cleanup does).
// params: label ('A'), trials (JSON: [{ route: 'key'|'button', seg, minimize? }]).
// state: reads fixtures[label], runStartMs; writes item25.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sleepUntil = (t) => sleep(Math.max(0, t - Date.now()));
  const label = P.label || 'A';
  const fx = S.fixtures[label];
  const r = (Zotero.Reader._readers || []).find((x) => x.itemID === fx.itemID);
  if (!r) throw new Error('fixture reader not found');
  const win = r._window;
  const ir = r._internalReader;
  const rw = ir._primaryView._iframeWindow;
  const M = () => ir._readAloudManager;
  const defaultTrials = [{ route: 'key', seg: 7 }, { route: 'button', seg: 10 }, { route: 'button', seg: 7, minimize: true }, { route: 'key', seg: 10 }];
  const trials = P.trials ? JSON.parse(P.trials) : defaultTrials;
  const out = { step: '238-04-item25-resume', label, at: new Date().toISOString(), windowStateAtStart: win.windowState, trials: [] };

  const engineFor = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers.find((x) => x.itemID === fx.itemID) || null;
  const playBtn = () => {
    const frame = r._iframeWindow.document.getElementById('ztts-player-frame');
    const fdoc = frame && wu(wu(frame.contentWindow).document);
    return fdoc ? fdoc.querySelector('button.play') : null;
  };
  const activeIndex = () => {
    const m = M(); const seg = m.activeSegment; const segs = m.segments;
    if (!seg || !segs) return -1;
    for (let i = 0; i < segs.length; i++) if (segs[i] === seg) return i;
    return -1;
  };
  const snap = async (since) => {
    const m = M();
    const e = await engineFor();
    const b = playBtn();
    const s = e && e.session;
    return {
      dtMs: Date.now() - since,
      mgr: { active: m.active, paused: m.paused, error: m.error || null, buffering: m.buffering, activeSeg: activeIndex() },
      session: s && { paused: s.paused, playing: s.playing, playbackTime: Math.round(s.playbackTime * 1000) / 1000, clipDuration: s.clipDuration && Math.round(s.clipDuration * 1000) / 1000, currentIndex: s.currentIndex, position: s.position, error: s.error, inGap: s.inGap, speed: s.speed },
      audio: e && e.audio && e.audio.state,
      label: b ? { aria: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed') } : null,
    };
  };
  const consoleHits = (sinceMs) => {
    const hits = [];
    try {
      for (const msg of Services.console.getMessageArray()) {
        const text = String(msg.message || '');
        if (/clearFailures/.test(text) && Number(msg.timeStamp) >= sinceMs) hits.push({ ts: Number(msg.timeStamp), text: text.slice(0, 120) });
      }
    } catch (e) { hits.push({ error: String(e) }); }
    return hits;
  };
  const sendShiftSpace = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const host = win; const K = host.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(host);
    const keys = [tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16, false))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return keys;
  };

  for (let n = 0; n < trials.length; n++) {
    const spec = trials[n];
    const T = { n: n + 1, route: spec.route, seg: spec.seg };
    out.trials.push(T);
    try {
      if (spec.minimize && win.windowState !== 2) { win.minimize(); await sleep(900); }
      T.windowStateAtStart = win.windowState;

      // Setup (not under test): jump to the sentence, let it start, pause ~0.5 clip-s in
      M().repositionTo(spec.seg);
      let e = null;
      const tS = Date.now();
      while (Date.now() - tS < 15000) {
        e = await engineFor();
        if (e && e.session && e.session.currentIndex === spec.seg && e.session.playing && e.session.playbackTime >= 0.45) break;
        await sleep(30);
      }
      T.setupMs = Date.now() - tS;
      M().pause();
      await sleep(300);
      T.paused = await snap(Date.now());
      const pausePoint = T.paused.session && T.paused.session.playbackTime;
      T.pausedOk = !!(T.paused.mgr.paused && T.paused.session && T.paused.session.paused && !T.paused.session.playing && T.paused.session.currentIndex === spec.seg);
      await sleep(700); // the pause lasts ~1.0 s in all, well under 5 s

      // The press
      const tPress = Date.now();
      T.pressAt = tPress;
      if (spec.route === 'key') {
        if (win.windowState !== 2) { try { win.focus(); } catch (err) { /* recorded by the state read */ } }
        try { rw.focus(); } catch (err) { T.focusErr = String(err); }
        T.windowStateAfterFocus = win.windowState;
        try {
          const keys = sendShiftSpace();
          T.keys = keys;
          T.keydownConsumed = keys[1];
        } catch (err) { T.keyErr = String(err); }
      } else {
        const b = playBtn();
        if (!b) throw new Error('button.play not found');
        T.labelBefore = b.getAttribute('aria-label');
        b.click();
      }
      const m = M();
      T.sync = { mgrPaused: m.paused, mgrError: m.error || null };
      await sleepUntil(tPress + 2500);
      T.read1 = await snap(tPress);
      await sleepUntil(tPress + 3000);
      T.read2 = await snap(tPress);
      T.consoleClearFailures = consoleHits(tPress - 50);
      T.windowStateAtEnd = win.windowState;

      // Verdict of this trial, from the stated expectations
      const a = T.read1, b2 = T.read2;
      const ok = (x) => !!(x && x.mgr.paused === false && x.session && x.session.paused === false && x.session.playing === true && x.audio === 'running' && x.label && x.label.aria === 'Pause');
      T.checks = {
        read1: ok(a), read2: ok(b2),
        sameSentence: !!(a.session && b2.session && a.session.currentIndex === spec.seg && b2.session.currentIndex === spec.seg),
        playbackTimeLarger: !!(a.session && b2.session && b2.session.playbackTime > a.session.playbackTime),
        advancedFromPause: a.session && pausePoint !== undefined ? Math.round((a.session.playbackTime - pausePoint) * 1000) / 1000 : null,
        expectedAdvanceAt2_5s: a.session ? Math.round(a.session.speed * (a.dtMs / 1000 - 0.0) * 1000) / 1000 : null,
        noClearFailuresError: T.consoleClearFailures.length === 0,
      };
      T.pass = !!(T.checks.read1 && T.checks.read2 && T.checks.playbackTimeLarger && T.checks.noClearFailuresError);
    } catch (err) {
      T.error = String(err);
    }
    // End of the trial: pause again (the pause between the routes)
    try { M().pause(); await sleep(300); T.endPaused = M().paused; } catch (err) { T.endPauseErr = String(err); }
  }
  out.windowStateAtEnd = win.windowState;
  out.allConsoleClearFailuresSinceRun = consoleHits(S.runStartMs);
  S.item25 = out;
  return JSON.stringify(out, null, 1);
})();
