// Case item 5: a declared Content-Length past the cap. The stub's /declared/
// answers 200 with Content-Length: 10485761 and nothing else. readText must
// refuse it unread. Expected: sharedSettings() answers in under 2 s with the
// same `is larger than 10 MB` error, never the stalled one, and the stub
// logs the connection closed by the client.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = { item: 5, folder: 'declared', method: 'GET', diagnostic: 'sharedSettings' };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  const urlBefore = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlBeforeIsTestConfig = norm(urlBefore) === norm(rawLine);
  const stubUrl = `http://127.0.0.1:${P.stubPort}/declared/`;
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
    && out.error.includes(`The reply from ${stubUrl} is larger than 10 MB; no file of ours is that big.`);
  out.neverStalled = !(typeof out.error === 'string' && out.error.includes('stalled'));
  out.callMsUnder2s = out.callMs < 2000;

  out.stubClose = await (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          let l; try { l = JSON.parse(lines[i]); } catch (e) { continue; }
          if (l.ev === 'close' && l.path === 'declared/' && l.method === 'GET' && (l.how === 'client' || l.how === 'client-fin' || l.how === 'client-reset')) return l;
        }
      } catch (e) { /* log not readable yet */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  })();
  return JSON.stringify(out);
})()
