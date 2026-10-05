// Item 2a: set the folder's switch to false (the Disable path's write) and
// read the Gecko fact the design relies on: a user value equal to the
// default is dropped, so prefHasUserValue answers false. Every read/write
// through the FULL pref name. Also fixes 01's broken value reads: the
// enabled and enabledMigrated VALUES with their user-value state.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'disable-and-gecko' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  try {
    out.before = {
      enabled: Zotero.Prefs.get(full('webdav.enabled'), true),
      enabledMigrated: Zotero.Prefs.get(full('webdav.enabledMigrated'), true),
      enabledHasUser: Zotero.Prefs.prefHasUserValue(full('webdav.enabled'), true),
    };
    // The Disable path's exact write (ui/webdav-rows.ts: prefs.set(WEBDAV_ENABLED_PREF, false)).
    Zotero.Prefs.set(full('webdav.enabled'), false, true);
    out.after = {
      value: Zotero.Prefs.get(full('webdav.enabled'), true),
      hasUser: Zotero.Prefs.prefHasUserValue(full('webdav.enabled'), true),
      migrated: Zotero.Prefs.get(full('webdav.enabledMigrated'), true),
    };
    state.migrationCountAfterUpgrade = ((await Zotero.Debug.get()).match(/the WebDAV folder is on: its address was already set/g) || []).length;
    out.migrationCountAfterUpgrade = state.migrationCountAfterUpgrade;
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.folder = { positionSync: pos.folder, settingsUpload: up.folder, settingsSync: sy.folder };
    out.ok = out.after.value === false && out.after.hasUser === false && out.folder.positionSync === false;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
