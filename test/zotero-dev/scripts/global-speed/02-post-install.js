// Issue #82 item 1, second half — right after the in-place install of 1.16.3-beta.
// Proves the build by its new diagnostic fields, checks the migration copied the
// recorded speed, that the copy carries no sync stamp, and that a sync pushes no
// readAloud.speedPercent item into the shared file.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state;
  const K = n => prefix + n;
  const out = { status: 'FAIL' };
  let prefWin = null;

  try {
    // The synchronous startup report: every step ok, the new step present
    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.startup = { version: startup.version, failed: startup.failed, steps: startup.steps, hasGlobalSpeedStep: Array.isArray(startup.steps) && startup.steps.includes('global speed') };
    if (startup.failed?.length) throw new Error('startup has failed steps: ' + JSON.stringify(startup.failed));

    // The mechanism diagnostic: the new fields must exist and carry the migration
    const mem = JSON.parse(Zotero.ZoteroTTS.diagnostics.readAloudMemory());
    const expectedPercent = state.expectedSpeedPercent;
    out.migration = {
      hasSpeedPercentField: 'speedPercent' in mem,
      hasSpeedMigratedField: 'speedMigrated' in mem,
      speedMigrated: mem.speedMigrated,
      speedPercent: mem.speedPercent,
      expectedSpeedPercent: expectedPercent,
      memorySpeed: mem.memory?.speed ?? null,
      expectedMemorySpeed: state.oldSpeed,
      memoryJsonSpeedFieldStill: (() => { try { return JSON.parse(String(p.getStringPref(K('readAloud.memory')))).speed ?? null; } catch (e) { return 'unreadable'; } })(),
    };
    if (!out.migration.hasSpeedPercentField || !out.migration.hasSpeedMigratedField) throw new Error('the new diagnostic fields are missing — wrong build?');
    if (mem.speedMigrated !== true) throw new Error('speedMigrated is not true');
    if (mem.speedPercent !== expectedPercent) throw new Error('speedPercent ' + JSON.stringify(mem.speedPercent) + ' != expected ' + JSON.stringify(expectedPercent));
    if (mem.memory?.speed !== state.oldSpeed) throw new Error('memory.speed ' + JSON.stringify(mem.memory?.speed) + ' != recorded ' + JSON.stringify(state.oldSpeed));

    // The copy must not be a sync stamp
    const syncBefore = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.stampsBefore = {
      count: syncBefore.state?.stamps,
      hasSpeedPercent: (syncBefore.state?.stamped ?? []).includes('readAloud.speedPercent'),
    };
    if (out.stampsBefore.hasSpeedPercent) throw new Error('the migration stamped readAloud.speedPercent');

    // Trigger a sync the way the case says: open the settings pane
    prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (!prefWin) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !prefWin; i++) { await sleep(100); prefWin = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!prefWin) throw new Error('settings window did not open');
    try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    const paneReady = await waitFor(() => prefWin.document.getElementById('ztts-voices-status'), 10000, 100);
    if (!paneReady) throw new Error('the plugin pane did not load');

    const synced = await waitFor(async () => {
      try {
        const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        return d.transport?.running === false && d.transport?.lastTrigger === 'pane-open' && d.transport?.lastAt > (Date.now() - 60000) ? d : null;
      } catch (e) { return null; }
    }, 20000, 200);
    out.paneOpenSync = synced ? {
      trigger: synced.transport?.lastTrigger, outcome: synced.transport?.lastOutcome,
      pushed: synced.transport?.pushed, uploaded: synced.transport?.uploaded,
      adopted: synced.transport?.adopted,
    } : 'no pane-open sync observed';

    // The shared file as the machine reads it: no readAloud.speedPercent item
    const shared = JSON.parse(await Zotero.ZoteroTTS.diagnostics.sharedSettings());
    out.shared = {
      error: shared.error ?? null, count: shared.count,
      speedPercentItem: (shared.items ?? []).filter(i => i.key === 'readAloud.speedPercent'),
      readAloudKeys: (shared.items ?? []).map(i => i.key).filter(k => k.startsWith('readAloud.')),
    };
    if (out.shared.speedPercentItem.length) throw new Error('the shared file gained a readAloud.speedPercent item');

    // And the stamps still hold none after the sync
    const syncAfter = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
    out.stampsAfter = {
      count: syncAfter.state?.stamps,
      hasSpeedPercent: (syncAfter.state?.stamped ?? []).includes('readAloud.speedPercent'),
    };
    if (out.stampsAfter.hasSpeedPercent) throw new Error('a stamp for readAloud.speedPercent appeared');

    // Close the pane; it is reopened by later scripts
    try { prefWin.close(); } catch (e) {}
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000, 100);
    prefWin = null;

    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (prefWin) prefWin.close(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
