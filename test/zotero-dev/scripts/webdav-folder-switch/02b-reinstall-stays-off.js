// Item 2b, after the in-place reinstall: the migration must NOT run again —
// no new "the WebDAV folder is on" line — the switch stays false with no
// user value, and the three diagnostics report folder:false. Proves the
// installed build again by the folder field.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'reinstall-stays-off' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  try {
    out.startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    const debugNow = await Zotero.Debug.get();
    const after = (debugNow.match(/the WebDAV folder is on: its address was already set/g) || []).length;
    out.migrationLines = { beforeReinstall: state.migrationCountAfterUpgrade ?? 1, after, newLines: after - (state.migrationCountAfterUpgrade ?? 1) };
    out.enabled = {
      value: Zotero.Prefs.get(full('webdav.enabled'), true),
      hasUser: Zotero.Prefs.prefHasUserValue(full('webdav.enabled'), true),
    };
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.folder = { positionSync: pos.folder, settingsUpload: up.folder, settingsSync: sy.folder };
    out.ok = out.migrationLines.newLines === 0 && out.enabled.value === false && out.enabled.hasUser === false
      && out.folder.positionSync === false && out.folder.settingsUpload === false && out.folder.settingsSync === false;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
