// Item 1 (issue #237): the settings row and the global window. Opens the
// preferences, navigates to the plugin pane, reads the Replacements row
// (label, the Edit… button `ztts-replacements-open`, the ? whose help
// mentions the player), then opens the replacements window with no index —
// the global rows alone: the intro says "For every document", the columns
// have no Applies to. Closes both windows again (the baseline had none
// open). Never the tutorial link. params: none. state: reads baseline.
(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const topId = () => safe(() => Services.wm.getMostRecentWindow(null)?.document?.documentElement?.id);
  // 1. the settings pane
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let prefWin = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (prefWin) break;
  }
  if (!prefWin) throw new Error('the settings window did not open');
  await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (prefWin.document.getElementById('ztts-replacements-open')) break;
  }
  const doc = prefWin.document;
  out.settingsRow = {
    labelText: safe(() => doc.querySelector('label[control="ztts-replacements-open"]')?.textContent),
    buttonLabel: safe(() => doc.getElementById('ztts-replacements-open')?.label),
    buttonExists: !!doc.getElementById('ztts-replacements-open'),
    helpText: safe(() => doc.querySelector('[data-l10n-id="ztts-help-replacements"]')?.getAttribute('help')),
    helpMentionsPlayer: safe(() => /player/i.test(doc.querySelector('[data-l10n-id="ztts-help-replacements"]')?.getAttribute('help') ?? '')),
  };
  // 2. the global window (no index)
  await Zotero.ZoteroTTS.diagnostics.openReplacementsWindow();
  let win = null;
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    if (topId() === 'ztts-replacements-window') { win = Services.wm.getMostRecentWindow(null); break; }
  }
  if (!win) throw new Error('the replacements window did not open');
  const wdoc = win.document;
  out.window = {
    intro: safe(() => wdoc.getElementById('ztts-replacements-intro')?.textContent),
    columns: safe(() => Array.from(wdoc.querySelectorAll('#ztts-replacements-tree .virtualized-table-header .cell .label')).map((l) => l.textContent)),
    hasAppliesToColumn: safe(() => Array.from(wdoc.querySelectorAll('#ztts-replacements-tree .virtualized-table-header .cell .label')).some((l) => /applies/i.test(l.textContent))),
    rows: safe(() => wdoc.querySelectorAll('#ztts-replacements-tree .row').length),
    tutorialLinkText: safe(() => wdoc.querySelector('#ztts-replacements-intro a')?.textContent),
  };
  // 3. close the window, then the settings window (the baseline had none open)
  safe(() => wdoc.getElementById('ztts-replacements-dialog').cancelDialog());
  for (let i = 0; i < 40; i++) { await sleep(150); if (topId() !== 'ztts-replacements-window') break; }
  out.windowGone = topId() !== 'ztts-replacements-window';
  safe(() => prefWin.close());
  for (let i = 0; i < 40; i++) { await sleep(150); if (!Services.wm.getMostRecentWindow('zotero:pref')) break; }
  out.settingsWindowGone = !Services.wm.getMostRecentWindow('zotero:pref');
  return JSON.stringify(out, null, 1);
})()
