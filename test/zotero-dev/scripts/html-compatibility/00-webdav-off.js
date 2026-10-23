// WebDAV first (this is not a WebDAV test): settle the transports, then turn
// the folder switch off and confirm positionSync().folder === false before an
// install or any functional check. params: none. state: writes webdav.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'webdav-off' };
  const full = 'extensions.zotero.zotero-tts.webdav.enabled';
  state.webdav = {
    value: Services.prefs.getBoolPref(full, false),
    user: Services.prefs.prefHasUserValue(full),
  };
  out.snapshot = state.webdav;

  // Settle: let any transport in flight finish before the switch moves.
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.before = {
    enabled: sync.enabled, folder: sync.folder, configured: sync.configured,
    transportRunning: sync.transport?.running ?? null, sharedRunning: sync.shared?.transport?.running ?? null,
  };
  for (let i = 0; i < 20 && ((sync.transport?.running) || (sync.shared?.transport?.running)); i++) {
    await Zotero.Promise.delay(500);
    const again = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    sync.transport = again.transport; sync.shared = again.shared;
  }
  out.settled = { transportRunning: sync.transport?.running ?? null, sharedRunning: sync.shared?.transport?.running ?? null };

  Services.prefs.setBoolPref(full, false);
  const after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.after = { folder: after.folder, enabled: after.enabled };
  out.ok = after.folder === false;
  return JSON.stringify(out, null, 1);
})()
