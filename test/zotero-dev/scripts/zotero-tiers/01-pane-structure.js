// Item 1 (issue #111, structure updated for issue #159): opens the settings
// window fresh (driving notes Sec1) and reads every groupbox's id in DOM
// order plus the Zotero section's own shape: the h2, the note + its ?, then
// per tier a caption (the tier's name moved OUT of the switch row into a
// ztts-caption in #159), the credits row hbox (issue #159), and the switch
// row hbox whose FIRST children are the two buttons (no label before them)
// with the Log in link hidden while signed in. Leaves the settings window
// OPEN for the scripts that follow; only the kit's last script closes it.
// params: none. state: none (later scripts re-fetch the window).
(async () => {
  const out = { step: 'pane-structure' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Close a stale settings window first (driving notes Sec1): a window
    // opened before an in-place install would show the OLD pane.
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
      out.staleClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    } else {
      out.staleClosed = null;
    }

    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (!win || !win.document.getElementById('ztts-provider-openai-official')) throw new Error('settings window/pane never appeared');
    out.openedMs = Date.now() - t1;

    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t2 = Date.now();
    while (!doc.getElementById('ztts-zotero-section') && Date.now() - t2 < 8000) await sleep(150);
    out.zoteroSectionPresentMs = Date.now() - t2;

    const root = doc.querySelector('.ztts-pane');
    if (!root) throw new Error('.ztts-pane root not found');
    const groupboxes = Array.from(root.querySelectorAll(':scope > groupbox'));
    out.groupboxCount = groupboxes.length;
    out.groupboxIds = groupboxes.map((g) => g.id || null);
    out.noFishAudioId = !doc.getElementById('ztts-provider-fish-audio');
    out.noSubheadingH3 = root.querySelectorAll('h3.ztts-subheading').length;

    const section = doc.getElementById('ztts-zotero-section');
    const h2 = section ? section.querySelector('label > h2') : null;
    out.zoteroH2Text = h2 ? h2.textContent : null;
    out.zoteroH2HasLink = h2 ? !!h2.querySelector('label.zotero-text-link') : null;
    const note = section ? section.querySelector('description[data-l10n-id="ztts-zotero-note"]') : null;
    out.zoteroNotePresent = !!note;
    // The ? carries data-l10n-id="ztts-help-zotero" (the Fluent message id),
    // not id="ztts-help-zotero" (found the hard way on the first pass).
    out.zoteroHelpPresent = !!(section && section.querySelector('label.ztts-help[data-l10n-id="ztts-help-zotero"]'));

    const rowInfo = (tierId) => {
      const caption = section.querySelector('label.ztts-caption[data-l10n-id="ztts-zotero-' + tierId + '"]');
      const creditsRow = doc.getElementById('ztts-zotero-credits-row-' + tierId);
      const row = doc.getElementById('ztts-provider-zotero-' + tierId);
      if (!row) return null;
      const toggle = doc.getElementById('ztts-enable-zotero-' + tierId);
      const test = doc.getElementById('ztts-test-zotero-' + tierId);
      const result = doc.getElementById('ztts-test-result-zotero-' + tierId);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tierId);
      return {
        present: true,
        captionText: caption ? caption.textContent : null,
        captionWeight: caption ? win.getComputedStyle(caption).fontWeight : null,
        creditsRow: creditsRow ? { hidden: creditsRow.hidden === true, childIds: Array.from(creditsRow.children).map((c) => c.id || c.tagName.toLowerCase()) } : null,
        toggleLabel: toggle ? toggle.getAttribute('label') : null,
        toggleDisabled: toggle ? !!toggle.disabled : null,
        testPresent: !!test,
        // XUL buttons render their `label` ATTRIBUTE, not textContent.
        testLabel: test ? test.getAttribute('label') : null,
        resultText: result ? result.textContent : null,
        logIn: logIn ? { hidden: logIn.hidden === true, text: logIn.textContent } : null,
        // #159: the two buttons are the row's FIRST children (the tier's
        // field label became a caption above the credits row).
        firstChildIsEnableButton: row.firstElementChild === toggle,
        secondChildIsTestButton: row.children[1] === test,
        fieldsFound: row.querySelectorAll('input, menulist, checkbox').length,
      };
    };
    out.standardRow = rowInfo('standard');
    out.premiumRow = rowInfo('premium');
    out.standardEnabledPref = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.premiumEnabledPref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');

    out.windowOuterID = win.docShell && win.docShell.outerWindowID !== undefined ? win.docShell.outerWindowID : null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
