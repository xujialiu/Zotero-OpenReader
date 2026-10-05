// Item 7: a passing http:// Enable still goes on. With the folder off and
// the URL at the 127.0.0.1 stub (PROPFIND answered 207, empty
// multistatus), Enable connects and adds the warning, and the folder goes
// on. Then Disable, the test URL back, confirmed. The stub port arrives
// in params.stubPort; the stub is stopped by the harness afterwards.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'plain-http-pass' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document;
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;
    out.folderOffAtStart = Zotero.Prefs.get(full('webdav.enabled'), true) === false;

    const url = `http://127.0.0.1:${P.stubPort}/dav/`;
    Zotero.Prefs.set(full('webdav.url'), url, true);
    await sleep(300);

    // Enable: click and poll finely, to catch 'Checking…'.
    const enableBtn = doc.getElementById('ztts-webdav-enable');
    const snap = () => ({ t: Date.now() % 100000, label: enableBtn.getAttribute('label'), line: line(), enabled: Zotero.Prefs.get(full('webdav.enabled'), true) });
    const trace = [snap()];
    enableBtn.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await sleep(25);
      const s = snap();
      const last = trace[trace.length - 1];
      if (s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.enabled === true || (s.line && /failed/.test(s.line))) break;
    }
    out.trace = trace;
    out.final = snap();
    const warning = 'Warning: http:// is not encrypted, so the password and the settings sent here, API keys included, can be read on the way. Use https:// if the server supports it.';
    out.lineIsConnectedNoSpaceWarning = out.final.line === `Connected to ${url}. ${warning}`;
    out.enabledTrue = out.final.enabled === true;

    // Disable again, and the test URL back.
    enableBtn.click();
    const t1 = Date.now();
    while (Date.now() - t1 < 3000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    out.disabledAgain = Zotero.Prefs.get(full('webdav.enabled'), true) === false;
    out.lineEmptied = line() === '';
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(300);
    out.urlBackMatchesTestFile = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.folderOffAtStart && out.enabledTrue && out.lineIsConnectedNoSpaceWarning
      && out.disabledAgain && out.lineEmptied && out.urlBackMatchesTestFile;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
