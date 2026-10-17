// Item 12 (issue #186, 1.16.12-beta): a missing parent is refused and nothing
// is created. URL at the test folder plus `missing-186-<slug>/child/`, both
// absent (PROPFIND 404 on each first): Enable ends in `Connection failed: The
// folder <url> cannot be created: the folder above it does not exist. Check
// the address.` (a server answering MKCOL on a missing parent with a status
// other than 409 shows `Creating the folder <url> failed: HTTP <status>.`
// instead — that is a finding about the server, not the build, so long as
// nothing was created and the folder stayed off); the switch stays false; the
// parent still answers 404. The test URL back, confirmed.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'missing-parent-refused' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const base = String(state.testUrl).replace(/\/+$/, '');
    const slug = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
    const parent = base + '/missing-186-' + slug + '/';
    const child = parent + 'child/';
    out.parentUrl = parent;
    out.childUrl = child;

    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win || !win.document.getElementById('ztts-webdav-enable')) throw new Error('settings window closed');
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;
    out.folderOffAtStart = Zotero.Prefs.get(full('webdav.enabled'), true) === false;

    const auth = () => {
      const u = Zotero.Prefs.get(full('webdav.username'), true) || '';
      const p = Zotero.Prefs.get(full('webdav.password'), true) || '';
      return 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p)));
    };
    const propfind = async (url) => {
      const req = await Zotero.HTTP.request('PROPFIND', url, { headers: { Depth: '0', Authorization: auth() }, responseType: 'text', successCodes: false });
      return req.status;
    };
    out.parent404Before = (await propfind(parent)) === 404;
    out.child404Before = (await propfind(child)) === 404;

    Zotero.Prefs.set(full('webdav.url'), child, true);
    await sleep(300);

    const snap = () => ({ t: Date.now() % 100000, label: toggle.getAttribute('label'), line: line(), enabled: Zotero.Prefs.get(full('webdav.enabled'), true) });
    const trace = [snap()];
    toggle.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await sleep(25);
      const s = snap();
      const last = trace[trace.length - 1];
      if (s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.line && s.line !== trace[0].line && !/Checking|Testing/.test(s.line ?? '')) break;
    }
    out.trace = trace;
    out.finalLine = line();
    const refused = `Connection failed: The folder ${child} cannot be created: the folder above it does not exist. Check the address.`;
    const mk = /Connection failed: Creating the folder (.+) failed: HTTP (\d+)\./.exec(out.finalLine ?? '');
    out.lineIsRefusal = out.finalLine === refused;
    out.otherMkcolStatus = mk ? Number(mk[2]) : null; // non-409 server answer, if so
    out.enabledAfter = Zotero.Prefs.get(full('webdav.enabled'), true);
    out.parentStill404 = (await propfind(parent)) === 404;

    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(200);
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.folderOffAtStart && out.parent404Before && out.child404Before
      && (out.lineIsRefusal || (out.otherMkcolStatus !== null && out.otherMkcolStatus !== 409))
      && out.enabledAfter === false && out.parentStill404 && out.urlBack;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
