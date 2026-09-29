// Issue #157 run, item 8: trusted Shift+A cycles line -> sentence -> outside
// -> line with a toast naming the new mode ("Auto-scroll: scroll at every
// line" is the new one), the Scrolling section's radio following each switch;
// a held repeat produces one switch; paused audio stays paused at the same
// position with the same clock. Also this run's audio gate: the muted session
// started here is probed (audio.state running, playbackTime moving) before
// anything audio-driven runs. Opens the PDF fixture tab, restores the host
// window for the keys, minimizes it again at the end. Leaves mode `line`.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const volName = 'extensions.zotero.zotero-tts.readAloud.volume';
  const out = { itemID: slot?.itemID ?? null, errors: [] };
  if (!slot?.itemID) return JSON.stringify({ error: 'no imported PDF in state' });

  // Host up, tab selected (page init and trusted keys need it)
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }

  let reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID) ?? null;
  if (!reader) {
    await Zotero.Reader.open(slot.itemID);
  }
  const deadline = Date.now() + 24000;
  while (Date.now() < deadline) {
    reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID) ?? null;
    if (reader?._internalReader && reader._internalReader?._readAloudManager && reader._internalReader?.initialized) break;
    await sleep(700);
  }
  if (!reader?._internalReader) return JSON.stringify({ ...out, error: 'PDF reader not ready within 24s' });
  out.openedFresh = !!reader; // idempotent: an already-open reader is reused
  await sleep(1000);
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) { out.errors.push('select: ' + String(e)); }
  await sleep(400);

  const manager = reader._internalReader._readAloudManager;
  const muteNow = () => { try { p.setIntPref(volName, 0); } catch (e) { out.errors.push('mute: ' + String(e)); } };
  muteNow(); // before any playback (baseline volume 100, no user flag, in state.baseline)

  // Start a muted session with a trusted Shift+Space (autoplay gate); reuse a live one
  if (!manager?.active) {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(hostWin);
    const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    const activeBy = Date.now() + 9000;
    while (Date.now() < activeBy && !manager?.active) await sleep(400);
  }
  out.session = { active: !!manager?.active };

  // Audio gate: resume if paused, engine row twice ~700 ms apart
  const engineRow = () => {
    try {
      const list = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers ?? [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === slot.itemID) return list[i] ?? null;
    } catch (e) { return null; }
    return null;
  };
  try { if (manager?.active && manager.paused) manager.play(); } catch (e) { out.errors.push('gate-resume: ' + String(e)); }
  await sleep(400);
  // Three samples: a resume restarts the sentence clip, so judge by any
  // consecutive increase across the three
  const samples = [];
  for (let i = 0; i < 3; i++) { samples.push(engineRow()?.session?.playbackTime ?? null); await sleep(700); }
  const e1 = { session: { playbackTime: samples[0] } };
  const e2 = { session: { playbackTime: samples[2] } };
  let consecutive = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i] != null && samples[i - 1] != null && samples[i] > samples[i - 1]) consecutive++;
  out.gateSamples = samples;
  out.gateConsecutiveIncreases = consecutive;
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('gate-pause: ' + String(e)); }
  await sleep(300);
  out.audioGate = {
    audioState: engineRow()?.audio?.state ?? null,
    playbackTimeA: e1?.session?.playbackTime ?? null,
    playbackTimeB: e2?.session?.playbackTime ?? null,
    advanced: out.gateConsecutiveIncreases >= 1,
  };
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
  await sleep(400);

  // The pane's radio (settings window left open by 157-01)
  const paneReady = async () => {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) {
      try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); } catch (e) {}
      const end = Date.now() + 8000;
      while (Date.now() < end && !Services.wm.getMostRecentWindow('zotero:pref')) await sleep(150);
      win = Services.wm.getMostRecentWindow('zotero:pref');
    }
    if (!win) return null;
    const end = Date.now() + 5000;
    while (Date.now() < end && !win.document.getElementById('ztts-provider-openai-official')) {
      try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
      await sleep(200);
    }
    return win;
  };
  const win = await paneReady();
  const radioValue = () => win?.document?.getElementById('ztts-auto-scroll-mode')?.value ?? null;
  const toastText = () => reader._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent ?? null;

  const pauseIfPlaying = async () => { try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {} await sleep(200); };
  try {
    p.setStringPref(modeName, 'line');
    await sleep(350);
    await pauseIfPlaying();

    const before = {
      mode: p.getStringPref(modeName), radio: radioValue(),
      paused: !!manager?.paused, position: engineRow()?.session?.position ?? null,
      playbackTime: engineRow()?.session?.playbackTime ?? null,
      following: (() => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); for (const r of rows) if (r?.kind === 'pdf') return r.following ?? null; } catch (e) {} return null; })(),
    };
    out.before = before;

    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(hostWin);
    const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
    const pressShiftA = () => {
      tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
      const r = tip.keydown(ev('keydown', 'A', 'KeyA', 65, { shiftKey: true }));
      tip.keyup(ev('keyup', 'A', 'KeyA', 65, { shiftKey: true }));
      tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
      return r;
    };

    // 1: line -> sentence
    p.setStringPref(modeName, 'line');
    await sleep(300);
    const r1 = pressShiftA();
    await sleep(150);
    out.press1 = { from: 'line', ret: r1, mode: p.getStringPref(modeName), radio: radioValue(), toast: toastText(), expectedMode: 'sentence', expectedToast: 'Auto-scroll: scroll at every sentence' };
    // Held repeat (a real OS auto-repeat carries repeat: true): one switch only
    p.setStringPref(modeName, 'line');
    await sleep(300);
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', 'A', 'KeyA', 65, { shiftKey: true }));
    const rRep = tip.keydown(ev('keydown', 'A', 'KeyA', 65, { shiftKey: true, repeat: true }));
    tip.keyup(ev('keyup', 'A', 'KeyA', 65, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    await sleep(150);
    out.repeat = { from: 'line', ret: rRep, mode: p.getStringPref(modeName), radio: radioValue(), expectedMode: 'sentence' };

    // 2: sentence -> outside
    p.setStringPref(modeName, 'sentence');
    await sleep(300);
    const r2 = pressShiftA();
    await sleep(150);
    out.press2 = { from: 'sentence', ret: r2, mode: p.getStringPref(modeName), radio: radioValue(), toast: toastText(), expectedMode: 'outside', expectedToast: 'Auto-scroll: when outside the view' };

    // 3: outside -> line (the new toast)
    p.setStringPref(modeName, 'outside');
    await sleep(300);
    const r3 = pressShiftA();
    await sleep(150);
    out.press3 = { from: 'outside', ret: r3, mode: p.getStringPref(modeName), radio: radioValue(), toast: toastText(), expectedMode: 'line', expectedToast: 'Auto-scroll: scroll at every line' };
    await sleep(700);
    out.press3.toastAfter700ms = toastText();

    const after = {
      mode: p.getStringPref(modeName), user: p.prefHasUserValue(modeName),
      paused: !!manager?.paused, position: engineRow()?.session?.position ?? null,
      playbackTime: engineRow()?.session?.playbackTime ?? null,
      following: (() => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); for (const r of rows) if (r?.kind === 'pdf') return r.following ?? null; } catch (e) {} return null; })(),
    };
    out.after = after;
    out.unchanged = {
      pausedStillPaused: before.paused === after.paused && after.paused === true,
      positionSame: before.position === after.position,
      clockSame: before.playbackTime === after.playbackTime,
      followingSame: before.following === after.following,
    };
  } finally {
    await pauseIfPlaying();
    p.setStringPref(modeName, 'line'); // the run's working value; cleanup restores the baseline
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    await sleep(400);
    out.restored = { mode: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), hostMinimized: hostWin ? hostWin.windowState === 2 : null, paused: !!manager?.paused };
  }
  return JSON.stringify(out);
})()
