// Item 11 (issue #186, 1.16.12-beta): Enable creates the missing folder.
// URL at state.subfolderUrl (script 08's fresh subfolder, PROPFIND 404),
// folder off: Enable shows `Checking…` then `Connected to <url>.` with no
// warning; the switch goes true and the button reads Disable; the PROPFIND
// Depth 0 now answers 207 and a Depth 1 on the test folder lists the new
// subfolder. Cleanup in the same script: Disable, DELETE that subfolder (the
// run's own and nothing else), confirm 404 again, the test URL back, confirmed.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'enable-creates-folder' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const sub = state.subfolderUrl;
    if (!sub) throw new Error('no state.subfolderUrl; run 08 first');
    const base = String(state.testUrl).replace(/\/+$/, '') + '/';
    out.subfolderUrl = sub;

    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win || !win.document.getElementById('ztts-webdav-enable')) throw new Error('settings window closed');
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;
    out.folderOffAtStart = Zotero.Prefs.get(full('webdav.enabled'), true) === false;

    Zotero.Prefs.set(full('webdav.url'), sub, true);
    await sleep(300);

    const auth = () => {
      const u = Zotero.Prefs.get(full('webdav.username'), true) || '';
      const p = Zotero.Prefs.get(full('webdav.password'), true) || '';
      return 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p)));
    };
    const propfind = async (url, depth) => {
      const req = await Zotero.HTTP.request('PROPFIND', url, { headers: { Depth: depth, Authorization: auth() }, responseType: 'text', successCodes: false });
      return { status: req.status, text: String(req.responseText ?? '') };
    };

    // Enable: 25 ms poll to catch `Checking…`.
    const snap = () => ({ t: Date.now() % 100000, label: toggle.getAttribute('label'), line: line(), enabled: Zotero.Prefs.get(full('webdav.enabled'), true) });
    const trace = [snap()];
    toggle.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await sleep(25);
      const s = snap();
      const last = trace[trace.length - 1];
      if (s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.enabled === true || (s.line && /failed|Checking/.test(s.line) === false && s.line !== '')) break;
      if (s.enabled === true) break;
    }
    out.trace = trace;
    out.final = snap();
    out.lineExact = out.final.line === `Connected to ${sub}.`;
    out.noWarning = !/Warning: http:\/\//.test(out.final.line ?? '');

    const after = await propfind(sub, '0');
    out.propfindAfterEnable = after.status; // expect 207
    const listing = await propfind(base, '1');
    out.listStatus = listing.status; // expect 207
    out.listingHasSubfolder = decodeURIComponent(listing.text).includes(sub.replace(/\/$/, '').split('/').pop());

    // Cleanup: Disable, DELETE the subfolder (only it), confirm 404, test URL back.
    toggle.click();
    const t1 = Date.now();
    while (Date.now() - t1 < 5000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    out.disabledAgain = Zotero.Prefs.get(full('webdav.enabled'), true) === false;
    out.lineEmptied = line() === '';
    const del = await Zotero.HTTP.request('DELETE', sub, { headers: { Authorization: auth() }, successCodes: false });
    out.deleteStatus = del.status; // 204 or 200
    out.propfindAfterDelete = (await propfind(sub, '0')).status; // expect 404
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(200);
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.folderOffAtStart && out.final.enabled === true && out.final.label === 'Disable'
      && out.lineExact && out.noWarning && out.propfindAfterEnable === 207
      && out.listStatus === 207 && out.listingHasSubfolder
      && out.disabledAgain && out.lineEmptied && out.propfindAfterDelete === 404 && out.urlBack;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
