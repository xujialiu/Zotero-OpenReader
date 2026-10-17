// 1.17 setup: turn System voices ON through the pane's own switch (#ztts-enable-system), then close the window.
// Skipped when the switch is already on (the brief: found on, leave on). 01 is reverted by 06-cleanup.js.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const PREF = 'extensions.zotero.zotero-tts.system.enabled';
  out.enabledBefore = Services.prefs.prefHasUserValue(PREF) ? Services.prefs.getBoolPref(PREF) : Services.prefs.getDefaultBranch('').getBoolPref(PREF);
  if (out.enabledBefore === true) { out.skipped = 'already on; left on'; return JSON.stringify(out); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Open the settings window on the plugin pane (one script so the pane is there when the click lands).
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    for (let i = 0; i < 40; i++) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win) break;
      await sleep(250);
    }
    if (!win) throw new Error('settings window did not open');
    out.opened = true;
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    for (let i = 0; i < 40; i++) {
      if (win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(250);
    }
    const button = win.document.getElementById('ztts-enable-system');
    if (!button) throw new Error('#ztts-enable-system not found');
    out.labelBefore = button.getAttribute('label') || button.textContent;
    button.click();
    // The Enable writes the pref; poll up to 5 s.
    for (let i = 0; i < 20; i++) {
      if (Services.prefs.getBoolPref(PREF) === true) break;
      await sleep(250);
    }
    out.enabledAfter = Services.prefs.getBoolPref(PREF);
    out.labelAfter = button.getAttribute('label') || button.textContent;
    out.sectionLocked = !!win.document.getElementById('ztts-provider-system');
    // Close: the sample items reopen their own window on the pane it last showed.
    win.close();
    for (let i = 0; i < 20; i++) {
      if (!Services.wm.getMostRecentWindow('zotero:pref')) { out.closed = true; break; }
      await sleep(250);
    }
    out.closed = out.closed === true;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
