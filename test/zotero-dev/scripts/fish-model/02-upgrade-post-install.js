// Item 1c.2, after the in-place install over 1.16.10 with fish.freeOnly false and fish.model unset:
// startup() reports the new build with every step ok (the new step 'Fish Audio model' among them),
// fish.model reads s2.1-pro, fish.freeOnly holds no user value (asked three ways, and the case's own
// wording as the vacuous control), the debug store holds the migration's line exactly once, and the
// WebDAV folder is still off ("folder": false, again after the install).
// params: none (expectedVersion defaults to 1.16.11-beta). state: writes upgradeAfter.
(async () => {
  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params || {};
  const expectedVersion = params.expectedVersion || '1.16.11-beta';
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const typeName = t => t === p.PREF_BOOL ? 'bool' : t === p.PREF_INT ? 'int' : t === p.PREF_STRING ? 'string' : 'unset';
  const d = await waitFor(() => {
    const x = Zotero.ZoteroTTS?.diagnostics;
    if (!x) return null;
    try { const s = JSON.parse(x.startup()); return s.version === expectedVersion && Array.isArray(s.steps) && s.steps.length ? x : null; } catch (_) { return null; }
  });
  if (!d) throw new Error('the new build never reported its startup (expected ' + expectedVersion + ')');
  const startup = JSON.parse(d.startup());
  const steps = startup.steps.map(s => ({ name: s.name, ok: s.ok }));
  const modelStep = steps.findIndex(s => s.name === 'Fish Audio model');

  const modelKey = prefix + 'fish.model', freeKey = prefix + 'fish.freeOnly';
  const line = 'Fish Audio reads with s2.1-pro: the free-model switch was off';
  const store = String(await Zotero.Debug.get());
  const migrationLines = store.split('\n').filter(l => l.includes(line));
  const pluginLines = store.split('\n').filter(l => l.includes('[zotero-tts]'));
  const positionSync = JSON.parse(await d.positionSync());
  const settingsUpload = JSON.parse(await d.settingsUpload());
  const settingsSync = JSON.parse(await d.settingsSync());
  const out = {
    status: 'PASS', phase: '1c.2 after the install',
    build: startup.version, failed: startup.failed, stepCount: startup.steps.length, allOk: steps.every(s => s.ok), fishModelStep: { present: modelStep >= 0, index: modelStep, ok: modelStep >= 0 ? steps[modelStep].ok : null },
    model: { value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, type: typeName(p.getPrefType(modelKey)), hasUser: p.prefHasUserValue(modelKey) },
    freeOnly: {
      servicesHasUser: p.prefHasUserValue(freeKey), relativeNameAlone: Zotero.Prefs.prefHasUserValue('zotero-tts.fish.freeOnly'),
      fullNameWithTrue: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.fish.freeOnly', true),
      caseWording_relativeNameWithTrue: Zotero.Prefs.prefHasUserValue('zotero-tts.fish.freeOnly', true),
      type: typeName(p.getPrefType(freeKey)), value: p.getPrefType(freeKey) === p.PREF_BOOL ? p.getBoolPref(freeKey) : null,
    },
    migrationLine: { count: migrationLines.length, line: migrationLines[0] ? migrationLines[0].slice(0, 200) : null },
    pluginLineCount: pluginLines.length, pluginLinesHead: pluginLines.slice(0, 4).map(l => l.slice(0, 160)), debugStoreLines: Zotero.Debug.count(),
    folder: { positionSync: positionSync.folder, settingsUpload: settingsUpload.folder, settingsSync: settingsSync.folder },
  };
  state.upgradeAfter = out;
  if (out.failed.length || !out.allOk) out.status = 'FAIL: startup step failed';
  return JSON.stringify(out, null, 1);
})()
