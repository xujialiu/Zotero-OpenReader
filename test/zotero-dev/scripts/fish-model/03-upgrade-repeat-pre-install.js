// Item 1c.2, the repeat with the free switch cleared (On, the default): after the first pass the
// switch holds no user value; fish.model (s2.1-pro, written by the migration) is cleared, which also
// puts the model back to s2.1-pro-free (the default) for the rest of the run. The same xpi is then
// installed in place by the tester (the migration runs at every startup, the path a real upgrade takes;
// the 1.16.10 xpi is not at hand, so this repeat is a same-build reinstall, not an upgrade from 1.16.10).
// params: none. state: reads upgradeAfter; writes repeatBefore.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const typeName = t => t === p.PREF_BOOL ? 'bool' : t === p.PREF_INT ? 'int' : t === p.PREF_STRING ? 'string' : 'unset';
  if (!state.upgradeAfter) throw new Error('run 02-upgrade-post-install.js first');
  const modelKey = prefix + 'fish.model', freeKey = prefix + 'fish.freeOnly';
  const line = 'Fish Audio reads with s2.1-pro: the free-model switch was off';
  if (p.prefHasUserValue(modelKey)) p.clearUserPref(modelKey);
  if (p.prefHasUserValue(freeKey)) throw new Error('the free switch still holds a user value');
  const store = String(await Zotero.Debug.get());
  const out = {
    status: 'PASS', phase: '1c.2 repeat, before the second install',
    build: JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()).version,
    model: { hasUser: p.prefHasUserValue(modelKey), value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, type: typeName(p.getPrefType(modelKey)) },
    freeOnlyHasUser: p.prefHasUserValue(freeKey),
    migrationLinesInStore: store.split('\n').filter(l => l.includes(line)).length,
  };
  state.repeatBefore = out;
  return JSON.stringify(out, null, 1);
})()
