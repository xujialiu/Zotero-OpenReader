// 2.11, second half: change Azure's Region while Azure is off (the pane's own field), then
// ▶ the same System voice — spawned up by one: the samples are kept under the whole setup
// (core/settings.ts audioSetup), so any such change makes them again. ▶ once more — unchanged.
// The Region goes back exactly as it was, including whether it had a user value (here: none).
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const REGION_PREF = 'extensions.zotero.zotero-tts.azure.region';
  let regionTouched = false;
  const spawned = async () => {
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    return diag.backend ? diag.backend.spawned : null;
  };
  const playButton = (win) => {
    const rows = win.document.getElementById('ztts-voices-list');
    const row = rows ? Array.from(rows.children).find((r) => {
      const buttons = r.querySelectorAll('button');
      return buttons.length >= 3 && buttons[2].textContent.startsWith('Daniel');
    }) : null;
    return row ? row.querySelector('button') : null;
  };
  const playAndWait = async (win) => {
    const button = playButton(win);
    if (!button) throw new Error("Daniel's row with a ▶ button not found");
    button.click();
    const trace = [{ t: 0, glyph: button.textContent }];
    for (let i = 1; i <= 200; i++) {
      await sleep(100);
      const now = playButton(win);
      const glyph = now ? now.textContent : '(row gone)';
      if (glyph !== trace[trace.length - 1].glyph) trace.push({ t: i * 100, glyph });
      if (glyph === '▶' && trace.length > 1) break;
    }
    return trace;
  };
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open');
    out.azureOff = Services.prefs.getBoolPref('extensions.zotero.zotero-tts.azure.enabled') === false;
    out.spawned2 = state.spawned;
    // Snapshot the Region: value, and whether it had a user value (restoration must match both).
    out.regionBefore = {
      value: Services.prefs.getStringPref(REGION_PREF),
      user: Services.prefs.prefHasUserValue(REGION_PREF)
    };
    // Change it through the pane's own field (an html:input bound to the pref).
    const input = win.document.querySelector('input[preference="extensions.zotero.zotero-tts.azure.region"]');
    if (!input) throw new Error('Azure Region input not found');
    input.value = 'westus2';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(400);
    out.regionAfter = { value: Services.prefs.getStringPref(REGION_PREF), user: Services.prefs.prefHasUserValue(REGION_PREF) };
    out.regionChanged = out.regionAfter.value === 'westus2';
    if (!out.regionChanged) throw new Error('the pane field did not write the pref');
    regionTouched = true;
    // ▶ the same voice: a new sample is made.
    out.thirdTrace = await playAndWait(win);
    await sleep(400);
    out.spawned3 = await spawned();
    // The read's own listing rides in the next snapshot (see 01): subtract one per read.
    out.thirdRises = out.spawned3 - out.spawned2 - 1 === 1;
    // ▶ once more: from the cache again.
    out.fourthTrace = await playAndWait(win);
    await sleep(400);
    out.spawned4 = await spawned();
    out.fourthUnchanged = out.spawned4 - out.spawned3 - 1 === 0;
    state.spawned = out.spawned4;
    return JSON.stringify(out);
  } catch (e) {
    out.fatal = String(e && e.message || e);
    return JSON.stringify({ fatal: out.fatal, step: out });
  } finally {
    // Put the Region back exactly as it was, on every path: no user value here, so the user
    // value is cleared, leaving the default the profile held.
    if (regionTouched) {
      if (out.regionBefore.user === false) Services.prefs.clearUserPref(REGION_PREF);
      else Services.prefs.setStringPref(REGION_PREF, out.regionBefore.value);
      out.regionRestored = {
        value: Services.prefs.getStringPref(REGION_PREF),
        user: Services.prefs.prefHasUserValue(REGION_PREF),
        asFound: out.regionBefore
      };
    }
  }
})()
