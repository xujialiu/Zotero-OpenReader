// Case: system-voice-selection, item 2 — the settings voice browser rows.
// Rendering-dependent: restores the main window, opens the plugin's settings
// pane, waits for the voice browser's listing to settle, selects the System
// tier and the English locale, and reads the voice rows' label buttons.
// Rows carry labels only (no ids in the browser DOM); ids are proven at the
// Player in 05. The main window is minimized again at the end.
(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win0 = Zotero.getMainWindow();
  const wasMinimized = win0.windowState === 2;
  out.mainWindow = { wasMinimized };
  if (wasMinimized) { win0.restore(); await sleep(600); }

  // A settings window open before the install holds the old pane: close it first (§1)
  let stale = null;
  try { stale = Services.wm.getMostRecentWindow('zotero:pref'); } catch (e) { /* none */ }
  if (stale) {
    out.stalePrefsWindowClosed = true;
    stale.close();
    for (let i = 0; i < 40 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250);
  }

  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let win = null;
  for (let i = 0; i < 40 && !win; i++) { await sleep(250); win = Services.wm.getMostRecentWindow('zotero:pref'); }
  if (!win) throw new Error('settings window did not open');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 40 && !win.document.getElementById('ztts-provider-openai-official'); i++) await sleep(250);
  if (!win.document.getElementById('ztts-provider-openai-official')) throw new Error('plugin pane did not load');
  const doc = win.document;
  const list = () => doc.getElementById('ztts-voices-list');
  const stableCount = async () => {
    let prev = -2;
    for (let i = 0; i < 40; i++) {
      await sleep(400);
      const n = list()?.childElementCount ?? -1;
      if (n > 0 && n === prev) return n;
      prev = n;
    }
    return list()?.childElementCount ?? -1;
  };
  out.initialRows = await stableCount();
  out.statusAfterLoad = doc.getElementById('ztts-voices-status')?.textContent ?? null;

  const tierRows = [...doc.getElementById('ztts-voices-tiers').children];
  out.tierRows = tierRows.map((b) => b.textContent);
  const sysRow = tierRows.find((b) => (b.textContent || '').startsWith('System'));
  if (!sysRow) throw new Error('System tier row not found');
  sysRow.click();
  out.rowsAfterTier = await stableCount();

  const localeRows = [...doc.getElementById('ztts-voices-locales').children];
  out.localeRows = localeRows.map((b) => b.textContent);
  const enRow = localeRows.find((b) => (b.textContent || '').startsWith('English'));
  if (!enRow) throw new Error('English locale row not found');
  enRow.click();
  await sleep(400);

  out.voiceRows = [...list().children].map((row) => {
    const buttons = [...row.querySelectorAll('button')];
    const label = buttons[buttons.length - 1] ?? null;
    return { label: label ? label.textContent : null, rowText: row.textContent };
  });
  out.voiceRowCount = out.voiceRows.length;
  out.statusFinal = doc.getElementById('ztts-voices-status')?.textContent ?? null;

  if (wasMinimized) { win0.minimize(); await sleep(300); }
  out.mainWindowEndState = win0.windowState;
  return JSON.stringify(out, null, 1);
})()
