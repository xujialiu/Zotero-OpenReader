// Item 1 (issue #219), cleanup: confirms the new build's retries have settled
// in the stub log, then restores the isolation — the two switches off, the
// test URL back, confirmed. The folder switch stays as the item left it
// (on); the harness's per-item restore treats on-with-test-URL as isolated.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'shutdown-cleanup' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  try {
    const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean);
    const fresh = lines.slice(state.stubLogCount ?? 0).map((l) => JSON.parse(l));
    out.entriesSinceHang = fresh.length;
    out.lastEntry = fresh.length ? { iso: fresh[fresh.length - 1].iso, method: fresh[fresh.length - 1].method, file: fresh[fresh.length - 1].path.split('/').pop() } : null;
    const now = Date.now();
    out.msSinceLast = fresh.length ? now - fresh[fresh.length - 1].t : null;

    Zotero.Prefs.set(full('webdav.syncPositions'), false, true);
    Zotero.Prefs.set(full('webdav.syncSettings'), false, true);
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await new Promise((r) => setTimeout(r, 300));
    out.switchesOff = Zotero.Prefs.get(full('webdav.syncPositions'), true) === false
      && Zotero.Prefs.get(full('webdav.syncSettings'), true) === false;
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.switchesOff && out.urlBack && out.msSinceLast !== null && out.msSinceLast > 20000;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
