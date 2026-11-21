(async () => {
  const state = Zotero.ZoteroTTSRun.state,
    index = state.liveReader.index,
    reader = Zotero.Reader._readers[index];
  const manager = Components.utils.waiveXrays(reader._internalReader)._readAloudManager;
  const baseline = state.beta3Baseline?.prefs?.speed;
  if (!baseline) throw new Error('Captured Global speed baseline is missing');
  const full = 'extensions.zotero.zotero-tts.readAloud.speedPercent';
  const globalKey = 'extensions.zotero.zotero-tts.readAloud.globalSpeed';
  const before = {
    value: Zotero.Prefs.get(full, true),
    user: Services.prefs.prefHasUserValue(full),
    global: Zotero.Prefs.get(globalKey, true),
    managerSpeed: manager.speed ?? null,
    selected: manager.selectedVoiceID ?? null,
  };
  Zotero.Prefs.set('zotero-tts.readAloud.speedPercent', 110);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const changed = {
    value: Zotero.Prefs.get(full, true),
    user: Services.prefs.prefHasUserValue(full),
    global: Zotero.Prefs.get(globalKey, true),
    managerSpeed: manager.speed ?? null,
    selected: manager.selectedVoiceID ?? null,
  };
  if (baseline.user) Services.prefs.setIntPref(full, baseline.value);
  else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const restored = {
    value: Zotero.Prefs.get(full, true),
    user: Services.prefs.prefHasUserValue(full),
    managerSpeed: manager.speed ?? null,
  };
  const out = {
    before,
    changed,
    restored,
    changedTo110: changed.value === 110,
    restoredToBaseline: restored.value === baseline.value && restored.user === baseline.user,
  };
  state.beta3Speed = out;
  return JSON.stringify(out);
})();
