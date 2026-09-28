// Issue #155 run, audio gate on the PDF fixture (2026-09-29, 1.16.2-beta2).
// Mutes playback, starts the session with a trusted Shift+Space in the
// selected tab, samples the Engine session and audio output for ~2 s, then
// pauses. A frozen clock makes every audio-advance count NOT TESTABLE
// (machine) and the mechanism halves still run.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const out = { itemID: slot?.itemID ?? null, errors: [] };
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot?.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });

  // Select the fixture tab and mute before anything can speak
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) { out.errors.push('select: ' + String(e)); }
  await sleep(300);
  if (!p.prefHasUserValue(prefix + 'readAloud.volume')) { /* snapshot held at 155-00: 100, no user flag */ }
  p.setIntPref(prefix + 'readAloud.volume', 0);
  state.volumeDuringRun = true;
  await sleep(150);

  const manager = reader._internalReader._readAloudManager;
  out.memoryVoiceSafe = state.memoryVoiceSafe === true;

  // Trusted Shift+Space: press and release, modifier as its own pair
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  let beginError = null;
  try { tip.beginInputTransactionForTests(hostWin); } catch (e) { beginError = String(e); }
  const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
  const mod = { shiftKey: true };
  let keydownReturn = null;
  try {
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    keydownReturn = tip.keydown(ev('keydown', ' ', 'Space', 32, mod));
    tip.keyup(ev('keyup', ' ', 'Space', 32, mod));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
  } catch (e) { out.errors.push('key: ' + String(e)); }
  out.keydownReturn = keydownReturn;

  // Poll for an active session, then sample ~2 s
  const activeDeadline = Date.now() + 9000;
  while (Date.now() < activeDeadline && !manager?.active) await sleep(400);
  const engine = () => {
    try {
      const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      const list = rows.readers ?? [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === slot.itemID) return list[i] ?? null;
    } catch (e) { out.errors.push('engine: ' + String(e)); }
    return null;
  };
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const e = engine();
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    let di = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { di = k; break; } k++; }
    const row = d[di] ?? null;
    samples.push({
      t: i * 500,
      active: !!manager?.active, paused: !!manager?.paused,
      position: e?.session?.position ?? null, playbackTime: e?.session?.playbackTime ?? null,
      playing: e?.session?.playing ?? null,
      audioState: e?.audio?.state ?? null,
      scrollTop: row?.last?.from ?? null,
    });
    if (i < 4) await sleep(500);
  }
  let pauseError = null;
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
  await sleep(300);
  const after = engine();
  out.session = { active: !!manager?.active, paused: !!manager?.paused, position: after?.session?.position ?? null, popupOpen: !!reader._internalReader.popupOpen };
  out.samples = { first: samples[0], last: samples[samples.length - 1], count: samples.length,
    clockMoved: (samples[samples.length - 1].playbackTime ?? 0) > (samples[0].playbackTime ?? 0),
    positionMoved: samples[samples.length - 1].position !== samples[0].position };
  out.audioState = samples.map(s => s.audioState);
  out.pauseError = pauseError;
  out.beginError = beginError;
  return JSON.stringify(out);
})()
