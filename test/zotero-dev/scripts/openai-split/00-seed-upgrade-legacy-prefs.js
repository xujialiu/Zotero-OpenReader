// Issue #115 item 1: snapshot affected preference values and user flags,
// then seed retired OpenAI fields against a different current MiMo model.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const prefix = 'extensions.zotero.zotero-tts.';
  const keys = ['openai.server', 'openai.model', 'mimo.model', 'openai.enabled', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled'];
  const readPref = suffix => {
    const name = prefix + suffix;
    const type = Services.prefs.getPrefType(name);
    const hadUserValue = Services.prefs.prefHasUserValue(name);
    let value = null;
    if (type === 32) value = Services.prefs.getStringPref(name);
    else if (type === 64) value = Services.prefs.getIntPref(name);
    else if (type === 128) value = Services.prefs.getBoolPref(name);
    return { type, hadUserValue, value };
  };
  try {
    const webdav = JSON.parse(d.positionSync());
    if (webdav.folder !== false) throw new Error('WebDAV folder must be isolated before seeding OpenAI preferences');
    const baseline = { prefs: Object.fromEntries(keys.map(key => [key, readPref(key)])), webdavFolder: webdav.folder };
    state.openAISplitUpgrade = baseline;
    const seeds = { 'openai.server': 'mimo', 'openai.model': 'old-model-upgrade-fixture', 'mimo.model': 'current-model-upgrade-fixture' };
    for (const [suffix, value] of Object.entries(seeds)) Services.prefs.setStringPref(prefix + suffix, value);
    baseline.seeds = seeds;
    out.webdavFolder = webdav.folder;
    out.retiredPreferencesSeeded = { server: seeds['openai.server'], model: seeds['openai.model'], userValue: true };
    out.currentMimoModelSeeded = { model: seeds['mimo.model'], distinctFromRetired: seeds['mimo.model'] !== seeds['openai.model'], userValue: true };
    out.providerSwitchesBaseline = Object.fromEntries(['openai.enabled', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled'].map(key => [key, baseline.prefs[key]]));
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
