// Item 1: the upgrade turns the folder on, once. Startup diagnostic first,
// then the migration debug line (exactly one new), the two prefs, and
// folder:true in all three diagnostics. Also proves the build: the folder
// field the diagnostics did not have before 1.16.7.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'upgrade-migration' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  try {
    // startup() is synchronous and returns the JSON string itself.
    out.startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());

    const debugNow = await Zotero.Debug.get();
    const after = (debugNow.match(/the WebDAV folder is on: its address was already set/g) || []).length;
    out.migrationLines = { before: state.migrationLineCountBefore ?? 0, after, newLines: after - (state.migrationLineCountBefore ?? 0) };

    out.prefs = {
      enabled: { value: Zotero.Prefs.get('extensions.zotero.zotero-tts.webdav.enabled', true), hasUser: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled', true) },
      enabledMigrated: { value: Zotero.Prefs.get('extensions.zotero.zotero-tts.webdav.enabledMigrated', true), hasUser: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabledMigrated', true) },
    };

    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const sy = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.diagnostics = {
      positionSync: { folder: pos.folder, enabled: pos.enabled, configured: pos.configured },
      settingsUpload: { folder: up.folder, enabled: up.enabled, configured: up.configured },
      settingsSync: { folder: sy.folder, enabled: sy.enabled, configured: sy.configured },
    };

    // Isolation held through the upgrade: switches still suspended, test URL still effective.
    out.isolation = {
      syncPositions: Zotero.Prefs.get('zotero-tts.webdav.syncPositions', true),
      syncSettings: Zotero.Prefs.get('zotero-tts.webdav.syncSettings', true),
      autoUploadSettings: Zotero.Prefs.get('zotero-tts.webdav.autoUploadSettings', true),
      urlIsTestUrl: Zotero.Prefs.get('zotero-tts.webdav.url', true) === state.testUrl,
    };
    out.ok = out.startup.failed?.length === 0
      && out.migrationLines.newLines === 1
      && out.prefs.enabled.value === true && out.prefs.enabled.hasUser === true
      && out.prefs.enabledMigrated.value === true && out.prefs.enabledMigrated.hasUser === true
      && out.diagnostics.positionSync.folder === true
      && out.diagnostics.settingsUpload.folder === true
      && out.diagnostics.settingsSync.folder === true;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
