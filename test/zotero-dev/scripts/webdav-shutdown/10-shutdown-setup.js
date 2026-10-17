// Item 1 (issue #219), setup: the folder Enabled on the local stub, the
// positions and settings syncs on, the startup syncs settled in the stub's
// log. Params: stubPort, stubLog. Reads the stub log with IOUtils; the log
// path comes from the harness (the stub prints it at start). Leaves the
// folder on at http://127.0.0.1:<port>/dav/ with syncPositions/syncSettings
// true, records the settled log length in state.stubLogCount.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'shutdown-setup' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stubUrl = `http://127.0.0.1:${P.stubPort}/dav/`;
  state.stubUrl = stubUrl;
  try {
    // The pane, on the plugin pane.
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) { win.close(); const tw = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tw < 3000) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const t1 = Date.now();
    while (Date.now() - t1 < 8000) {
      await sleep(150);
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.Zotero_Preferences) {
        try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch { /* a beat */ }
        if (win.document.getElementById('ztts-webdav-enable')) break;
      }
    }
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;

    // Folder off (fields unlocked), URL at the stub, Enable through the pane.
    if (Zotero.Prefs.get(full('webdav.enabled'), true) === true) {
      toggle.click();
      const t2 = Date.now();
      while (Date.now() - t2 < 5000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    }
    Zotero.Prefs.set(full('webdav.url'), stubUrl, true);
    await sleep(300);
    toggle.click();
    const trace = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await sleep(25);
      const s = { t: Date.now() % 100000, label: toggle.getAttribute('label'), line: line(), enabled: Zotero.Prefs.get(full('webdav.enabled'), true) };
      const last = trace[trace.length - 1];
      if (!last || s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.enabled === true) break;
    }
    out.enableTrace = trace;
    out.finalLine = line();
    out.hasPlainHttpWarning = /Warning: http:\/\//.test(out.finalLine ?? '');
    out.enabledOnStub = Zotero.Prefs.get(full('webdav.enabled'), true) === true;

    // The two switches on (auto-upload stays suspended for this item).
    Zotero.Prefs.set(full('webdav.syncPositions'), true, true);
    Zotero.Prefs.set(full('webdav.syncSettings'), true, true);
    await sleep(300);

    // Settle: wait until the stub log has been quiet for ~4 s (max ~26 s).
    const readLog = async () => {
      try { return (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean); } catch { return []; }
    };
    let lines = await readLog();
    let quietFor = 0;
    const t3 = Date.now();
    while (Date.now() - t3 < 26000) {
      await sleep(1000);
      const now = await readLog();
      if (now.length === lines.length) quietFor += 1000; else { quietFor = 0; lines = now; }
      if (quietFor >= 4000) break;
    }
    out.settledEntries = lines.map((l) => { const e = JSON.parse(l); return { t: e.t, method: e.method, path: e.path.split('/').pop() }; });
    state.stubLogCount = lines.length;
    out.ok = out.enabledOnStub && out.hasPlainHttpWarning && lines.length > 0;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
