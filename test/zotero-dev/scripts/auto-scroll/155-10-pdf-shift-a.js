// Issue #155 run, item 8 on the PDF (2026-09-29, 1.16.2-beta2).
// Trusted Shift+A toggles outside -> sentence -> outside; each press names
// the new mode in a toast ("Auto-scroll: scroll at every sentence" /
// "Auto-scroll: when outside the view") and the Scrolling section's radio
// follows. A held repeat produces one switch. Paused audio stays paused at
// the same position with the same clock; following is untouched.
// Starts and ends at `outside` (the baseline value).
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const out = { itemID: slot?.itemID ?? null, errors: [] };
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot?.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  const manager = reader._internalReader._readAloudManager;
  const pauseIfPlaying = async () => { try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {} await sleep(200); };

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
  const radioValue = win => win?.document?.getElementById('ztts-auto-scroll-mode')?.value ?? null;
  const toastText = () => {
    const doc = reader._iframeWindow?.document;
    return doc?.getElementById('ztts-speed-toast')?.textContent ?? null;
  };
  const engineRow = () => {
    try {
      const list = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers ?? [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === slot.itemID) return list[i] ?? null;
    } catch (e) { return null; }
    return null;
  };

  try {
    p.setStringPref(modeName, 'outside');
    const win = await paneReady();
    out.paneReady = !!win;
    const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
    try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
    await sleep(300);
    await pauseIfPlaying();

    const before = {
      mode: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), radio: radioValue(win),
      paused: !!manager?.paused, position: engineRow()?.session?.position ?? null,
      playbackTime: engineRow()?.session?.playbackTime ?? null,
      following: (() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()).find(x => x?.itemID === slot.itemID || x?.kind === 'pdf')?.following ?? null; } catch (e) { return null; } })(),
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

    // First press: outside -> sentence
    const r1 = pressShiftA();
    await sleep(120);
    const mid1 = { ret: r1, mode: p.getStringPref(modeName), radio: radioValue(win), toast: toastText() };
    await sleep(700);
    out.press1 = { ...mid1, toastAfter700ms: toastText(), expectedToast: 'Auto-scroll: scroll at every sentence' };

    // Held repeat: one switch only
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', 'A', 'KeyA', 65, { shiftKey: true }));
    const rRep = tip.keydown(ev('keydown', 'A', 'KeyA', 65, { shiftKey: true })); // the repeat
    tip.keyup(ev('keyup', 'A', 'KeyA', 65, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    await sleep(150);
    out.repeat = { ret: rRep, mode: p.getStringPref(modeName), radio: radioValue(win), expectedMode: 'sentence' };

    // Second press: sentence -> outside
    const r2 = pressShiftA();
    await sleep(120);
    const mid2 = { ret: r2, mode: p.getStringPref(modeName), radio: radioValue(win), toast: toastText() };
    await sleep(700);
    out.press2 = { ...mid2, toastAfter700ms: toastText(), expectedToast: 'Auto-scroll: when outside the view' };

    const after = {
      mode: p.getStringPref(modeName), user: p.prefHasUserValue(modeName),
      paused: !!manager?.paused, position: engineRow()?.session?.position ?? null,
      playbackTime: engineRow()?.session?.playbackTime ?? null,
      following: (() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()).find(x => x?.kind === 'pdf')?.following ?? null; } catch (e) { return null; } })(),
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
    p.setStringPref(modeName, 'outside'); // the baseline value, user flag as found (true)
    await sleep(200);
    out.restored = { mode: p.getStringPref(modeName), user: p.prefHasUserValue(modeName) };
  }
  return JSON.stringify(out);
})()
