// Case item 2: a download that stalls mid-reply. The URL pref detours to the
// stub's /stall/ for one sharedSettings() call and is restored to its
// snapshot value in a finally (the automatic syncs are off — webdav-02).
// Expected: an answer in 15–17 s whose error contains
// `The reply from <stubUrl> stalled: nothing arrived for 15 s.`, and the
// stub logging the GET closed by the client within about a second of it.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = { item: 2, folder: 'stall', method: 'GET', diagnostic: 'sharedSettings' };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  const urlBefore = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlBeforeIsTestConfig = norm(urlBefore) === norm(rawLine);
  const stubUrl = `http://127.0.0.1:${P.stubPort}/stall/`;
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
    && out.error.includes(`The reply from ${stubUrl} stalled: nothing arrived for 15 s.`);
  out.callMsIn15to17s = out.callMs >= 15000 && out.callMs <= 17000;

  // The stub's close line for this GET: poll the log, bounded.
  out.stubClose = await (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          let l; try { l = JSON.parse(lines[i]); } catch (e) { continue; }
          if (l.ev === 'close' && l.path === 'stall/' && l.method === 'GET' && (l.how === 'client' || l.how === 'client-fin' || l.how === 'client-reset')) return l;
        }
      } catch (e) { /* log not readable yet */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  })();
  out.closeWithinAbout1sOfAnswer = !!(out.stubClose
    && Math.abs((out.stubClose.msAfterRequest ?? 0) - (out.callMs ?? 0)) <= 1000);
  return JSON.stringify(out);
})()
