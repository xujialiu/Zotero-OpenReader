// Case item 1: the stream path runs in the plugin sandbox against the test
// WebDAV. sharedSettings() (download) and settingsFiles() (list) must
// answer without a TypeError / getReader / Permission denied error; the
// diagnostic's effective url must be the test configuration (compared with
// the file, match only). No pref is touched here.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = {};
  const timed = async (name, fn) => {
    const t0 = Date.now();
    try {
      const v = await fn();
      return { ms: Date.now() - t0, value: v };
    } catch (e) {
      return { ms: Date.now() - t0, threw: String((e && e.message) || e) };
    }
  };

  // The diagnostic echoes the client's normalized url (a trailing slash is
  // appended), so the file's line is compared in the same normalized form.
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const testUrl = norm((await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim());

  const shared = await timed('sharedSettings', () => Zotero.ZoteroTTS.diagnostics.sharedSettings());
  const files = await timed('settingsFiles', () => Zotero.ZoteroTTS.diagnostics.settingsFiles());

  const sv = shared.value ? JSON.parse(shared.value) : null;
  const fv = files.value ? JSON.parse(files.value) : null;

  out.shared = {
    ms: shared.ms,
    threw: shared.threw ?? null,
    error: sv ? sv.error ?? null : null,
    urlMatchesTestConfig: !!(sv && sv.url === testUrl),
    count: sv && sv.count !== undefined ? sv.count : null,
    items: sv && sv.items ? sv.items : null,
  };
  out.files = {
    ms: files.ms,
    threw: files.threw ?? null,
    error: fv ? fv.error ?? null : null,
    urlMatchesTestConfig: !!(fv && fv.url === testUrl),
    names: fv && fv.files ? fv.files.map((f) => f.name) : null,
    lastModified: fv && fv.files ? fv.files.map((f) => f.lastModified) : null,
  };

  // The stream-reader failure the case calls a FAIL, if present.
  const bad = (s) => s && /TypeError|getReader|Permission denied/.test(s);
  out.streamReaderFailure = [out.shared.error, out.shared.threw, out.files.error, out.files.threw].some(bad);

  out.sharedSettingsName = 'zotero-tts-shared-settings.json';
  out.sharedFileInListing = !!(out.files.names && out.files.names.includes(out.sharedSettingsName));
  return JSON.stringify(out);
})()
