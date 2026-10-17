// Item 2 (issue #220), re-enable and cleanup: the stub back in answer mode,
// the plugin enabled again through AddonManager, `diagnostics.startup()`
// reporting every step started; then the isolation restored — the two
// switches off, the test URL back, confirmed, and the change-trigger pref
// put back. Params: stubPort, stubLog.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'reenable' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const AM = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  try {
    const ctl = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=answer`, { timeout: 3000 });
    out.control = JSON.parse(ctl.responseText);

    const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
    await addon.enable();
    const me = await AM.getAddonByID('zotero-tts@xujialiu.top');
    out.addonEnabled = me ? !me.userDisabled : null;
    // The startup runs as the addon flips active; give it a beat.
    const t0 = Date.now();
    while (Date.now() - t0 < 10000 && typeof Zotero.ZoteroTTS === 'undefined') await sleep(200);
    await sleep(2500);
    const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.startupVersion = s.version;
    out.stepsOk = s.steps.filter((x) => x.ok).length;
    out.stepsTotal = s.steps.length;
    out.failed = s.failed;

    // The trigger pref back (the value the change planted, undone).
    const before = state.triggerBefore;
    if (before === undefined || before === null) {
      Services.prefs.clearUserPref(full(state.triggerPref));
      out.triggerCleared = !Services.prefs.prefHasUserValue(full(state.triggerPref));
    } else {
      Zotero.Prefs.set(full(state.triggerPref), before, true);
      out.triggerRestored = Zotero.Prefs.get(full(state.triggerPref), true) === before;
    }

    // The isolation: switches off, the test URL back, confirmed. The folder
    // switch is off at this point (a fresh enable does not survive disable),
    // matching the isolated on/off state only in that nothing can sync; the
    // harness's end-of-run restore has the exact snapshot.
    Zotero.Prefs.set(full('webdav.syncSettings'), false, true);
    Zotero.Prefs.set(full('webdav.autoUploadSettings'), false, true);
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(300);
    out.switchesOff = Zotero.Prefs.get(full('webdav.syncSettings'), true) === false
      && Zotero.Prefs.get(full('webdav.autoUploadSettings'), true) === false;
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.folderEnabledNow = Zotero.Prefs.get(full('webdav.enabled'), true);
    out.ok = out.addonEnabled === true && out.stepsOk === out.stepsTotal && out.failed.length === 0
      && out.switchesOff && out.urlBack;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
