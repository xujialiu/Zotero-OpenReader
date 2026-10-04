// Cleanup per the baseline rules: every pref back to the baseline snapshot
// (Zotero.ZoteroTTSRun.state.prefs, the secret among them only as
// set/length), the debug store back to what it was, the automatic syncs back
// to their originals (here: off, their original value, kept off), and the
// transports idle. The window is left minimized — the owner's standing
// exception. The stub is stopped outside Zotero, before this script runs.
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const out = { cleanup: true };
  const step = (name, fn) => { try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; } };
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '') + '/';
  const rawLine = (await IOUtils.readUTF8(P.secretsFile)).trim().split(/\r?\n/)[0].trim();

  // The named prefs back, in snapshot order (the password is never rewritten).
  const prefNames = ['url', 'username', 'syncPositions', 'autoUploadSettings', 'syncSettings'];
  out.restored = {};
  for (const key of prefNames) {
    if (state.prefs && state.prefs[key] !== undefined && state.prefs[key] !== null) {
      step('set:' + key, () => Zotero.Prefs.set('zotero-tts.webdav.' + key, state.prefs[key]));
    }
    out.restored[key] = step('get:' + key, () => Zotero.Prefs.get('zotero-tts.webdav.' + key));
  }
  out.urlMatchesFileRaw = out.restored.url === rawLine;

  // The debug store back to what the baseline found.
  step('debug', () => Zotero.Debug.setStore(!!state.debugWasStoring));
  out.debugStoringNow = step('storing', () => Zotero.Debug.storing);
  out.debugWasStoring = state.debugWasStoring;

  // Syncs suspended-or-original, as the baseline rules require until the
  // state is confirmed clean: the transports idle, nothing pending.
  const brief = (name) => step(name, async () => {
    const s = JSON.parse(await Zotero.ZoteroTTS.diagnostics[name]());
    return {
      enabled: s.enabled,
      inFlight: s.transport && s.transport.inFlight,
      pending: s.transport && s.transport.pending,
      lastError: s.transport ? s.transport.lastError ?? null : undefined,
      autoUploadPending: s.autoUpload ? s.autoUpload.pending : undefined,
    };
  });
  out.positionSync = await brief('positionSync');
  out.settingsUpload = await brief('settingsUpload');

  // The window stays minimized (the owner's exception), recorded.
  out.windowState = step('win', () => (Zotero.getMainWindow() ? Zotero.getMainWindow().windowState : null));
  return JSON.stringify(out);
})()
