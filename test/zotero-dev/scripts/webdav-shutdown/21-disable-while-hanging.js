// Item 2 (issue #220), the disable: hang mode, one settings pref changed
// (the auto-upload's quiet period starts), and within 5 s the plugin is
// disabled through AddonManager — no new build starts, so every later
// request is the old one's. Then waits ~16 s (the shutdown's 8 s bound plus
// the client's 15 s request timeout) and reads the log segment: the
// shutdown's GET (settings sync) and PUT (auto-upload) at the disable, and
// whatever came after. The 3-minute quiet proof is the harness's sleep and
// the 22 script. Params: stubPort, stubLog.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'disable-while-hanging' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const AM = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  try {
    // Hang mode.
    const ctl = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=hang`, { timeout: 3000 });
    out.control = JSON.parse(ctl.responseText);

    // One settings pref, changed (an unchanged value notifies no observer,
    // so the new value is computed from the pref's CURRENT value).
    const before = Zotero.Prefs.get(full(state.triggerPref), true);
    const next = (typeof before === 'number' ? before : 100) + 1;
    Zotero.Prefs.set(full(state.triggerPref), next, true);
    out.changedPref = state.triggerPref;
    out.from = before;
    out.to = next;
    state.triggerPlanted = next;
    out.changedAt = Date.now();

    // Within 5 s of the change: disable the plugin through AddonManager.
    const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
    out.addonFound = !!addon;
    out.disableAt = Date.now();
    out.withinMsOfChange = out.disableAt - out.changedAt;
    await addon.disable();
    out.disableReturnedAt = Date.now();
    const me = await AM.getAddonByID('zotero-tts@xujialiu.top');
    out.addonDisabled = me ? me.userDisabled : null;

    // ~16 s for the shutdown's requests to be logged, then the segment.
    await sleep(16000);
    const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean);
    const fresh = lines.slice(state.stubLogCount2 ?? 0).map((l) => JSON.parse(l));
    out.segment = fresh.map((e) => ({ t: e.t, iso: e.iso, method: e.method, file: e.path.split('/').pop() }));
    state.stubLogCount3 = lines.length;
    out.ok = out.addonDisabled === true && out.withinMsOfChange < 5000 && fresh.length >= 2;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
