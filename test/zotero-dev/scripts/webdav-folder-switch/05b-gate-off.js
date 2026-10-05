// Item 5b: the gate's "off" side. Presses Disable (the line empties, the
// rows grey), then pokes the transport the same way — a fresh pane's
// pane-open poke — and compares positionSync().transport,
// .shared.transport and the settings sync field by field against the
// stats 5a recorded. With the folder off, the poke must reach nothing:
// the transports record the skipped attempt, and no data field moves.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'gate-off' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const quiet = async () => { for (let i = 0; i < 40; i++) { const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()); if (!(p.transport?.running || p.shared?.transport?.running)) return p; await sleep(250); } return null; };
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document;
    const before = state.gateStatsBefore;
    if (!before) throw new Error('no stats from 5a');

    // Disable: the line empties, the rows grey, the switch writes false.
    doc.getElementById('ztts-webdav-enable').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      await sleep(100);
      if (Zotero.Prefs.get(full('webdav.enabled'), true) === false) break;
    }
    out.afterDisable = {
      enabled: Zotero.Prefs.get(full('webdav.enabled'), true),
      line: doc.getElementById('ztts-webdav-message')?.textContent ?? null,
      rows: ['ztts-webdav-sync-positions', 'ztts-webdav-sync-settings', 'ztts-webdav-auto-upload', 'ztts-webdav-upload', 'ztts-webdav-download']
        .map((id) => ({ id, disabled: !!doc.getElementById(id)?.disabled })),
    };

    // The same poke again: a fresh pane's pane-open.
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) { w.close(); let n = 0; while (Services.wm.getMostRecentWindow('zotero:pref') && n++ < 50) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win2 = null; n = 0;
    while (n++ < 60) { win2 = Services.wm.getMostRecentWindow('zotero:pref'); if (win2) break; await sleep(100); }
    if (!win2) throw new Error('no settings window reopened');
    await win2.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    n = 0;
    while (n++ < 60 && !win2.document.getElementById('ztts-webdav-enable')) await sleep(100);
    const settled = await quiet();
    if (!settled) throw new Error('transport never settled');
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());

    // Field by field against 5a's stats.
    const diff = (a, b) => {
      const d = {};
      for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) d[k] = { was: a?.[k] ?? null, now: b?.[k] ?? null };
      return d;
    };
    out.diff = {
      transport: diff(before.transport, settled.transport),
      shared: diff(before.shared, settled.shared.transport),
      settings: diff(before.settings, sy.transport),
    };
    out.statsAfter = { transport: settled.transport, shared: settled.shared.transport };
    out.lineAfterReopen = win2.document.getElementById('ztts-webdav-message')?.textContent ?? null;
    out.ok = out.afterDisable.enabled === false && out.afterDisable.line === ''
      && out.afterDisable.rows.every((r) => r.disabled)
      // The gate: no run against the folder — the data fields frozen, the
      // attempt recorded as skipped, no error.
      && settled.transport.lastOutcome === 'skipped' && settled.transport.lastError === null
      && settled.transport.remoteEntries === before.transport.remoteEntries
      && settled.transport.adopted === before.transport.adopted
      && settled.transport.uploaded === false
      && settled.shared.transport.lastOutcome === 'skipped'
      && settled.shared.transport.remoteItems === before.shared.remoteItems
      && settled.shared.transport.uploaded === false
      && sy.transport.lastOutcome === 'skipped' && sy.transport.lastError === null;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
