// Item 1 (issue #219), the measure, run ~25 s after the in-place reinstall:
// reads the stub log from the recorded offset and times the shutdown's three
// GETs (zotero-tts-shared-settings.json, zotero-tts-positions.json,
// xujialiu-positions.json) and the new build's first request after them.
// Expected: the three GETs within about a second of each other; the new
// build's first request 8 to 10 s after the first GET. Also reads the error
// console for the three `timed out at shutdown` errors. Leaves the stub in
// answer mode so the new build's hung startup requests can settle.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'shutdown-measure' };
  try {
    const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean);
    const fresh = lines.slice(state.stubLogCount ?? 0).map((l) => JSON.parse(l));
    out.entriesAfterHang = fresh.map((e) => ({ t: e.t, iso: e.iso, method: e.method, file: e.path.split('/').pop() }));

    const shutdownFiles = ['zotero-tts-shared-settings.json', 'zotero-tts-positions.json', 'xujialiu-positions.json'];
    const gets = fresh.filter((e) => e.method === 'GET' && shutdownFiles.includes(e.path.split('/').pop()));
    out.shutdownGets = gets.map((e) => ({ t: e.t, file: e.path.split('/').pop() }));
    // The shutdown's three GETs are the first cluster (within ~1.5 s of the
    // first); the new build's first request is the next one after that gap.
    if (gets.length >= 3) {
      const first = gets[0].t;
      const shutdown = gets.filter((e) => e.t <= first + 1500);
      const later = gets.filter((e) => e.t > first + 1500);
      out.shutdownCluster = shutdown.map((e) => ({ t: e.t, file: e.path.split('/').pop() }));
      if (shutdown.length === 3) {
        const ts = shutdown.map((e) => e.t).sort((a, b) => a - b);
        out.firstGetAt = ts[0];
        out.spreadMs = ts[2] - ts[0];
        out.newBuildFirst = later.length ? { t: later[0].t, method: later[0].method, file: later[0].path.split('/').pop() } : null;
        out.gapMs = out.newBuildFirst ? out.newBuildFirst.t - ts[0] : null;
      } else { out.shutdownClusterSize = shutdown.length; }
    }

    // The three `timed out at shutdown` errors, from Zotero's console.
    const msgs = Services.console.getMessageArray().map((m) => String(m.message ?? ''));
    out.timeoutErrors = msgs.filter((m) => /timed out at shutdown/.test(m) && /zotero-tts/.test(m));
    out.errorRing = (Zotero.getErrors() ?? []).filter((e) => /timed out at shutdown/.test(e));

    // Answer mode again, so the new build's hung startup requests settle.
    try {
      const req = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=answer`, { timeout: 3000 });
      out.controlBack = JSON.parse(req.responseText).mode;
    } catch (e) { out.controlBackError = String(e); }
    out.ok = gets.length >= 3 && out.spreadMs !== undefined && out.spreadMs <= 1500 && out.gapMs !== null && out.gapMs >= 7500 && out.gapMs <= 11000
      && out.timeoutErrors.length >= 3;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
