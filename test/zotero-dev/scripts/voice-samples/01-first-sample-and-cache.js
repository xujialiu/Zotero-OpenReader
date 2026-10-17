// 2.11, first half: ▶ on the System voice Daniel and let it end — backend.spawned up by one.
// ▶ the same voice again — spawned unchanged (the sample came from the window's cache).
// The settings window stays open throughout; volume is muted, so nothing is heard.
// Each spawned() read costs one osascript listing whose spawn lands in the NEXT read's
// snapshot (the diagnostic reads backend.state() before it lists), so a delta between two
// reads is (later - earlier - 1): +1 means one real say, 0 means none. The window must not
// already hold this sample (a fresh window or an unchanged setup elsewhere): a cache hit
// reads 0 where the fresh sample reads +1.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const spawned = async () => {
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    return diag.backend ? diag.backend.spawned : null;
  };
  // Finds Daniel's row afresh every time (a sample's end re-renders the rows).
  const playButton = (win) => {
    const rows = win.document.getElementById('ztts-voices-list');
    const row = rows ? Array.from(rows.children).find((r) => {
      const buttons = r.querySelectorAll('button');
      return buttons.length >= 3 && buttons[2].textContent.startsWith('Daniel');
    }) : null;
    return row ? row.querySelector('button') : null;
  };
  // Click ▶ and poll the glyph into a trace until it is back to ▶ (the sample ended or failed).
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
    out.spawned0 = state.spawned;
    // Each spawned() read costs one osascript listing whose spawn lands in the NEXT read's
    // snapshot (the diagnostic reads backend.state() before it lists), so a delta between two
    // reads is (later - earlier - 1) per read in between: +1 means one real say, 0 means none.
    // ▶ and let it end.
    out.firstTrace = await playAndWait(win);
    await sleep(400);
    out.spawned1 = await spawned();
    out.firstRises = out.spawned1 - out.spawned0 - 1 === 1;
    // ▶ the same voice again.
    out.secondTrace = await playAndWait(win);
    await sleep(400);
    out.spawned2 = await spawned();
    out.secondUnchanged = out.spawned2 - out.spawned1 - 1 === 0;
    state.spawned = out.spawned2;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
