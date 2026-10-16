// Item 1c.2, the repeat's result, after the second in-place install: every startup step ok, fish.model
// still holds no user value and reads the default s2.1-pro-free (the migration found no Off to
// convert), the free switch holds none either, and the migration's line was not logged again.
// The WebDAV folder is still off. params: none. state: reads repeatBefore; writes repeatAfter.
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
  if (!state.repeatBefore) throw new Error('run 03-upgrade-repeat-pre-install.js first');
  const d = await waitFor(() => {
    const x = Zotero.ZoteroTTS?.diagnostics;
    if (!x) return null;
    try { const s = JSON.parse(x.startup()); return s.version === expectedVersion && Array.isArray(s.steps) && s.steps.length ? x : null; } catch (_) { return null; }
  });
  if (!d) throw new Error('the reinstalled build never reported its startup');
  const startup = JSON.parse(d.startup());
  const modelKey = prefix + 'fish.model', freeKey = prefix + 'fish.freeOnly';
  const line = 'Fish Audio reads with s2.1-pro: the free-model switch was off';
  const store = String(await Zotero.Debug.get());
  const positionSync = JSON.parse(await d.positionSync());
  const out = {
    status: 'PASS', phase: '1c.2 repeat, after the second install',
    build: startup.version, failed: startup.failed, stepCount: startup.steps.length, allOk: startup.steps.every(s => s.ok),
    model: { hasUser: p.prefHasUserValue(modelKey), value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, type: typeName(p.getPrefType(modelKey)) },
    freeOnlyHasUser: p.prefHasUserValue(freeKey),
    migrationLinesInStore: store.split('\n').filter(l => l.includes(line)).length, migrationLinesBefore: state.repeatBefore.migrationLinesInStore,
    folder: positionSync.folder,
  };
  state.repeatAfter = out;
  if (out.failed.length || !out.allOk) out.status = 'FAIL: startup step failed';
  return JSON.stringify(out, null, 1);
})()
