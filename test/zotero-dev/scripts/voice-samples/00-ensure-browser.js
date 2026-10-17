// 2.11 driver's view of the browser: the settings window is open on the plugin pane (left so by
// the system-voices kit's 03), the listing is settled, System selected in the first column and
// English in the second, and Daniel's row with its ▶ button is found. Records backend.spawned
// so the next scripts measure the rises against it.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) {
      // Open it on the plugin pane and wait for the listing this script then reads.
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 40 && !Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250);
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (!win) throw new Error('settings window did not open');
      await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
      for (let i = 0; i < 40; i++) { if (win.document.getElementById('ztts-provider-openai-official')) break; await sleep(250); }
    }
    out.windowFound = true;
    out.paneReady = !!win.document.getElementById('ztts-provider-openai-official');
    // Listing settled?
    let status = null;
    for (let i = 0; i < 80; i++) {
      const el = win.document.getElementById('ztts-voices-status');
      status = el ? el.textContent : null;
      if (status && !/Listing voices/i.test(status)) break;
      await sleep(250);
    }
    out.statusLine = status;
    // System in the first column (click if not the selected one).
    const tiers = win.document.getElementById('ztts-voices-tiers');
    const entries = tiers ? Array.from(tiers.querySelectorAll('button')) : [];
    const systemEntry = entries.find((b) => /^System \(/.test(b.textContent));
    out.systemEntry = systemEntry ? systemEntry.textContent : null;
    if (systemEntry) { systemEntry.click(); await sleep(400); }
    // English (United Kingdom) in the second column — the group that holds Daniel.
    const locales = win.document.getElementById('ztts-voices-locales');
    const localeButtons = locales ? Array.from(locales.querySelectorAll('button')) : [];
    out.localeEntries = localeButtons.map((b) => b.textContent);
    const group = localeButtons.find((b) => b.textContent === 'English (United Kingdom) (9)') || localeButtons.find((b) => /^English \(United Kingdom/.test(b.textContent));
    if (group) { group.click(); await sleep(400); }
    // Daniel's row: the voice column's row whose label button (third button) reads "Daniel".
    const rows = win.document.getElementById('ztts-voices-list');
    const row = rows ? Array.from(rows.children).find((r) => {
      const buttons = r.querySelectorAll('button');
      return buttons.length >= 3 && buttons[2].textContent.startsWith('Daniel');
    }) : null;
    out.danielRow = row ? { buttons: row.querySelectorAll('button').length, glyph: row.querySelector('button').textContent } : null;
    state.danielRowFound = !!row;
    // The spawn counter the item measures.
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    out.spawned0 = diag.backend ? diag.backend.spawned : null;
    state.spawned = out.spawned0;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
