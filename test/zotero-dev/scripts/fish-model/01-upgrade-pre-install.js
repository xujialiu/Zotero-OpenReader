// Item 1c.2, the setup on the PREVIOUS release (1.16.10), before the xpi is installed: the free
// switch off (fish.freeOnly false) and fish.model cleared. Also closes the settings window (an open
// window keeps the OLD pane after a reinstall) and shows why the case's own wording of the user-value
// test cannot work: Zotero.Prefs.prefHasUserValue(name, true) takes the name AS GIVEN, so the relative
// 'zotero-tts.fish.freeOnly' with `true` asks a root key that never exists and is false whatever the
// pref holds; the working forms are the relative name alone or the full name with `true`.
// params: none. state: writes upgradeBefore, settingsWindowAtStart.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 8000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const typeName = t => t === p.PREF_BOOL ? 'bool' : t === p.PREF_INT ? 'int' : t === p.PREF_STRING ? 'string' : 'unset';
  const d = Zotero.ZoteroTTS?.diagnostics;
  const startup = JSON.parse(d.startup());
  if (startup.version !== '1.16.10') throw new Error('not the 1.16.10 release: ' + startup.version);
  if (!state.snap) throw new Error('run 00-baseline-and-isolate.js first');

  // The settings window the owner had open: closed, so the pane is fresh after the install
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  state.settingsWindowAtStart = !!win;
  if (win) { win.close(); await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref')); }

  const freeKey = prefix + 'fish.freeOnly', modelKey = prefix + 'fish.model';
  if (p.prefHasUserValue(modelKey)) p.clearUserPref(modelKey);
  p.setBoolPref(freeKey, false);
  const positionSync = JSON.parse(await d.positionSync());
  const out = {
    status: 'PASS', phase: '1c.2 setup on the previous release',
    build: startup.version,
    settingsWindowClosed: !Services.wm.getMostRecentWindow('zotero:pref'), settingsWindowWasOpen: state.settingsWindowAtStart,
    freeOnly: { value: p.getBoolPref(freeKey), hasUser: p.prefHasUserValue(freeKey) },
    model: { type: typeName(p.getPrefType(modelKey)), hasUser: p.prefHasUserValue(modelKey), relativeGet: Zotero.Prefs.get('zotero-tts.fish.model') ?? null },
    userValueTests: {
      caseWording_relativeNameWithTrue: Zotero.Prefs.prefHasUserValue('zotero-tts.fish.freeOnly', true),
      relativeNameAlone: Zotero.Prefs.prefHasUserValue('zotero-tts.fish.freeOnly'),
      fullNameWithTrue: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.fish.freeOnly', true),
      servicesPrefs: p.prefHasUserValue(freeKey),
    },
    folder: positionSync.folder,
  };
  state.upgradeBefore = out;
  return JSON.stringify(out, null, 1);
})()
