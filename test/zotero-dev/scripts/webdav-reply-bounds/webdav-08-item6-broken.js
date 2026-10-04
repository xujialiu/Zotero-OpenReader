// Case item 6: a reply that breaks mid-body. The stub's /broken/ writes a
// first fragment, then destroys the socket mid-chunk. Expected: sharedSettings()
// answers at once with an error containing
// `The reply from <stubUrl> broke off:` followed by Gecko's reason. A
// different message is not a FAIL if it is a WebDAVError naming the stub —
// reported verbatim, the case corrected from it. The stub close line is
// recorded but not gated: here the stub destroys the socket itself.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = { item: 6, folder: 'broken', method: 'GET', diagnostic: 'sharedSettings' };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  const urlBefore = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlBeforeIsTestConfig = norm(urlBefore) === norm(rawLine);
  const stubUrl = `http://127.0.0.1:${P.stubPort}/broken/`;
  out.stubUrl = stubUrl;

  try {
    Zotero.Prefs.set('zotero-tts.webdav.url', stubUrl);
    const t0 = Date.now();
    const raw = await Zotero.ZoteroTTS.diagnostics.sharedSettings();
    out.callMs = Date.now() - t0;
    out.error = (JSON.parse(raw) || {}).error ?? null;
  } finally {
    try { Zotero.Prefs.set('zotero-tts.webdav.url', urlBefore); } catch (e) { out.restoreError = String(e); }
  }
  out.urlRestored = Zotero.Prefs.get('zotero-tts.webdav.url') === urlBefore;

  out.errorMatchesExpected = typeof out.error === 'string'
    && out.error.includes(`The reply from ${stubUrl} broke off: `);
  // The case's allowance: a different message is not a FAIL when it is a
  // WebDAVError naming the stub.
  out.errorIsWebDAVErrorNamingStub = typeof out.error === 'string'
    && out.error.startsWith('WebDAVError') && out.error.includes(stubUrl);
  out.notAFail = out.errorMatchesExpected || out.errorIsWebDAVErrorNamingStub;
  out.callMsAtOnce = out.callMs < 2000;

  out.stubClose = await (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          let l; try { l = JSON.parse(lines[i]); } catch (e) { continue; }
          if (l.ev === 'close' && l.path === 'broken/' && l.method === 'GET') return l;
        }
      } catch (e) { /* log not readable yet */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  })();
  return JSON.stringify(out);
})()
