// Item 10 (issue #186, 1.16.12-beta): Test connection on a folder the server
// does not have yet creates nothing. With the folder off, the URL at the test
// folder plus a fresh subfolder: a PROPFIND Depth 0 with the test credentials
// answers 404 first; Test connection ends in `Connection failed: The folder
// <url> does not exist yet. Enable creates it.`; the switch stays false; the
// same PROPFIND still answers 404. The username/password prefs are read only
// inside the auth header and never returned. Leaves the test URL in place.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'test-connection-creates-nothing' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const base = String(state.testUrl || Zotero.Prefs.get(full('webdav.url'), true)).replace(/\/+$/, '');
    const slug = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
    const sub = base + '/zotero-openreader-186-' + slug + '/';
    state.subfolderUrl = sub;
    out.subfolderUrl = sub;

    // The pane, on the plugin pane, folder off (Disable if a previous item left it on).
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win || !win.document.getElementById('ztts-webdav-enable')) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win) { win.close(); const tw = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tw < 3000) await sleep(100); }
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      const t1 = Date.now();
      while (Date.now() - t1 < 8000) {
        await sleep(150);
        win = Services.wm.getMostRecentWindow('zotero:pref');
        if (win && win.Zotero_Preferences) {
          try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch { /* pane may need a beat */ }
          if (win.document.getElementById('ztts-webdav-enable')) break;
        }
      }
    }
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;
    if (Zotero.Prefs.get(full('webdav.enabled'), true) === true) {
      toggle.click();
      const t2 = Date.now();
      while (Date.now() - t2 < 5000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    }
    out.folderOffAtStart = Zotero.Prefs.get(full('webdav.enabled'), true) === false;

    // Point the URL at the fresh subfolder (folder off, so nothing syncs).
    Zotero.Prefs.set(full('webdav.url'), sub, true);
    await sleep(300);

    // PROPFIND Depth 0 with the test credentials, from chrome.
    const auth = () => {
      const u = Zotero.Prefs.get(full('webdav.username'), true) || '';
      const p = Zotero.Prefs.get(full('webdav.password'), true) || '';
      return 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p)));
    };
    const propfind = async (url, depth) => {
      const req = await Zotero.HTTP.request('PROPFIND', url, { headers: { Depth: depth, Authorization: auth() }, responseType: 'text', successCodes: false });
      return { status: req.status, text: String(req.responseText ?? '') };
    };
    out.propfindBefore = (await propfind(sub, '0')).status; // expect 404

    // Test connection: click and poll the line.
    doc.getElementById('ztts-webdav-test').click();
    const trace = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      await sleep(50);
      const l = line();
      if (!trace.length || trace[trace.length - 1].line !== l) trace.push({ t: Date.now() % 100000, line: l });
      if (l && !/Testing/.test(l)) break;
    }
    out.trace = trace;
    out.finalLine = line();
    const expected = `Connection failed: The folder ${sub} does not exist yet. Enable creates it.`;
    out.lineExact = out.finalLine === expected;
    out.enabledAfterTest = Zotero.Prefs.get(full('webdav.enabled'), true);
    out.propfindAfter = (await propfind(sub, '0')).status; // expect 404 again

    // The test URL back, confirmed.
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(200);
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.folderOffAtStart && out.propfindBefore === 404 && out.lineExact
      && out.enabledAfterTest === false && out.propfindAfter === 404 && out.urlBack;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
