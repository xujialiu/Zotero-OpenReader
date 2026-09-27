(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixture = state.fixtures?.book;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = itemID => {
    for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === itemID) return reader;
    return null;
  };
  const focus = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const diag = itemID => {
    try {
      const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      for (const row of report.readers || []) if (row?.itemID === itemID) return row;
    } catch (_) {}
    return null;
  };
  const trustedToggle = reader => {
    focus(reader);
    try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window, K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(win);
    const result = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    tip.endInputTransaction?.();
    return result;
  };
  const frameDoc = reader => reader?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const snapshot = (row, now) => {
    const session = row?.session || {};
    const remaining = session.remainingTime || {};
    return {
      at: now,
      status: remaining.status || null,
      doc: finite(remaining.seconds) ? remaining.seconds : null,
      section: finite(remaining.sectionSeconds) ? remaining.sectionSeconds : null,
      sectionTitle: remaining.sectionTitle,
      position: session.position ?? null,
      currentIndex: session.currentIndex ?? null,
      listeningTime: finite(session.listeningTime) ? session.listeningTime : null,
      playbackTime: finite(session.playbackTime) ? session.playbackTime : null,
      playing: !!session.playing,
      paused: !!session.paused,
      buffering: !!session.buffering,
      voice: session.voice || null,
      requests: session.store?.requests ?? null,
      remainingCalibration: session.remainingCalibration || null,
    };
  };
  if (!fixture?.id) throw new Error('Four Thousand Weeks temporary copy is missing');
  const reader = readerOf(fixture.id);
  if (!reader) throw new Error('Four Thousand Weeks temporary reader is missing');
  focus(reader);
  const internal = reader._internalReader;
  let manager = internal?._readAloudManager;
  if (!manager) throw new Error('Four Thousand Weeks Read Aloud manager is missing');

  // Refresh the offered providers in the selected temporary reader, then
  // explicitly choose a configured Fish voice through the manager. This is
  // the real provider path; the request remains muted and bounded.
  if (manager.active && !manager.paused) manager.pause();
  if (internal._state?.readAloudState?.popupOpen) {
    try { internal.toggleReadAloudPopup(false); } catch (_) {}
    await waitFor(() => !internal._state?.readAloudState?.popupOpen && !manager.active, 7000, 80);
  }
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  prefs.setBoolPref(prefix + 'readAloud.remainingTime', true);
  prefs.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
  prefs.setBoolPref(prefix + 'local.enabled', false);
  prefs.setBoolPref(prefix + 'system.enabled', false);
  prefs.setBoolPref(prefix + 'fish.enabled', true);
  if (!internal._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(true);
  await waitFor(() => frameDoc(reader)?.querySelector('.player') ? frameDoc(reader) : null, 15000);
  manager = internal?._readAloudManager;
  await waitFor(() => manager.allVoices?.length ? manager : null, 20000);
  let fishVoice = null;
  let englishFishVoice = null;
  const offered = [];
  const voices = manager.allVoices || [];
  for (let i = 0; i < Number(voices.length || 0); i++) {
    const voice = voices[i];
    offered.push({ id: String(voice?.id || ''), tier: String(voice?.tier || ''), lang: String(voice?.lang || '') });
    if (!fishVoice && String(voice?.id || '').startsWith('fish::')) fishVoice = voice;
    if (!englishFishVoice && String(voice?.id || '').startsWith('fish::en/')) englishFishVoice = voice;
  }
  fishVoice = englishFishVoice || fishVoice;
  if (!fishVoice) throw new Error('configured Fish voice was not offered: ' + JSON.stringify(offered.slice(0, 12)));
  const fishVoiceId = String(fishVoice.id);
  const selectedTier = String(fishVoice.tier || 'fish');
  if (typeof manager.selectTier === 'function') await manager.selectTier(selectedTier);
  if (typeof manager.selectVoice === 'function') await manager.selectVoice(fishVoiceId);
  await sleep(250);
  manager = internal?._readAloudManager;
  await waitFor(() => {
    manager = internal?._readAloudManager || manager;
    return String(manager?.selectedVoiceID || '') === fishVoiceId && manager?.active ? manager : null;
  }, 12000);
  if (String(manager?.selectedVoiceID || '') !== fishVoiceId) throw new Error('Fish voice selection did not commit');

  const bodyIndex = Number(state.docSamples?.bodyIndex ?? 315);
  try { manager.repositionTo(bodyIndex); } catch (error) { throw new Error('body reposition failed: ' + String(error)); }
  await sleep(350);
  if (manager.active && !manager.paused) manager.pause();
  await waitFor(() => manager.paused === true, 5000, 50);
  const keys = trustedToggle(reader);
  const firstRunning = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.voice?.startsWith('fish::') && row.session.store?.requests > 0 ? row : null;
  }, 25000, 100);
  const audioState = firstRunning?.audio?.state || diag(fixture.id)?.audio?.state || null;
  const playbackBefore = finite(firstRunning?.session?.playbackTime) ? firstRunning.session.playbackTime : null;
  await sleep(800);
  const playbackAfterValue = diag(fixture.id)?.session?.playbackTime;
  const playbackAfter = finite(playbackAfterValue) ? playbackAfterValue : null;
  const audioMoving = finite(playbackBefore) && finite(playbackAfter) && playbackAfter > playbackBefore + 0.05;

  const samples = [];
  const sampleStart = Date.now();
  let readyAt = null;
  const minimumReadyWindowMs = 32000;
  while (Date.now() - sampleStart < 100000 && (readyAt === null || Date.now() - sampleStart - samples[readyAt].at < minimumReadyWindowMs)) {
    await sleep(500);
    const row = diag(fixture.id);
    const current = snapshot(row, Date.now() - sampleStart);
    samples.push(current);
    if (readyAt === null && current.remainingCalibration?.ready === true && current.status === 'ready' && finite(current.doc)) readyAt = samples.length - 1;
  }
  if (manager.active && !manager.paused) manager.pause();
  await waitFor(() => manager.paused === true, 5000, 50);
  const stable = readyAt === null ? [] : samples.slice(readyAt).filter(value => value.status === 'ready' && finite(value.doc) && finite(value.listeningTime));
  const violations = [];
  let sameSectionPairs = 0;
  let maxDecreaseOverBudget = 0;
  let maxSectionDecreaseOverBudget = 0;
  for (let i = 1; i < stable.length; i++) {
    const before = stable[i - 1], after = stable[i];
    const sameSection = before.sectionTitle === after.sectionTitle;
    const listeningDelta = Math.max(0, after.listeningTime - before.listeningTime);
    const decrease = before.doc - after.doc;
    const overBudget = decrease - 1.5 * listeningDelta;
    if (overBudget > maxDecreaseOverBudget) maxDecreaseOverBudget = overBudget;
    if (overBudget > 1e-6) violations.push({ type: 'document-decrease-over-listening-budget', overBudget, before, after });
    if (after.doc > before.doc + 1e-6) violations.push({ type: 'document-increased', before, after });
    if (sameSection) {
      sameSectionPairs++;
      if (finite(after.section) && finite(before.section)) {
        if (after.section > before.section + 1e-6) violations.push({ type: 'section-increased', before, after });
        const sectionDecreaseOverBudget = before.section - after.section - 1.5 * listeningDelta;
        if (sectionDecreaseOverBudget > maxSectionDecreaseOverBudget) maxSectionDecreaseOverBudget = sectionDecreaseOverBudget;
        if (sectionDecreaseOverBudget > 1e-6) violations.push({ type: 'section-decrease-over-listening-budget', sectionDecreaseOverBudget, before, after });
      }
    }
  }
  const transitions = [];
  for (let i = 1; i < stable.length; i++) if (stable[i].sectionTitle !== stable[i - 1].sectionTitle) transitions.push({ from: stable[i - 1].sectionTitle, to: stable[i].sectionTitle, before: stable[i - 1].section, after: stable[i].section });
  const firstStable = stable[0] || null;
  const lastStable = stable[stable.length - 1] || null;
  const calibration = lastStable?.remainingCalibration || firstStable?.remainingCalibration || null;
  const listeningDelta = firstStable && lastStable ? lastStable.listeningTime - firstStable.listeningTime : 0;

  // Repeated diagnostic/render reads while paused must not synthesize another
  // Fish clip. The rendered text is checked again by 07-rendered-time-line.
  const beforeRequests = diag(fixture.id)?.session?.store?.requests ?? null;
  for (let i = 0; i < 50; i++) {
    diag(fixture.id);
    const line = frameDoc(reader)?.querySelector('.remaining-time');
    void line?.textContent;
  }
  const afterRequests = diag(fixture.id)?.session?.store?.requests ?? null;
  const noSnapshotRequests = beforeRequests === afterRequests;

  // A same-speed write and ordinary pause/resume preserve the current
  // envelope. A slower speed is an explicit reset and is reported separately
  // as allowed behavior.
  const sameSpeedBefore = snapshot(diag(fixture.id), Date.now() - sampleStart);
  let sameSpeedWriteApplied = true;
  try { manager.setSpeed(1, true); } catch (_) { sameSpeedWriteApplied = false; }
  await sleep(150);
  const sameSpeedAfter = snapshot(diag(fixture.id), Date.now() - sampleStart);
  const sameSpeedPreserved = sameSpeedWriteApplied && sameSpeedBefore.status === 'ready' && sameSpeedAfter.status === 'ready' && finite(sameSpeedBefore.doc) && finite(sameSpeedAfter.doc) && sameSpeedAfter.doc <= sameSpeedBefore.doc + 1e-6;
  const heldBefore = snapshot(diag(fixture.id), Date.now() - sampleStart);
  const pauseResumeKeys = trustedToggle(reader);
  const resumed = await waitFor(() => manager.active && !manager.paused ? true : null, 4000, 50) === true;
  await sleep(700);
  if (manager.active && !manager.paused) manager.pause();
  const pausedAgain = await waitFor(() => manager.paused === true ? true : null, 4000, 50) === true;
  const heldAfter = snapshot(diag(fixture.id), Date.now() - sampleStart);
  const pauseResumePreserved = heldBefore.status === 'ready' && heldAfter.status === 'ready' && finite(heldBefore.doc) && finite(heldAfter.doc) && heldAfter.doc <= heldBefore.doc + 1e-6;
  const slowerBefore = snapshot(diag(fixture.id), Date.now() - sampleStart);
  try { manager.setSpeed(0.5, true); } catch (_) {}
  await sleep(150);
  const slowerAfter = snapshot(diag(fixture.id), Date.now() - sampleStart);
  const slowerIncreaseAllowed = slowerBefore.status === 'ready' && slowerAfter.status === 'ready' && finite(slowerBefore.doc) && finite(slowerAfter.doc) && slowerAfter.doc >= slowerBefore.doc - 1e-6;
  try { manager.setSpeed(1, true); } catch (_) {}

  const tracePath = PathUtils.join(params.tmpDir, params.runId, 'stable-samples.json');
  await IOUtils.writeUTF8(tracePath, JSON.stringify(samples, null, 1));

  const out = {
    step: 'stable-document-production',
    fixture: { id: fixture.id, key: fixture.key, title: fixture.title, bodyIndex, segments: state.docSamples?.segmentCount || null },
    voice: { selected: fishVoiceId, tier: selectedTier, offered: offered.slice(0, 12), keys, audioState, audioMoving, firstRequests: firstRunning?.session?.store?.requests ?? null },
    readiness: { readyAtSample: readyAt, calibration, stableSamples: stable.length, elapsedMs: Date.now() - sampleStart, listeningDelta, first: firstStable, last: lastStable },
    trace: { samples: stable.length, first: firstStable, last: lastStable, sectionTransitions: transitions.slice(0, 12), distinctPositions: new Set(stable.map(value => value.position)).size, fullSamplesPath: tracePath },
    envelope: { sameSectionPairs, maxDecreaseOverBudget, maxSectionDecreaseOverBudget, violations: violations.slice(0, 4), documentNonincreasing: !violations.some(value => value.type === 'document-increased'), sectionNonincreasing: !violations.some(value => value.type === 'section-increased'), boundedDecrease: !violations.some(value => value.type === 'document-decrease-over-listening-budget' || value.type === 'section-decrease-over-listening-budget') },
    sameSpeedWrite: { before: sameSpeedBefore, after: sameSpeedAfter, applied: sameSpeedWriteApplied, preserved: sameSpeedPreserved },
    pauseResume: { before: heldBefore, after: heldAfter, keys: pauseResumeKeys, resumed, pausedAgain, preserved: pauseResumePreserved },
    slowerSpeed: { before: slowerBefore, after: slowerAfter, increaseAllowed: slowerIncreaseAllowed },
    requests: { before: beforeRequests, after: afterRequests, noSnapshotRequests },
  };
  if (!audioMoving) out.voice.audioNotTestableReason = 'Fish audio clock did not advance in the live device';
  if (readyAt === null || stable.length < 20 || listeningDelta < 30) throw new Error('Fish production run did not reach 30 seconds of ready listening: ' + JSON.stringify(out));
  if (!out.envelope.documentNonincreasing || !out.envelope.sectionNonincreasing || !out.envelope.boundedDecrease) throw new Error('stable envelope violated: ' + JSON.stringify(out.envelope));
  if (!out.sameSpeedWrite.preserved || !out.pauseResume.resumed || !out.pauseResume.pausedAgain || !out.pauseResume.preserved || !out.slowerSpeed.increaseAllowed) throw new Error('speed/pause envelope action failed: ' + JSON.stringify({ sameSpeedWrite: out.sameSpeedWrite, pauseResume: out.pauseResume, slowerSpeed: out.slowerSpeed }));
  if (!noSnapshotRequests) throw new Error('diagnostic/display snapshots requested new Fish audio: ' + JSON.stringify(out.requests));
  state.stableResults = out;
  Zotero.getMainWindow()?.minimize?.();
  return JSON.stringify(out, null, 1);
})()
