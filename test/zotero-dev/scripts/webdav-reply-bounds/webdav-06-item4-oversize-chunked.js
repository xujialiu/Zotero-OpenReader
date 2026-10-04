// Case item 4: a reply past 10 MiB with no Content-Length. The stub's /big/
// streams spaces without pause up to 64 MiB; readText must stop just past
// the cap and cancel. Expected: sharedSettings() answers well under 15 s
// with an error containing `is larger than 10 MB; no file of ours is that
// big.`, never the stalled one, and the stub logs the GET closed by the
// client before its 64 MiB end, its bytes written at least 10 MiB. This
// proves the stream path: response.text() has no cap and would answer a
// JSON parse error instead.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = { item: 4, folder: 'big', method: 'GET', diagnostic: 'sharedSettings' };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  const urlBefore = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlBeforeIsTestConfig = norm(urlBefore) === norm(rawLine);
  const stubUrl = `http://127.0.0.1:${P.stubPort}/big/`;
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
  out.callMsUnder15s = out.callMs < 15000;

  out.stubClose = await (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          let l; try { l = JSON.parse(lines[i]); } catch (e) { continue; }
          if (l.ev === 'close' && l.path === 'big/' && l.method === 'GET' && (l.how === 'client' || l.how === 'client-fin' || l.how === 'client-reset')) return l;
        }
      } catch (e) { /* log not readable yet */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  })();
  out.bytesAtLeast10MiB = !!(out.stubClose && out.stubClose.bodyBytes >= 10 * 1024 * 1024);
  out.closedBefore64MiB = !!(out.stubClose && out.stubClose.bodyBytes < 64 * 1024 * 1024);
  return JSON.stringify(out);
})()
