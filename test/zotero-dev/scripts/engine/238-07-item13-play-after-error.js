// Issue #238, engine item 13 on Zotero 10.0.7 (revised): Play after a failed
// request. Method of 133-12: the Local provider's address is moved between
// the fake Kokoro-shaped server (238-05, working) and a closed port (the
// failure: `network`). Expected on 10.0.7 and later, whose Read Aloud play()
// clears the failures first (reader.js 82608-82620):
//   1. a request fails: session.error and manager.error `network`, the
//      manager paused, the highlight on that segment, the Player's status
//      button "!" with the message (settled ~1.5 s later: the Player page
//      republishes on throttled timers while the window is minimized);
//      nothing then happens on its own (the idle watch shows no change);
//   2. Play with the server still down, three presses: manager.error null AT
//      ONCE (read in the same turn as the call), one more request
//      (store.requests +1), the error back (the server still fails), the
//      manager paused again, no further change for 0.9 s;
//   3. the server answering again, Play (the Player's button): it plays that
//      sentence -- error null, playing true, the server's log shows exactly
//      one new request for it;
//   4. Retry still asks again: at a second failed segment, manager.retry()
//      with the server down is one more request and the error back; with the
//      server up it plays.
// Before 10.0.7 Play failed again at once, without a request (133-12).
// Every step is watched, not polled: the manager and the Engine's session are
// sampled every ~6 ms and only the samples that differ from the one before
// are kept (dt in ms from the press), so a request nobody pressed for would
// show as a `req` step of its own. (The stopped run's third pass had one such
// step between two presses, 238 item13c; this version exists to look at it.)
// Targets: segments never requested of the fake voice (the server's log is
// mapped back to indices by the text length, distinct per segment of
// fixture-a.pdf); a segment with followers also shows the read-ahead, whose
// answers come from the plugin's cache and count as store requests.
// params: workingURL, downURL, logFile, failSeg (16), retrySeg (12), voice ('af_fake'), presses (3),
// skipRetry (steps 4-5 left out: the run with the SLOW-failing down address needs no second segment).
// state: reads fixtures.B, segLens; writes item13.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fx = S.fixtures.B;
  const r = (Zotero.Reader._readers || []).find((x) => x.itemID === fx.itemID);
  if (!r) throw new Error('fixture B reader not found');
  const ir = r._internalReader;
  const M = () => ir._readAloudManager;
  const lens = S.segLens;
  const X = Number(P.failSeg ?? 16), Y = Number(P.retrySeg ?? 12);
  const presses = Number(P.presses ?? 3);
  const voice = P.voice || 'af_fake';
  const out = { step: '238-07-item13-play-after-error', at: new Date().toISOString(), X, Y, windowState: r._window.windowState, steps: {} };

  const setBase = (u) => Zotero.Prefs.set('zotero-tts.local.baseURL', u);
  const engineFor = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers.find((x) => x.itemID === fx.itemID) || null;
  const activeIndex = () => {
    const m = M(); const seg = m.activeSegment; const segs = m.segments;
    if (!seg || !segs) return -1;
    for (let i = 0; i < segs.length; i++) if (segs[i] === seg) return i;
    return -1;
  };
  const fdoc = () => { const f = r._iframeWindow.document.getElementById('ztts-player-frame'); return f && wu(wu(f.contentWindow).document); };
  const playerState = () => {
    const d = fdoc(); if (!d) return null;
    const st = d.querySelector('.status-button'); const pb = d.querySelector('button.play');
    return { statusHidden: st ? st.hidden : null, statusText: st ? st.textContent : null, statusTitle: st ? String(st.title).slice(0, 90) : null, playAria: pb ? pb.getAttribute('aria-label') : null };
  };
  const readLog = async () => {
    try { return (await IOUtils.readUTF8(P.logFile)).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; }
  };
  const posts = (log) => log.filter((l) => l.path === '/dev/captioned_speech' && l.voice === voice);
  const segOf = (l) => lens.indexOf(l.chars);
  const sample = async () => {
    const m = M();
    const mgr = { paused: m.paused, error: m.error || null, activeSeg: activeIndex() };
    const e = await engineFor(); const s = e.session; const st = e.stats || {};
    return {
      at: Date.now(), mgrPaused: mgr.paused, mgrError: mgr.error, activeSeg: mgr.activeSeg,
      sErr: s.error, sPaused: s.paused, playing: s.playing, idx: s.currentIndex, pos: s.position,
      req: s.store ? s.store.requests : null, buffering: s.buffering, audio: e.audio && e.audio.state, voice: s.voice,
      stats: [st.controllers, st.carriedOn, st.started, st.ended, st.adopted, st.late, st.fallbacks].join('/'),
    };
  };
  const sig = (x) => [x.req, x.sErr, x.sPaused, x.playing, x.mgrPaused, x.mgrError, x.stats, x.idx, x.pos, x.buffering].join('|');
  // Sample every ~6 ms for `ms` (or until `stopWhen`), keeping the samples that differ from the one before
  const watch = async (ms, t0, stopWhen) => {
    const changes = []; let last = null, lastSample = null;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const x = await sample(); lastSample = x;
      const k = sig(x);
      if (k !== last) {
        changes.push({ dt: x.at - t0, req: x.req, sErr: x.sErr, sPaused: x.sPaused, playing: x.playing, mgrPaused: x.mgrPaused, mgrError: x.mgrError, idx: x.idx, stats: x.stats });
        last = k;
      }
      if (stopWhen && stopWhen(x)) break;
      await sleep(6);
    }
    return { changes, last: lastSample };
  };
  const slim = (x) => ({ req: x.req, sErr: x.sErr, mgrError: x.mgrError, mgrPaused: x.mgrPaused, sPaused: x.sPaused, activeSeg: x.activeSeg, pos: x.pos, stats: x.stats });
  const verdict = {};

  try {
    // --- precondition: the session is on the fake voice, paused; X and Y never requested of it
    const log0 = await readLog();
    const requested0 = new Set(posts(log0).map(segOf));
    out.requestedBefore = [...requested0].sort((a, b) => a - b);
    if (requested0.has(X) || requested0.has(Y)) throw new Error('a target segment was already requested of the fake voice: ' + JSON.stringify(out.requestedBefore));
    const s0 = await sample();
    out.start = slim(s0);
    if (s0.voice !== 'local::' + voice) throw new Error('the session is not on the fake voice: ' + s0.voice);
    let postCount = posts(log0).length;

    // --- 1. the failure (server down), at X, then a quiet look
    setBase(P.downURL);
    const tF = Date.now();
    M().repositionTo(X);
    const f1 = await watch(2000, tF);
    const f1Fast = playerState();
    await sleep(600);
    const f1Settled = playerState();
    const failed1 = f1.changes.find((c) => c.sErr);
    out.steps.failure1 = { errorAtMs: failed1 ? failed1.dt : null, changes: f1.changes, final: slim(f1.last), playerAtOnce: f1Fast, playerSettled: f1Settled };
    verdict.failure = !!(failed1 && failed1.sErr === 'network' && f1.last.mgrError === 'network' && f1.last.mgrPaused === true && f1.last.activeSeg === X && f1Settled && f1Settled.statusText === '!' && f1Settled.statusHidden === false);
    verdict.idleAfterFailure = f1.changes.filter((c) => c.dt > (failed1 ? failed1.dt + 40 : 0)).length === 0;

    // --- 2. Play with the server still down, several presses
    out.steps.playDown = [];
    for (let i = 0; i < presses; i++) {
      const before = await sample();
      const t0 = Date.now();
      M().play();
      const sync = { mgrError: M().error || null, mgrPaused: M().paused };
      const w = await watch(900, t0);
      const logN = posts(await readLog()).length;
      const back = w.changes.find((c) => c.sErr);
      const step = {
        press: i + 1, before: slim(before), sync, errorBackMs: back ? back.dt : null, changes: w.changes, after: slim(w.last),
        requestsDelta: w.last.req - before.req, serverNewPosts: logN - postCount,
      };
      step.ok = !!(before.sErr === 'network' && before.mgrPaused === true && sync.mgrError === null && step.requestsDelta === 1 && back && w.last.sErr === 'network' && w.last.mgrError === 'network' && w.last.mgrPaused === true && step.serverNewPosts === 0);
      out.steps.playDown.push(step);
      postCount = logN;
    }
    await sleep(1200);
    out.steps.afterPlayDownPlayer = playerState(); // settled: the error is back, the manager paused
    verdict.playDown = out.steps.playDown.every((s) => s.ok);

    // --- 3. the server answering again; Play through the Player's button
    setBase(P.workingURL);
    await sleep(150);
    {
      const before = await sample();
      const btn = fdoc().querySelector('button.play');
      const labelBefore = btn.getAttribute('aria-label');
      const t0 = Date.now();
      btn.click();
      await Promise.resolve();
      const syncMgr = { mgrError: M().error || null, mgrPaused: M().paused };
      const w = await watch(15000, t0, (x) => x.playing && x.idx === X && !x.sErr);
      await sleep(300);
      const later = await sample();
      const log1 = await readLog();
      const fresh = posts(log1).slice(postCount);
      const reached = w.changes.find((c) => c.playing && c.idx === X && !c.sErr);
      out.steps.playUp = {
        labelBefore, before: slim(before), syncMgr, playingAfterMs: reached ? reached.dt : null, changes: w.changes,
        later: { sErr: later.sErr, mgrError: later.mgrError, mgrPaused: later.mgrPaused, playing: later.playing, idx: later.idx, req: later.req, audio: later.audio },
        requestsDelta: later.req - before.req,
        serverNewPosts: fresh.map((l) => ({ chars: l.chars, seg: segOf(l) })),
        player: playerState(),
      };
      verdict.playUp = !!(reached && later.playing && later.idx === X && !later.sErr && !later.mgrError && later.mgrPaused === false && fresh.length === 1 && segOf(fresh[0]) === X);
      postCount = posts(log1).length;
      try { M().pause(); } catch (e) { /* the sentence may have ended */ }
      await sleep(300);
    }

    if (!P.skipRetry) {
    // --- 4. Retry still asks again: a second failed segment, Y
    setBase(P.downURL);
    const tF2 = Date.now();
    M().repositionTo(Y);
    const f2 = await watch(1500, tF2);
    const f2Fast = playerState();
    await sleep(600);
    const failed2 = f2.changes.find((c) => c.sErr);
    out.steps.failure2 = { errorAtMs: failed2 ? failed2.dt : null, changes: f2.changes, final: slim(f2.last), playerAtOnce: f2Fast, playerSettled: playerState() };
    verdict.failure2 = !!(failed2 && f2.last.mgrError === 'network' && f2.last.mgrPaused === true && f2.last.activeSeg === Y);
    postCount = posts(await readLog()).length;
    {
      const before = await sample();
      const t0 = Date.now();
      M().retry();
      const sync = { mgrError: M().error || null, mgrPaused: M().paused };
      const w = await watch(900, t0);
      const logN = posts(await readLog()).length;
      const back = w.changes.find((c) => c.sErr);
      out.steps.retryDown = {
        before: slim(before), sync, errorBackMs: back ? back.dt : null, changes: w.changes, after: slim(w.last),
        requestsDelta: w.last.req - before.req, serverNewPosts: logN - postCount,
      };
      verdict.retryDown = !!(before.sErr === 'network' && sync.mgrError === null && out.steps.retryDown.requestsDelta === 1 && back && w.last.mgrError === 'network' && w.last.mgrPaused === true && out.steps.retryDown.serverNewPosts === 0);
      postCount = logN;
    }
    // --- 5. the server answering again; Retry plays it
    setBase(P.workingURL);
    await sleep(150);
    {
      const before = await sample();
      const t0 = Date.now();
      M().retry();
      const sync = { mgrError: M().error || null, mgrPaused: M().paused };
      const w = await watch(15000, t0, (x) => x.playing && x.idx === Y && !x.sErr);
      await sleep(300);
      const later = await sample();
      const log2 = await readLog();
      const fresh = posts(log2).slice(postCount);
      const reached = w.changes.find((c) => c.playing && c.idx === Y && !c.sErr);
      out.steps.retryUp = {
        before: slim(before), sync, playingAfterMs: reached ? reached.dt : null, changes: w.changes,
        later: { sErr: later.sErr, mgrError: later.mgrError, mgrPaused: later.mgrPaused, playing: later.playing, idx: later.idx, req: later.req },
        requestsDelta: later.req - before.req,
        serverNewPosts: fresh.map((l) => ({ chars: l.chars, seg: segOf(l) })),
      };
      verdict.retryUp = !!(reached && later.playing && later.idx === Y && !later.sErr && !later.mgrError && later.mgrPaused === false && fresh.length >= 1 && segOf(fresh[0]) === Y);
      postCount = posts(log2).length;
    }
    }
    try { M().pause(); } catch (e) { /* ended */ }
    await sleep(300);
  } catch (e) {
    out.error = String(e && e.message || e);
  } finally {
    // The address goes back to the working server whatever happened; the cleanup restores the owner's own
    try { setBase(P.workingURL); } catch (e) { out.baseRestoreErr = String(e); }
  }
  out.verdict = verdict;
  out.end = slim(await sample());
  out.endPrefBaseURL = Zotero.Prefs.get('zotero-tts.local.baseURL');
  S.item13 = out;
  return JSON.stringify(out, null, 1);
})();
