// Close the fixture before disabling its providers. The driver restores
// the standard baseline after the settings window closes.
//
// ORDER BUG FOUND LIVE 2026-09-16 IN THIS SCRIPT'S FIRST DRAFT, fixed
// here: it disabled BEFORE closing the fixture, so the fixture (still
// active/paused) made refuseWhileReading show the reading-guard dialog on
// BOTH Enable clicks; this script's poll (the SAME started-before-hold()
// mistake as 04's first draft -- see there) read the unchanged pre-click
// state as "already settled" and never noticed or closed the dialog, so
// the settings window was then closed by this script's LAST step while
// that dialog's own awaited promise was still pending -- permanently
// orphaning it (the window and its DOM, dialog included, were destroyed
// mid-await). Both switches stayed on; recovered live by reopening the
// pane with no reader active this time (so no dialog) and re-clicking
// Disable with a corrected poll. Fixed here by (a) closing/erasing the
// fixture BEFORE attempting either Disable, matching the case's own
// wording ("Disable both (no player open)"), and (b) waiting for the
// "started" transition (disabled, "Checking...", or the #ztts-notice
// dialog appearing) before waiting for "settled" -- closing any dialog
// seen with dialog.close() (never a button) as a safety net, though it
// should not appear once the fixture is already gone.
//
// state: item4Fixture.
(async () => {
  const out = { step: 'cleanup-restore' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PREFIX = 'extensions.zotero.zotero-tts.';
  const S = Zotero.ZoteroTTSRun.state;
  try {
    // --- Close and erase the fixture FIRST (before touching either switch). ---
    let fixtureItemID = S.item4Fixture;
    if (fixtureItemID == null) {
      // Fallback: search recent items by this run's title prefix.
      try {
        const s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition('title', 'contains', 'Zotero-TTS issue 113 openai-split fixture B');
        const ids2 = await s.search();
        if (ids2 && ids2.length) fixtureItemID = ids2[ids2.length - 1];
      } catch (e) { out.fixtureSearchError = String(e); }
    }
    out.fixtureItemIDUsed = fixtureItemID ?? null;
    if (fixtureItemID != null) {
      const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtureItemID);
      if (reader) {
        try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) { out.popupCloseError = String(e); }
        await sleep(300);
      }
      try {
        const item = Zotero.Items.get(fixtureItemID);
        if (item) {
          const parent = item.parentItem;
          if (parent) await parent.eraseTx();
          else await item.eraseTx();
          out.fixtureErased = true;
        } else {
          out.fixtureErased = false;
          out.fixtureEraseNote = 'item already gone';
        }
      } catch (e) { out.fixtureEraseError = String(e); }
    } else {
      out.fixtureEraseNote = 'no fixture itemID found in state or by title search -- nothing to erase';
    }
    out.readersAfterFixtureClose = (Zotero.Reader._readers || []).map((r) => {
      const m = r._internalReader?._readAloudManager;
      return { itemID: r.itemID, active: !!(m && m.active) };
    });

    // --- Disable both providers (no reader should be active now). ---
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) {
      const doc = win.document;
      async function disableSection(id) {
        const toggle = doc.getElementById('ztts-enable-' + id);
        if (!toggle) return { skipped: 'no #ztts-enable-' + id };
        const before = Zotero.Prefs.get(PREFIX + id + '.enabled', true);
        if (!before) return { alreadyOff: true, before };
        toggle.click();
        // Wait for the click to actually START having an effect: disabled,
        // "Checking...", OR a reading-guard dialog -- onToggle's own first
        // await (refuseWhileReading) runs before any of these, so the very
        // first read can still show the unchanged pre-click state.
        let dialogSeen = false;
        let started = false;
        const s0 = Date.now();
        while (Date.now() - s0 < 3000) {
          if (doc.getElementById('ztts-notice')) { dialogSeen = true; break; }
          if (toggle.disabled || /checking/i.test(toggle.getAttribute('label') || '')) { started = true; break; }
          await sleep(50);
        }
        if (dialogSeen) {
          // Should not happen once the fixture is closed; a safety net only
          // -- close (never click a button), matching the workflow's rule.
          const dialog = doc.getElementById('ztts-notice');
          const bodyText = Array.from(dialog.querySelectorAll('div')).map((d) => d.textContent).join('\n');
          dialog.close();
          await sleep(300);
          return { before, dialogSeen: true, dialogText: bodyText, after: Zotero.Prefs.get(PREFIX + id + '.enabled', true) };
        }
        let settled = !toggle.disabled;
        const s1 = Date.now();
        while (!settled && Date.now() - s1 < 10000) { await sleep(150); settled = !toggle.disabled; }
        return { before, started, settled, after: Zotero.Prefs.get(PREFIX + id + '.enabled', true) };
      }
      out.disableMimo = await disableSection('mimo');
      out.disableCompatible = await disableSection('compatible');
    } else {
      out.disableSkipped = 'settings window was not open';
    }
    out.mimoEnabledFinal = Zotero.Prefs.get(PREFIX + 'mimo.enabled', true);
    out.compatibleEnabledFinal = Zotero.Prefs.get(PREFIX + 'compatible.enabled', true);
    out.openaiOfficialEnabledFinal = Zotero.Prefs.get(PREFIX + 'openai-official.enabled', true);

    try {
      const w = Services.wm.getMostRecentWindow('zotero:pref');
      if (w) {
        w.close();
        const t = Date.now();
        while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t < 10000) await sleep(200);
      }
      out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    } catch (e) { out.windowCloseError = String(e); }

    out.debugStoringNow = Zotero.Debug.storing; // was true before this run started; left as is.

    const readers = Zotero.Reader._readers || [];
    out.readersFinal = readers.map((r) => {
      const m = r._internalReader?._readAloudManager;
      return { itemID: r.itemID, active: !!(m && m.active), paused: m ? !!m.paused : null };
    });

    try {
      const errs = Zotero.getErrors(true) || [];
      out.errorsAfter = { count: errs.length, lastFive: errs.slice(-5).map(String) };
    } catch (e) { out.errorsAfterError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
