(async () => {
  // Issue #226, item 17, pass 2: Requests at once 1. The engine reads prefetchOf
  // at every session start, so the fresh fixtures of 226-20..22 pick it up.
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const S = Zotero.ZoteroTTS.diagnostics;
  const base = Zotero.__ztts226;
  const out = { status: 'FAIL', errors: [] };
  const name = prefix + 'readAloud.prefetchRequests';
  const before = { value: p.getIntPref(name), user: p.prefHasUserValue(name) };
  p.setIntPref(name, 1);
  const after = JSON.parse(await S.positionSync());
  out.requests = { before, now: p.getIntPref(name) };
  out.folder = { folder: after.folder, enabled: after.enabled };
  if (Zotero.ZoteroTTSRun?.state) Zotero.ZoteroTTSRun.state.requests226 = 1;
  out.status = out.requests.now === 1 && after.folder === false ? 'PASS' : 'FAIL';
  return JSON.stringify(out, null, 1);
})()
