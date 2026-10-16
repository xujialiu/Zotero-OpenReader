// The check straight after an in-place install (item 1c.2's repeat result, and the install step of any
// re-check): every startup step ok, fish.model still holds no user value and reads the default
// s2.1-pro-free (the migration found no Off to convert), the free switch holds none either, and the
// migration's line was not logged again. The WebDAV folder must still be off (an upgrade may turn it on):
// "folder": false in diagnostics.positionSync(), settingsUpload and settingsSync. Runs after 03 (then the
// migration line count is compared with 03's) or alone, after 00 (then the count is only reported).
// params: expectedVersion (default 1.16.11-beta). state: reads repeatBefore (optional); writes repeatAfter.
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
  if (!d) throw new Error('the installed build never reported its startup as ' + expectedVersion);
  const startup = JSON.parse(d.startup());
  const modelKey = prefix + 'fish.model', freeKey = prefix + 'fish.freeOnly';
  const line = 'Fish Audio reads with s2.1-pro: the free-model switch was off';
  const store = String(await Zotero.Debug.get());
  const positionSync = JSON.parse(await d.positionSync());
  const settingsUpload = JSON.parse(await d.settingsUpload()), settingsSync = JSON.parse(await d.settingsSync());
  const out = {
    status: 'PASS', phase: 'after the in-place install',
    build: startup.version, failed: startup.failed, stepCount: startup.steps.length, allOk: startup.steps.every(s => s.ok),
    model: { hasUser: p.prefHasUserValue(modelKey), value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, type: typeName(p.getPrefType(modelKey)) },
    freeOnlyHasUser: p.prefHasUserValue(freeKey),
    migrationLinesInStore: store.split('\n').filter(l => l.includes(line)).length, migrationLinesBefore: state.repeatBefore?.migrationLinesInStore ?? null,
    folder: positionSync.folder, folderAll: { positionSync: positionSync.folder, settingsUpload: settingsUpload.folder, settingsSync: settingsSync.folder },
  };
  state.repeatAfter = out;
  if (out.failed.length || !out.allOk) out.status = 'FAIL: startup step failed';
  else if (out.folderAll.positionSync !== false || out.folderAll.settingsUpload !== false || out.folderAll.settingsSync !== false) out.status = 'FAIL: the WebDAV folder is on after the install';
  return JSON.stringify(out, null, 1);
})()
