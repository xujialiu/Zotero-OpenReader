// Test-WebDAV isolation (test/zotero-dev/baseline.md, "Test WebDAV first";
// run right after webdav-01-baseline.js, before any install or check).
// Reads the test configuration file (its contents are never returned),
// suspends the three automatic syncs, settles the transports, switches the
// WebDAV destination to the test configuration where it differs, and
// confirms the effective destination matches — the match only, never the
// values.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const out = {};
  const step = (name, fn) => {
    try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. The test configuration: first line, an http(s) URL. Never printed.
  const raw = await IOUtils.readUTF8(P.secretsFile);
  const testUrl = raw.trim().split(/\r?\n/)[0].trim();
  out.testFileShape = /^https?:\/\/\S+$/.test(testUrl) ? 'single-http-url' : 'unexpected-shape';

  // 2. Transport stats before suspension (pending work settles below).
  const stats = (name) => step(name, () => JSON.parse(Zotero.ZoteroTTS.diagnostics[name]()));
  const brief = (s) => ({
    enabled: s.enabled,
    autoUpload: s.autoUpload ? { pending: s.autoUpload.pending, count: s.autoUpload.count, lastError: s.autoUpload.lastError ?? null } : undefined,
    transport: s.transport && typeof s.transport === 'object' ? { inFlight: s.transport.inFlight, pending: s.transport.pending, lastError: s.transport.lastError ?? null } : s.transport,
  });
  out.positionSyncBefore = brief(stats('positionSync'));
  out.settingsUploadBefore = brief(stats('settingsUpload'));

  // 3. Suspend the three automatic syncs (the baseline snapshot holds the
  // original values for cleanup).
  const state = Zotero.ZoteroTTSRun.state;
  out.suspended = {
    syncPositions: state.prefs.syncPositions,
    autoUploadSettings: state.prefs.autoUploadSettings,
    syncSettings: state.prefs.syncSettings,
  };
  Zotero.Prefs.set('zotero-tts.webdav.syncPositions', false);
  Zotero.Prefs.set('zotero-tts.webdav.autoUploadSettings', false);
  Zotero.Prefs.set('zotero-tts.webdav.syncSettings', false);

  // 4. Settle: give an in-flight run a bounded moment, then read again.
  await sleep(2000);
  out.positionSyncAfter = brief(stats('positionSync'));
  out.settingsUploadAfter = brief(stats('settingsUpload'));

  // 5. Switch the destination to the test configuration where it differs,
  // and confirm the effective destination matches the file.
  const currentUrl = Zotero.Prefs.get('zotero-tts.webdav.url');
  out.urlAlreadyTestConfig = currentUrl === testUrl;
  if (!out.urlAlreadyTestConfig) Zotero.Prefs.set('zotero-tts.webdav.url', testUrl);
  out.effectiveDestinationMatchesFile = Zotero.Prefs.get('zotero-tts.webdav.url') === testUrl;

  out.isolationConfirmed = out.effectiveDestinationMatchesFile === true;
  return JSON.stringify(out);
})()
