// Case item 7: the test configuration is back, and the client works. The URL
// pref is restored to the test configuration where items 2–6 left anything
// else (each of them restores in its own finally; this only confirms, and
// writes only if the match is somehow gone — the automatic syncs are off),
// the effective destinations are confirmed against the test file (the match
// only, never the values), and sharedSettings() / settingsFiles() answer as
// in item 1. The stub itself is stopped outside Zotero, after this script.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = { item: 7 };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  const urlBefore = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlWasTestConfig = urlBefore === rawLine;
  if (!out.urlWasTestConfig) {
    Zotero.Prefs.set('zotero-tts.webdav.url', rawLine);
    out.hadToRewriteUrl = true;
  }
  out.urlMatchesFileRaw = Zotero.Prefs.get('zotero-tts.webdav.url') === rawLine;
  out.urlMatchesFileNormalized = norm(Zotero.Prefs.get('zotero-tts.webdav.url')) === norm(rawLine);

  const timed = async (name, fn) => {
    const t0 = Date.now();
    try { return { ms: Date.now() - t0, value: await fn() }; }
    catch (e) { return { ms: Date.now() - t0, threw: String((e && e.message) || e) }; }
  };

  const shared = await timed('sharedSettings', () => Zotero.ZoteroTTS.diagnostics.sharedSettings());
  const files = await timed('settingsFiles', () => Zotero.ZoteroTTS.diagnostics.settingsFiles());
  const sv = shared.value ? JSON.parse(shared.value) : null;
  const fv = files.value ? JSON.parse(files.value) : null;

  out.shared = {
    ms: shared.ms,
    threw: shared.threw ?? null,
    error: sv ? sv.error ?? null : null,
    urlMatchesTestConfig: !!(sv && sv.url === norm(rawLine)),
    count: sv && sv.count !== undefined ? sv.count : null,
    itemCount: sv && Array.isArray(sv.items) ? sv.items.length : null,
  };
  out.files = {
    ms: files.ms,
    threw: files.threw ?? null,
    error: fv ? fv.error ?? null : null,
    urlMatchesTestConfig: !!(fv && fv.url === norm(rawLine)),
    names: fv && Array.isArray(fv.files) ? fv.files.map((f) => f.name) : null,
  };

  const bad = (s) => s && /TypeError|getReader|Permission denied/.test(s);
  out.streamReaderFailure = [out.shared.error, out.shared.threw, out.files.error, out.files.threw].some(bad);
  out.bothAnsweredClean = !out.shared.error && !out.shared.threw && !out.files.error && !out.files.threw;
  out.sharedFileInListing = !!(out.files.names && out.files.names.includes('zotero-tts-shared-settings.json'));
  return JSON.stringify(out);
})()
