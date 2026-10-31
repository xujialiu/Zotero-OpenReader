// WebDAV first (this is not a WebDAV test): snapshot the folder switch (value and
// whether it had a user value), let any transport in flight settle, turn the
// folder off, and confirm positionSync().folder === false before an install or
// any functional check. The first snapshot is never replaced on a resumed run.
// params: none. state: writes webdav.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'webdav-off' };
  const full = 'extensions.zotero.zotero-tts.webdav.enabled';
  if (!state.webdav) {
    state.webdav = {
      type: Services.prefs.getPrefType(full), // 0 = not registered at all
      value: Services.prefs.getBoolPref(full, false),
      user: Services.prefs.prefHasUserValue(full),
    };
  }
  out.snapshot = state.webdav;

  // Settle: let any transport in flight finish before the switch moves.
  const read = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  let sync = await read();
  out.before = {
    enabled: sync.enabled, folder: sync.folder, configured: sync.configured,
    transportRunning: sync.transport?.running ?? null, sharedRunning: sync.shared?.transport?.running ?? null,
  };
  for (let i = 0; i < 20 && (sync.transport?.running || sync.shared?.transport?.running); i++) {
    await Zotero.Promise.delay(500);
    sync = await read();
  }
  out.settled = { transportRunning: sync.transport?.running ?? null, sharedRunning: sync.shared?.transport?.running ?? null };

  Services.prefs.setBoolPref(full, false);
  const after = await read();
  out.after = { folder: after.folder, enabled: after.enabled };
  out.nowPref = { value: Services.prefs.getBoolPref(full, false), user: Services.prefs.prefHasUserValue(full) };
  out.ok = after.folder === false;
  return JSON.stringify(out, null, 1);
})()
