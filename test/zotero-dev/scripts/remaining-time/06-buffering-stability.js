(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixture = state.fixtures?.epub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 100) => {
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
  const diag = itemID => {
    try {
      const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      for (const row of report.readers || []) if (row?.itemID === itemID) return row;
    } catch (_) {}
    return null;
  };
  const focus = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const trustedToggle = reader => {
    focus(reader);
    try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window, K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(win);
    const keys = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    tip.endInputTransaction?.();
    return keys;
  };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const rowSnapshot = row => row ? {
    remaining: row.session?.remainingTime || null,
    buffering: !!row.session?.buffering,
    playing: !!row.session?.playing,
    paused: !!row.session?.paused,
    position: row.session?.position ?? null,
    playbackTime: row.session?.playbackTime ?? null,
    listeningTime: row.session?.listeningTime ?? null,
    requests: row.session?.store?.requests ?? null,
    inflight: row.session?.store?.inflight ?? null,
    audio: row.audio?.state || null,
  } : null;
  if (!fixture?.id) throw new Error('deterministic fixture is missing for buffering check');
  const reader = readerOf(fixture.id);
  if (!reader) throw new Error('deterministic reader is missing for buffering check');
  focus(reader);
  let manager = reader._internalReader?._readAloudManager;
  if (!manager) throw new Error('deterministic manager is missing for buffering check');
  if (manager.active && !manager.paused) manager.pause();
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  prefs.setBoolPref(prefix + 'fish.enabled', false);
  prefs.setBoolPref(prefix + 'system.enabled', false);
  prefs.setBoolPref(prefix + 'local.enabled', true);
  prefs.setBoolPref(prefix + 'prefetchEnabled', false);
  prefs.setBoolPref(prefix + 'cacheAudio', false);
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } }));
  prefs.setStringPref(prefix + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } }));
  try {
    const nativeKey = 'extensions.zotero.reader.readAloudVoices';
    const native = JSON.parse(prefs.getStringPref(nativeKey));
    if (native?.en && typeof native.en === 'object') {
      native.en.voice = 'local::af_bella';
      native.en.tierVoices = { ...(native.en.tierVoices || {}), local: 'local::af_bella', kokoro: 'local::af_bella' };
      prefs.setStringPref(nativeKey, JSON.stringify(native));
    }
  } catch (_) {}
  // Refresh the manager's provider list after changing the temporary native
  // lane; a live session can otherwise retain the prior Fish/Heart tier.
  try { reader._internalReader.toggleReadAloudPopup(false); } catch (_) {}
  await waitFor(() => !reader._internalReader?._state?.readAloudState?.popupOpen, 7000, 80);
  reader._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => reader._internalReader?._readAloudManager?.active ? reader._internalReader._readAloudManager : null, 12000, 100);
  manager = reader._internalReader?._readAloudManager || manager;
  await waitFor(() => manager.allVoices?.length ? manager : null, 12000, 100);
  let targetVoice = String(manager.selectedVoiceID || '');
  if (!targetVoice.startsWith('local::')) {
    const voices = manager.allVoices || [];
    let bella = null;
    for (const voice of voices) if (String(voice?.id || '') === 'local::af_bella') { bella = voice; break; }
    if (!bella) throw new Error('no local deterministic voice was offered for numeric buffering check');
    if (typeof manager.selectTier === 'function') await manager.selectTier(String(bella.tier || 'kokoro'));
    if (typeof manager.selectVoice === 'function') await manager.selectVoice('local::af_bella');
    await sleep(250);
    manager = reader._internalReader?._readAloudManager || manager;
    targetVoice = String(manager.selectedVoiceID || '');
  }
  if (!targetVoice.startsWith('local::')) throw new Error('local deterministic voice could not be selected for numeric buffering check');
  const targetMemory = JSON.stringify({ speed: 1, voice: { id: targetVoice, lang: 'en' } });
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', targetMemory);
  prefs.setStringPref(prefix + 'readAloud.memory', targetMemory);
  const segments = reader._internalReader?._readAloudSegments?.segments || manager._segments || [];
  const readyAt = async index => {
    try { manager.repositionTo(index); } catch (_) {}
    await sleep(250);
    if (!manager.paused) manager.pause();
    let row = diag(fixture.id);
    if (row?.session?.remainingTime?.status !== 'ready') {
      trustedToggle(reader);
      row = await waitFor(() => {
        const next = diag(fixture.id);
        return next?.session?.remainingTime?.status === 'ready' ? next : null;
      }, 12000, 75);
      if (manager.active && !manager.paused) manager.pause();
    }
    return row;
  };
  const initialReady = await readyAt(0);
  if (!initialReady || initialReady.session.remainingTime.status !== 'ready' || !finite(initialReady.session.remainingTime.seconds) || !finite(initialReady.session.listeningTime)) throw new Error('numeric baseline was not ready before delayed buffering');
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL) + '/delay');
  const keys = trustedToggle(reader);
  const buffering = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.store?.inflight > 0 && (row.session.buffering || !row.session.playing) ? row : null;
  }, 12000, 75);
  const beforeRow = buffering || diag(fixture.id);
  if (manager.active && !manager.paused) manager.pause();
  await waitFor(() => manager.paused === true, 3000, 50);
  const before = rowSnapshot(diag(fixture.id) || beforeRow);
  await sleep(2200);
  const after = rowSnapshot(diag(fixture.id));
  const beforeSeconds = before?.remaining?.seconds;
  const afterSeconds = after?.remaining?.seconds;
  const finiteHeld = finite(beforeSeconds) && finite(afterSeconds);
  const listeningHeld = finite(before?.listeningTime) && finite(after?.listeningTime) && Math.abs(after.listeningTime - before.listeningTime) <= 1e-6;
  const playbackHeld = finite(before?.playbackTime) && finite(after?.playbackTime) && Math.abs(after.playbackTime - before.playbackTime) <= 1e-6;
  const frozen = finiteHeld && Math.abs(afterSeconds - beforeSeconds) <= 0.001 && listeningHeld && playbackHeld;
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  let resumedRow = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.buffering === false && row.session.store?.inflight === 0 && row.session.remainingTime?.status === 'ready' ? row : null;
  }, 15000, 100);
  if (resumedRow && manager.active && manager.paused) {
    trustedToggle(reader);
    await sleep(800);
    resumedRow = diag(fixture.id);
  }
  if (manager.active && !manager.paused) manager.pause();
  const resumed = rowSnapshot(resumedRow);
  const resumedFinite = finite(resumed?.remaining?.seconds) && finite(resumed?.listeningTime);
  const resumedListeningDelta = resumedFinite && finite(before?.listeningTime) ? Math.max(0, resumed.listeningTime - before.listeningTime) : null;
  const resumedDecrease = resumedFinite ? beforeSeconds - resumed.remaining.seconds : null;
  const resumedWithinBudget = resumedFinite && finite(resumedListeningDelta) && finite(resumedDecrease) && resumedDecrease <= 1.5 * resumedListeningDelta + 1e-6;
  const requestStats = async () => { try { return await (await fetch(String(params.deterministicBaseURL) + '/stats')).json(); } catch (error) { return { error: String(error) }; } };
  const stats = await requestStats();
  const out = { step: 'buffering-stability', fixture: { id: fixture.id, segments: segments.length, delayedPosition: before?.position ?? null }, keys, initialReady: rowSnapshot(initialReady), before, after, resumed, finiteHeld, listeningHeld, playbackHeld, frozen, resumedListeningDelta, resumedDecrease, resumedWithinBudget, delayedServer: stats };
  if (!frozen || !resumedWithinBudget) throw new Error('delayed buffering numeric envelope failed: ' + JSON.stringify(out));
  state.bufferingResults = out;
  Zotero.getMainWindow()?.minimize?.();
  return JSON.stringify(out, null, 1);
})()
