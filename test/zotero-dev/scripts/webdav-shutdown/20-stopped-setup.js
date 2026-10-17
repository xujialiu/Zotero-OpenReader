// Item 2 (issue #220), setup: stub in answer mode, the folder Enabled on it,
// the settings sync and the settings auto-upload on (the positions sync stays
// suspended, so the log holds settings traffic only). Settles the startup
// sync and records the log length in state.stubLogCount2. Params: stubPort,
// stubLog.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'stopped-setup' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stubUrl = state.stubUrl || `http://127.0.0.1:${P.stubPort}/dav/`;
  try {
    // Answer mode, whatever the previous item left.
    const ctl = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=answer`, { timeout: 3000 });
    out.control = JSON.parse(ctl.responseText);

    // The pane, on the plugin pane (opened here — the window may be closed).
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win || !win.document.getElementById('ztts-webdav-enable')) {
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
    }
    if (!win || !win.document.getElementById('ztts-webdav-enable')) throw new Error('pane never became ready');
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;

    if (Zotero.Prefs.get(full('webdav.enabled'), true) === true) {
      toggle.click();
      const t2 = Date.now();
      while (Date.now() - t2 < 5000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    }
    Zotero.Prefs.set(full('webdav.url'), stubUrl, true);
    await sleep(300);
    toggle.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 10000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== true) await sleep(100);
    out.enabledOnStub = Zotero.Prefs.get(full('webdav.enabled'), true) === true;
    out.finalLine = line();

    Zotero.Prefs.set(full('webdav.syncSettings'), true, true);
    Zotero.Prefs.set(full('webdav.autoUploadSettings'), true, true);
    Zotero.Prefs.set(full('webdav.syncPositions'), false, true);
    await sleep(300);

    // Settle the startup sync against the stub (GET shared settings, then a PUT).
    const readLog = async () => { try { return (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean); } catch { return []; } };
    let lines = await readLog();
    let quietFor = 0;
    const t3 = Date.now();
    while (Date.now() - t3 < 20000) {
      await sleep(1000);
      const now = await readLog();
      if (now.length === lines.length) quietFor += 1000; else { quietFor = 0; lines = now; }
      if (quietFor >= 4000) break;
    }
    out.settled = lines.slice(-6).map((l) => { const e = JSON.parse(l); return { t: e.t, method: e.method, file: e.path.split('/').pop() }; });
    state.stubLogCount2 = lines.length;
    // The change trigger's pref, read for the disable script.
    state.triggerPref = 'readAloud.speedPercent';
    state.triggerBefore = Zotero.Prefs.get(full('readAloud.speedPercent'), true);
    out.ok = out.enabledOnStub && out.control.mode === 'answer' && lines.length > 0;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
