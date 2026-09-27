(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 50) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const diag = id => { try { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); for (const row of d.readers || []) if (row?.itemID === id) return row; } catch (_) {} return null; };
  const stats = async () => { try { return await (await fetch(String(params.deterministicBaseURL) + '/stats')).json(); } catch (error) { return { error: String(error) }; } };
  const fixture = state.fixtures?.epub;
  const reader = fixture ? readerOf(fixture.id) : null;
  if (!reader) throw new Error('EPUB reader missing for clock checks');
  const host = Zotero.getMainWindow();
  const focusHost = () => {
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  focusHost();
  let manager = Components.utils.waiveXrays(reader._internalReader?._readAloudManager);
  if (!manager?.active) throw new Error('EPUB manager is not active');
  if (!manager.paused) manager.pause();
  const segments = reader._internalReader?._readAloudSegments?.segments || manager._segments || [];
  if (!segments.length) throw new Error('EPUB segments unavailable for clocks');
  const trustedToggle = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window;
    const K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    focusHost();
    tip.beginInputTransactionForTests(win);
    const result = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return result;
  };
  const out = { step: 'clocks-requests-performance', initial: null, freeze: null, playbackProbe: null, speed: null, gap: null, skip: null, completion: null, requests: null, performance: null, voiceRecalibration: null };

  // A reposition can legitimately return to estimating until a clip at that
  // position has been measured. Prepare each numeric comparison with one
  // bounded local clip so a pause or speed assertion is numerical evidence.
  const prepareMeasured = async index => {
    try { manager.repositionTo(index); } catch (_) {}
    await sleep(250);
    if (!manager.paused) manager.pause();
    let row = diag(fixture.id);
    if (row?.session?.remainingTime?.status !== 'ready') {
      trustedToggle();
      await waitFor(() => {
        const next = diag(fixture.id);
        return next?.session?.remainingTime?.status === 'ready' ? next : null;
      }, 12000, 75);
      if (manager.active && !manager.paused) manager.pause();
      await waitFor(() => manager.paused === true, 3000, 50);
      row = diag(fixture.id);
    }
    return row;
  };

  const beforeStats = await stats();
  let initial = diag(fixture.id);
  // Opening the popup creates the session but does not synthesize a clip for
  // a paused manager. Start one bounded local clip before asserting a finite
  // diagnostic; text and the opening popup alone must remain estimating.
  if (initial?.session?.remainingTime?.status !== 'ready') {
    trustedToggle();
    await waitFor(() => {
      const row = diag(fixture.id);
      return row?.session?.remainingTime?.status === 'ready' ? row : null;
    }, 12000, 75);
    if (manager.active && !manager.paused) manager.pause();
    await waitFor(() => manager.paused === true, 3000, 50);
    initial = diag(fixture.id);
  }
  out.initial = { remaining: initial?.session?.remainingTime || null, position: initial?.session?.position ?? null, requests: initial?.session?.store?.requests ?? null, stats: beforeStats };
  if (initial?.session?.remainingTime?.status !== 'ready' || !(initial.session.remainingTime.seconds > 0)) throw new Error('initial finite estimate missing: ' + JSON.stringify(out.initial));

  // A paused estimate is a numerical snapshot: wall time without a new audio
  // measurement must not consume it.
  await prepareMeasured(0);
  const freezeBefore = diag(fixture.id)?.session?.remainingTime || null;
  await sleep(900);
  const freezeAfter = diag(fixture.id)?.session?.remainingTime || null;
  out.freeze = { before: freezeBefore, after: freezeAfter, delta: freezeBefore && freezeAfter ? freezeBefore.seconds - freezeAfter.seconds : null };
  if (!freezeBefore || !freezeAfter || Math.abs(Number(out.freeze.delta)) > 0.001) throw new Error('paused estimate consumed time: ' + JSON.stringify(out.freeze));

  // Probe the real audio clock before relying on playback-driven values.
  let playbackStart = null, playbackEnd = null;
  try {
    trustedToggle();
    await waitFor(() => { const row = diag(fixture.id); return row?.session?.playing ? row : null; }, 3000);
    playbackStart = diag(fixture.id);
    await sleep(700);
    playbackEnd = diag(fixture.id);
  } finally { if (manager.active && !manager.paused) manager.pause(); }
  out.playbackProbe = {
    audioState: playbackStart?.audio?.state || null,
    start: playbackStart?.session ? { playbackTime: playbackStart.session.playbackTime, position: playbackStart.session.position, playing: playbackStart.session.playing } : null,
    end: playbackEnd?.session ? { playbackTime: playbackEnd.session.playbackTime, position: playbackEnd.session.position, playing: playbackEnd.session.playing } : null,
    moving: Number(playbackEnd?.session?.playbackTime) > Number(playbackStart?.session?.playbackTime),
  };

  // Same position, two speeds. The pause settings are intentionally retained
  // here; both speech and future gaps must scale with speed.
  await prepareMeasured(Math.min(90, segments.length - 1));
  manager.setSpeed(1, true); await sleep(150); const one = diag(fixture.id)?.session?.remainingTime || null;
  manager.setSpeed(2, true); await sleep(150); const two = diag(fixture.id)?.session?.remainingTime || null;
  const speedRatio = one && two && two.seconds ? one.seconds / two.seconds : null;
  out.speed = { one, two, ratio: speedRatio, approxHalf: speedRatio !== null && speedRatio > 1.7 && speedRatio < 2.3 };
  manager.setSpeed(1, true);
  if (!out.speed.approxHalf) throw new Error('2x estimate did not scale by half: ' + JSON.stringify(out.speed));

  // A manual pause during a known gap must remove the unconsumed gap.
  const baselineSentenceEnabled = prefs.getBoolPref(prefix + 'readAloud.sentenceDelayEnabled');
  const baselineSentenceMs = prefs.getIntPref(prefix + 'readAloud.sentenceDelayMs');
  prefs.setBoolPref(prefix + 'readAloud.sentenceDelayEnabled', true);
  prefs.setIntPref(prefix + 'readAloud.sentenceDelayMs', 1000);
  let gapBefore = null, gapAfter = null;
  try {
    manager.repositionTo(0); await sleep(250); if (!manager.paused) manager.pause(); trustedToggle();
    const inGap = await waitFor(() => {
      const row = diag(fixture.id);
      return row?.session?.inGap && row?.session?.remainingTime?.status === 'ready' ? row : null;
    }, 7000, 75);
    if (inGap) {
      gapBefore = inGap.session.remainingTime;
      manager.pause(); await sleep(150);
      gapAfter = diag(fixture.id)?.session?.remainingTime || null;
    }
  } finally {
    if (manager.active && !manager.paused) manager.pause();
    prefs.setBoolPref(prefix + 'readAloud.sentenceDelayEnabled', baselineSentenceEnabled);
    prefs.setIntPref(prefix + 'readAloud.sentenceDelayMs', baselineSentenceMs);
  }
  out.gap = { testable: !!gapBefore && !!gapAfter && gapBefore.status === 'ready' && gapAfter.status === 'ready', before: gapBefore, after: gapAfter, delta: gapBefore && gapAfter ? gapBefore.seconds - gapAfter.seconds : null, boundedOnPause: gapBefore && gapAfter ? gapAfter.seconds <= gapBefore.seconds + 0.001 : null };
  if (out.gap.testable && !out.gap.boundedOnPause) throw new Error('manual pause increased the configured-gap estimate: ' + JSON.stringify(out.gap));

  // Repeated diagnostics and display snapshots must not issue synthesis.
  const requestBefore = await stats();
  for (let i = 0; i < 40; i++) {
    diag(fixture.id);
    const frame = reader._iframeWindow?.document?.getElementById('ztts-player-frame');
    const remaining = frame?.contentDocument?.querySelector('.remaining-time');
    void remaining?.title;
  }
  const requestAfter = await stats();
  out.requests = { before: requestBefore, after: requestAfter, noNewCaptionedAudio: requestBefore.captioned === requestAfter.captioned && requestBefore.speech === requestAfter.speech };
  if (!out.requests.noNewCaptionedAudio) throw new Error('display/diagnostic snapshots issued audio requests: ' + JSON.stringify(out.requests));

  // A forward skip must recompute from the new position without a display fetch.
  await prepareMeasured(0);
  const skipBefore = diag(fixture.id);
  try { manager.skipAhead('sentence'); } catch (error) { out.skip = { error: String(error) }; }
  await sleep(850);
  let skipAfter = diag(fixture.id);
  if (!out.skip?.error && skipAfter?.session?.remainingTime?.status !== 'ready') {
    trustedToggle();
    await waitFor(() => {
      const next = diag(fixture.id);
      return next?.session?.remainingTime?.status === 'ready' ? next : null;
    }, 12000, 75);
    if (manager.active && !manager.paused) manager.pause();
    await waitFor(() => manager.paused === true, 3000, 50);
    skipAfter = diag(fixture.id);
  }
  out.skip ||= { before: { position: skipBefore?.session?.position, seconds: skipBefore?.session?.remainingTime?.seconds }, after: { position: skipAfter?.session?.position, seconds: skipAfter?.session?.remainingTime?.seconds } };
  if (!out.skip.error && !(Number(out.skip.after.position) > Number(out.skip.before.position) && Number(out.skip.after.seconds) < Number(out.skip.before.seconds))) throw new Error('skip did not recompute remaining time: ' + JSON.stringify(out.skip));

  // The deterministic server offers two local voices. A paused switch to
  // Heart must drop Bella's calibration before a new clip is measured.
  const offeredVoices = [];
  let heartVoice = null;
  for (const voice of manager.allVoices || []) {
    const id = String(voice?.id || '');
    offeredVoices.push({ id, tier: String(voice?.tier || '') });
    if (id === 'local::af_heart') heartVoice = voice;
  }
  if (!heartVoice) throw new Error('deterministic Heart voice was not offered: ' + JSON.stringify(offeredVoices));
  const fromVoice = String(manager.selectedVoiceID || '');
  const beforeVoice = diag(fixture.id);
  const heartMemory = JSON.stringify({ speed: 1, voice: { id: 'local::af_heart', lang: 'en' } });
  prefs.setStringPref(prefix + 'readAloud.memory', heartMemory);
  if (typeof manager.selectTier === 'function') await manager.selectTier(String(heartVoice.tier || 'kokoro'));
  if (typeof manager.selectVoice === 'function') await manager.selectVoice('local::af_heart');
  await sleep(100);
  manager = Components.utils.waiveXrays(reader._internalReader?._readAloudManager);
  const afterSelectVoice = diag(fixture.id);
  const selectedHeartBeforeResume = String(manager.selectedVoiceID || '') === 'local::af_heart';
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL) + '/delay');
  if (manager.active && !manager.paused) manager.pause();
  trustedToggle();
  const afterResume = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.voice === 'local::af_heart' && (row.session?.buffering || row.session?.store?.inflight > 0) ? row : null;
  }, 3000, 50);
  const resetStatus = afterResume?.session?.remainingTime?.status === 'estimating'
    && afterResume.session.remainingTime.seconds === null
    && afterResume.session.remainingCalibration?.ready !== true;
  if (!afterResume || !resetStatus) throw new Error('new local voice did not reset calibration after resume: ' + JSON.stringify({ offeredVoices, fromVoice, selectedHeartBeforeResume, beforeVoice: beforeVoice?.session?.remainingTime, afterSelectVoice: afterSelectVoice?.session?.remainingTime, afterResume: afterResume?.session?.remainingTime, calibration: afterResume?.session?.remainingCalibration }));
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  let heartReady = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.voice === 'local::af_heart' && row.session.remainingTime?.status === 'ready' ? row : null;
  }, 12000, 75);
  if (!heartReady) {
    // The delayed reset response contributes one Heart sample. Resume once
    // more on the normal endpoint to collect the remaining representative
    // audio before asserting fresh readiness.
    if (manager.active && manager.paused) trustedToggle();
    const retried = await waitFor(() => {
      const row = diag(fixture.id);
      return row?.session?.voice === 'local::af_heart' && row.session.remainingTime?.status === 'ready' ? row : null;
    }, 12000, 75);
    if (retried) heartReady = retried;
  }
  if (manager.active && !manager.paused) manager.pause();
  out.voiceRecalibration = {
    offeredVoices,
    fromVoice,
    before: beforeVoice?.session?.remainingTime || null,
    afterSelect: afterSelectVoice?.session?.remainingTime || null,
    afterSelectCalibration: afterSelectVoice?.session?.remainingCalibration || null,
    afterResume: afterResume?.session?.remainingTime || null,
    afterResumeCalibration: afterResume?.session?.remainingCalibration || null,
    selectedHeartBeforeResume,
    resetStatus,
    afterReady: heartReady?.session?.remainingTime || null,
    afterReadyCalibration: heartReady?.session?.remainingCalibration || null,
    requests: heartReady?.session?.store?.requests ?? null,
  };
  if (!heartReady || heartReady.session.remainingTime.status !== 'ready' || heartReady.session.voice !== 'local::af_heart') throw new Error('new local voice did not reach a fresh ready estimate: ' + JSON.stringify(out.voiceRecalibration));

  // Finish from the final segment (one deterministic three-second clip), then
  // prove Play starts a fresh estimate after the completion flag.
  const last = segments.length - 1;
  try { manager.repositionTo(last); } catch (_) {}
  await sleep(250); if (!manager.paused) manager.pause();
  trustedToggle();
  const finished = await waitFor(() => { const row = diag(fixture.id); return row?.session?.remainingTime?.status === 'finished' ? row : null; }, 7000, 75);
  if (manager.active && !manager.paused) manager.pause();
  out.completion = { finished: finished?.session?.remainingTime || null, positionAfter: finished?.session?.position ?? null };
  if (!finished || finished.session.remainingTime.seconds !== 0) throw new Error('completion did not report finished/zero: ' + JSON.stringify(out.completion));
  try { trustedToggle(); } catch (_) {}
  const fresh = await waitFor(() => { const row = diag(fixture.id); return row?.session?.remainingTime?.status === 'ready' ? row : null; }, 5000, 75);
  if (manager.active && !manager.paused) manager.pause();
  out.completion.freshAfterPlay = fresh?.session?.remainingTime || null;
  if (!fresh || fresh.session.remainingTime.status !== 'ready') throw new Error('Play did not start a fresh estimate after completion');

  const beforePerf = await stats();
  const t0 = Date.now();
  for (let i = 0; i < 500; i++) diag(fixture.id);
  const elapsed = Date.now() - t0;
  const afterPerf = await stats();
  out.performance = { snapshots: 500, elapsedMs: elapsed, stats: afterPerf, noRequests: afterPerf.captioned === beforePerf.captioned && afterPerf.speech === beforePerf.speech };
  if (elapsed > 2500 || !out.performance.noRequests) throw new Error('long-document snapshots regressed performance or requested audio: ' + JSON.stringify(out.performance));
  if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
  state.clockResults = out;
  return JSON.stringify(out, null, 1);
})()
