(async () => {
  // Issue #163 item 1: identity and bindings, plus the audio device probe
  // (playback must advance for every later row to mean anything).
  const session = Zotero.__ztts163;
  const itemID = session?.fixtureItemID;
  if (!session || !itemID) throw new Error('163 session state is missing (run 163-01 first)');
  const S = Zotero.ZoteroTTS.diagnostics;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readerOf = () => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const out = { status: 'FAIL', errors: [], checks: {} };
  try {
    // Identity: mechanism, bindings, per-reader controlsAttached (case item 1).
    const vsRaw = JSON.parse(await S.voiceSwitch());
    out.checks.mechanism = vsRaw.mechanism ?? null;
    out.checks.bindings = vsRaw.bindings ?? null;
    out.checks.readers = (vsRaw.readers || []).map(row => ({ index: row.index, selected: row.selected, controlsAttached: row.handoff?.controlsAttached ?? null }));
    const startup = JSON.parse(S.startup());
    out.checks.startup = {
      version: startup.version,
      engineStep: (startup.steps || []).some(step => step.name === 'the Engine' && step.ok === true),
      voiceSwitchingStep: (startup.steps || []).some(step => step.name === 'voice switching' && step.ok === true),
      failed: startup.failed ?? null,
    };

    // Audio device probe on the fixture reader: play, sample twice, pause.
    const reader = readerOf();
    if (!reader) throw new Error('fixture reader is gone');
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    const engTab = async () => {
      const all = JSON.parse(await S.engine());
      return all.readers.find(row => Number(row.itemID) === Number(itemID)) || null;
    };
    if (!manager.active) {
      try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
      internal.toggleReadAloudPopup(true);
      await waitFor(() => { try { return !!manager.active; } catch (_) { return false; } }, 12000, 120);
    }
    const state = () => ({ paused: !!manager.paused, voice: manager.selectedVoiceID ?? null });
    if (!manager.paused) { try { manager.pause(); } catch (_) {} await sleep(300); }
    // Pin sentence 1 (persisted position resumes wherever the last run left it).
    let lastKick = 0;
    const atOne = await waitFor(async () => {
      let tab = null;
      try { tab = await engTab(); } catch (_) { return false; }
      const ss = tab?.session;
      if (!ss || ss.ended) return false;
      if (ss.position !== 1 || ss.paused) {
        if (Date.now() - lastKick > 1200) {
          lastKick = Date.now();
          try { manager.pause(); } catch (_) {}
          await sleep(150);
          try { manager.repositionTo(1); } catch (_) {}
          await sleep(150);
          try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
          try { manager.play(); } catch (_) {}
        }
        return false;
      }
      return true;
    }, 30000, 300);
    out.checks.pinnedAtOne = !!atOne;
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { out.errors.push('probe play: ' + String(e)); }
    const running = await waitFor(async () => (await engTab())?.session?.playing === true, 8000, 100);
    let first = await engTab();
    await waitFor(async () => {
      first = await engTab();
      return first?.audio?.state === 'running' || first?.session?.playbackTime > 0;
    }, 6000, 150);
    await sleep(600);
    const second = await engTab();
    out.checks.probe = {
      playing: second?.session?.playing ?? null,
      audioState: second?.audio?.state ?? null,
      playbackTimeA: first?.session?.playbackTime ?? null,
      playbackTimeB: second?.session?.playbackTime ?? null,
      advanced: (Number(second?.session?.playbackTime) || 0) > (Number(first?.session?.playbackTime) || 0),
      voice: second?.session?.voice ?? null,
    };
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('probe pause: ' + String(e)); }
    const mechOK = out.checks.mechanism === 'engine-handoff-v2'
      && out.checks.bindings?.previous === 'Shift+,'
      && out.checks.bindings?.next === 'Shift+.'
      && out.checks.readers.every(row => row.controlsAttached === true)
      && out.checks.startup.engineStep && out.checks.startup.voiceSwitchingStep && (out.checks.startup.failed || []).length === 0;
    out.status = mechOK && out.checks.probe.audioState === 'running' && out.checks.probe.advanced ? 'PASS' : 'FAIL';
    session.voiceX = out.checks.probe.voice || session.voiceX;
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out, null, 1);
})();
