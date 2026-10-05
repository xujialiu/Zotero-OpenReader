// Item 5a: the gate's "on" side. Turns the positions sync on (the folder
// is on, the test configuration in place) — the switch observer pokes the
// transports at once — waits for the sync to settle, then reopens the
// settings window so the pane's own pane-open poke runs the transport
// again. Records both transports' stats for the comparison in 5b.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'gate-on' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const quiet = async () => { for (let i = 0; i < 40; i++) { const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()); if (!(p.transport?.running || p.shared?.transport?.running)) return p; await sleep(250); } return null; };
  try {
    // Positions sync on: the observer pokes both transports ('switch-on').
    Zotero.Prefs.set(full('webdav.syncPositions'), true, true);
    const settled1 = await quiet();
    out.afterSwitchOn = {
      lastTrigger: settled1?.transport?.lastTrigger ?? null,
      lastOutcome: settled1?.transport?.lastOutcome ?? null,
      syncs: settled1?.transport?.syncs ?? null,
    };

    // Fresh pane: the pane-open poke.
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) { w.close(); let n = 0; while (Services.wm.getMostRecentWindow('zotero:pref') && n++ < 50) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null; let n = 0;
    while (n++ < 60) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) break; await sleep(100); }
    if (!win) throw new Error('no settings window opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    n = 0;
    while (n++ < 60 && !win.document.getElementById('ztts-webdav-enable')) await sleep(100);
    const settled2 = await quiet();
    if (!settled2) throw new Error('transport never settled');

    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    state.gateStatsBefore = { transport: settled2.transport, shared: settled2.shared.transport, settings: sy.transport };
    out.statsBefore = state.gateStatsBefore;
    out.folder = settled2.folder;
    out.enabled = settled2.enabled;
    out.ok = out.afterSwitchOn.lastTrigger === 'switch-on' && out.folder === true && out.enabled === true;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
