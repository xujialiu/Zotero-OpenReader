// Item 6.23 (issue #192), phase 2: the user's own Enable ends the hold. The
// real Azure key goes back into the local pref WITHOUT a trigger (it stamps
// newer than the file's crafted "not-a-key" item, so nothing re-adopts it);
// Settings → OpenReader is opened (its pane-open poke syncs the real key up),
// the sync line is read while the hold stands ("Azure stays off on this
// computer: …", named as the Player names it, issue #193), then the Azure
// Enable button is pressed: its check passes, azure.enabled goes true, and
// webdav.syncState has no held.azure at once (read in this same script).
// After the quiet period the change sync completes with transport.held {} and
// the line no longer says "stays off". Azure checks spent: this Enable is the
// second of the run's budget of three. State: S.item623Enable.
(async () => {
  const out = { step: 'item-6.23-enable-ends-hold' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 25000, stepMs = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  try {
    if (!S.realAzureKey) throw new Error('no real Azure key in state (opener did not run)');
    const stateKey = prefix + 'webdav.syncState';
    const startStats = JSON.parse(await diagnostics.settingsSync()).transport;
    if (JSON.parse(p.getStringPref(stateKey)).held.azure == null) throw new Error('no held.azure at phase start');

    // --- The real key back, no trigger. ---
    p.setStringPref(prefix + 'azure.apiKey', S.realAzureKey);
    out.realKeyRestored = { keyChars: p.getStringPref(prefix + 'azure.apiKey').length, azureEnabled: p.getBoolPref(prefix + 'azure.enabled') };

    // --- Settings → OpenReader. ---
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const winReady = await waitFor(() => {
      const win = Services.wm.getMostRecentWindow('zotero:pref');
      return !!(win && win.Zotero_Preferences && win.document.getElementById('ztts-provider-azure') && win.document.getElementById('ztts-sync-settings-status'));
    }, 20000, 200);
    if (!winReady) throw new Error('the OpenReader pane did not come up');
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    out.paneOpen = true;
    S.prefWindowOpenedByRun = true;

    // --- The pane-open poke's sync settles; the line names the hold. ---
    const paneSyncDone = await waitFor(async () => {
      const t = JSON.parse(await diagnostics.settingsSync()).transport;
      return t.syncs > startStats.syncs && t.running === false && t.lastTrigger === 'pane-open' && t.pendingChange === false;
    }, 25000, 250);
    const paneSyncStats = JSON.parse(await diagnostics.settingsSync()).transport;
    out.paneOpenSync = { waited: !!paneSyncDone, lastTrigger: paneSyncStats.lastTrigger, pushed: paneSyncStats.pushed, uploaded: paneSyncStats.uploaded, heldNow: paneSyncStats.held };
    await sleep(500); // the line's post-sync redraw
    const lineDuringHold = win.document.getElementById('ztts-sync-settings-status').textContent;
    out.lineDuringHold = lineDuringHold;
    out.lineNamesAzure = /Azure stays off on this computer: /.test(lineDuringHold);
    out.lineHasRawIdAzure = /(^|\.\s)azure stays off/.test(lineDuringHold);

    // --- Enable: click, then poll in this same script. ---
    const button = win.document.getElementById('ztts-enable-azure');
    out.buttonLabelBefore = button.getAttribute('label');
    button.click();
    const enabled = await waitFor(() => p.getBoolPref(prefix + 'azure.enabled') === true, 25000, 150);
    await sleep(300);
    const heldNow = JSON.parse(p.getStringPref(stateKey)).held;
    out.enable = {
      waited: !!enabled,
      azureEnabled: p.getBoolPref(prefix + 'azure.enabled'),
      buttonLabelAfter: button.getAttribute('label'),
      resultLine: win.document.getElementById('ztts-test-result-azure').textContent,
      heldAfterEnable: heldNow,
      heldAzureGoneAtOnce: !heldNow.azure,
    };

    // --- The quiet-period change sync; the line redraws without the hold. ---
    const quietDone = await waitFor(async () => {
      const t = JSON.parse(await diagnostics.settingsSync()).transport;
      return t.syncs > paneSyncStats.syncs && t.running === false && t.lastTrigger === 'change' && t.pendingChange === false;
    }, 25000, 250);
    const quietStats = JSON.parse(await diagnostics.settingsSync()).transport;
    await sleep(500);
    const lineAfter = win.document.getElementById('ztts-sync-settings-status').textContent;
    out.changeSync = {
      waited: !!quietDone, lastTrigger: quietStats.lastTrigger, lastOutcome: quietStats.lastOutcome,
      adopted: quietStats.adopted, pushed: quietStats.pushed, uploaded: quietStats.uploaded,
      transportHeld: quietStats.held, lineAfter, lineSaysStaysOff: lineAfter.includes('stays off'),
    };

    // --- The window closed again (6.24 reopens it on a fresh pane load). ---
    win.close();
    const closed = await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 10000, 200);
    out.windowClosed = !!closed;

    out.status = out.lineNamesAzure && out.enable.azureEnabled && out.enable.heldAzureGoneAtOnce
      && out.changeSync.lastOutcome === 'ok' && Object.keys(out.changeSync.transportHeld).length === 0
      && !out.changeSync.lineSaysStaysOff && out.windowClosed ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    try { const w = Services.wm.getMostRecentWindow('zotero:pref'); if (w) w.close(); } catch (_) {}
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
