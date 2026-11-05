// Case: system-voice-selection, item 4 (playing part) — with Andrew (Natural
// HD) committed and the fixture paused: focus the OS window (this profile's
// autoplay gate needs it — measured 2026-11-05), start the fixture, prove
// audio actually advances (both probe times captured and rising, audio
// state running), then pick Andrew Online WHILE PLAYING and require the
// takeover to LAND: session AND manager on system::sapi5/Edge-en-US-AndrewNeural,
// handoff cleared, time rising after the cut, word/notices failed count 0 and
// no failure text — paused in a finally even on error. The script never
// infers success from autoplay messages; every claim is a field above.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => Components.utils.waiveXrays(v);
  const HD = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const ONLINE = 'system::sapi5/Edge-en-US-AndrewNeural';
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === S.svsFixtureItemID);
  if (!reader) throw new Error('fixture reader gone');
  const m = () => waive(reader._internalReader._readAloudManager);
  if (!(m().paused && m().selectedVoiceID === HD)) throw new Error('fixture not paused on Andrew HD — refusing to start playback');
  const win = Zotero.getMainWindow();
  const eng = async () => {
    const e = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    return (e.readers || []).find((r) => r.itemID === S.svsFixtureItemID) || null;
  };
  const notices = () => [...reader._iframeWindow.document.querySelectorAll('#ztts-voice-notice, #ztts-playback-notice')].map((n) => n.textContent).filter(Boolean);
  // playbackTime resets at every sentence/clip boundary; progress = clip time
  // within the segment position, so a boundary crossing still rises
  const progressOf = (e) => (e && e.session ? ((e.session.position || 0) * 10000 + (e.session.playbackTime || 0)) : null);

  try {
    // Focus within the bounded observation (measured, not assumed)
    if (win.windowState === 2) { win.restore(); await sleep(600); }
    try { win.focus(); } catch (e) { out.focusError = String(e).slice(0, 80); }
    await sleep(500);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) { out.gestureError = String(e).slice(0, 80); }
    out.osFocusedAtStart = Services.focus.activeWindow === win;

    // Start and require session playing with a running output
    m().play();
    let started = null;
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      const e = await eng();
      if (e && e.session && e.session.playing && e.audio && e.audio.state === 'running') { started = true; break; }
    }
    out.playingStarted = { sessionPlaying: !!started, audioState: (await eng())?.audio?.state ?? null };

    // Probe: BOTH times captured; must advance
    const p1 = await eng();
    const probeT1 = p1 && p1.session ? p1.session.playbackTime : null;
    const probePos1 = p1 && p1.session ? p1.session.position : null;
    const probeState1 = p1 && p1.audio ? p1.audio.state : null;
    await sleep(600);
    const p2 = await eng();
    const probeT2 = p2 && p2.session ? p2.session.playbackTime : null;
    const probePos2 = p2 && p2.session ? p2.session.position : null;
    const probeG1 = progressOf(p1); const probeG2 = progressOf(p2);
    out.audioProbe = {
      t1: probeT1, t2: probeT2, position1: probePos1, position2: probePos2, state1: probeState1, state2: p2 && p2.audio ? p2.audio.state : null,
      advancing: probeG1 !== null && probeG2 !== null && probeG2 > probeG1,
    };
    if (!out.audioProbe.advancing) throw new Error('fail: audio did not advance before the takeover pick — ' + JSON.stringify(out.audioProbe));

    // Pick Online WHILE PLAYING
    out.managerVoiceAtPick = m().selectedVoiceID ?? null;
    out.sessionVoiceAtPick = p2 && p2.session ? p2.session.voice : null;
    await m().selectVoice(ONLINE);

    // Require the cut: session AND manager Online, handoff cleared
    let landed = false;
    let last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await sleep(500);
      const e = await eng();
      last = {
        sessionVoice: e && e.session ? e.session.voice : null,
        managerVoice: m().selectedVoiceID ?? null,
        handoffPending: e && e.session && e.session.handoff ? e.session.handoff.pending : null,
        sessionPlaying: e && e.session ? e.session.playing : null,
        audioState: e && e.audio ? e.audio.state : null,
        managerPaused: !!m().paused,
        osFocused: Services.focus.activeWindow === win,
      };
      if (last.sessionVoice === ONLINE && last.managerVoice === ONLINE && last.handoffPending == null) { landed = true; break; }
    }
    out.landed = landed;
    out.lastPollObservation = last;
    if (landed) {
      const q1 = await eng();
      const riseT1 = q1 && q1.session ? q1.session.playbackTime : null;
      const risePos1 = q1 && q1.session ? q1.session.position : null;
      await sleep(700);
      const q2 = await eng();
      const riseT2 = q2 && q2.session ? q2.session.playbackTime : null;
      const risePos2 = q2 && q2.session ? q2.session.position : null;
      const riseG1 = progressOf(q1); const riseG2 = progressOf(q2);
      out.afterTakeover = {
        t1: riseT1, t2: riseT2, position1: risePos1, position2: risePos2,
        advancing: riseG1 !== null && riseG2 !== null && riseG2 > riseG1,
        sessionVoice: q2 && q2.session ? q2.session.voice : null,
        managerVoice: m().selectedVoiceID ?? null,
        sessionPlaying: q2 && q2.session ? q2.session.playing : null,
        audioState: q2 && q2.audio ? q2.audio.state : null,
        managerPaused: !!m().paused,
        handoff: q2 && q2.session ? q2.session.handoff : null,
        notices: q2 && q2.session ? q2.session.notices : null,
        domNotices: notices(),
        osFocusedAfterCut: Services.focus.activeWindow === win,
      };
      out.takeoverProven = landed
        && out.afterTakeover.advancing === true
        && out.afterTakeover.sessionVoice === ONLINE
        && out.afterTakeover.managerVoice === ONLINE
        && ((out.afterTakeover.notices && out.afterTakeover.notices.failed) === 0)
        && !(out.afterTakeover.domNotices || []).some((t) => /fail/i.test(t));
    }
  } finally {
    try { if (!m().paused) m().pause(); } catch (e) { out.pauseError = String(e).slice(0, 80); }
    let paused = false;
    for (let i = 0; i < 10; i++) { await sleep(250); if (m().paused) { paused = true; break; } }
    out.pausedInFinally = paused;
    const f = await eng();
    out.final = {
      managerPaused: !!m().paused, sessionPlaying: f && f.session ? f.session.playing : null,
      audioState: f && f.audio ? f.audio.state : null, managerVoice: m().selectedVoiceID ?? null,
      sessionVoice: f && f.session ? f.session.voice : null,
    };
  }
  return JSON.stringify(out, null, 1);
})()
