// 1.17 browser column: reopen the settings window on the plugin pane, wait for the voice
// browser to finish listing, and read the first column's entries — the System entry must
// read "System (193)". Leaves the window OPEN on the pane (voice-samples item 2.11 keeps
// it open throughout and drives its ▶ rows here).
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // A leftover window from an earlier step holds a stale pane: close and wait it out first.
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) { win.close(); for (let i = 0; i < 20 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    for (let i = 0; i < 40 && !Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250);
    win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window did not open');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    for (let i = 0; i < 40; i++) {
      if (win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(250);
    }
    out.paneReady = !!win.document.getElementById('ztts-provider-openai-official');
    // Wait for the status line to leave "Listing voices…" before reading the columns.
    let status = null;
    for (let i = 0; i < 80; i++) {
      const el = win.document.getElementById('ztts-voices-status');
      status = el ? el.textContent : null;
      if (status && !/Listing voices/i.test(status)) break;
      await sleep(250);
    }
    out.statusLine = status;
    const tiers = win.document.getElementById('ztts-voices-tiers');
    const entries = tiers ? Array.from(tiers.querySelectorAll('button')).map((b) => b.textContent) : [];
    out.tierEntries = entries;
    const system = entries.find((t) => /^System \(/.test(t));
    out.systemEntry = system || null;
    out.systemCount = system ? Number(system.match(/\((\d+)\)/)?.[1]) : null;
    // Which language entry is selected, for the sample step's voice column.
    const locales = win.document.getElementById('ztts-voices-locales');
    out.localeEntries = locales ? Array.from(locales.querySelectorAll('button')).map((b) => b.textContent) : null;
    state.settingsWindow = { open: true };
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
