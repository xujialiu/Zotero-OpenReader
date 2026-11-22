// Verify that startup left both retired OpenAI fields, the current MiMo
// model, and the provider switches exactly as seeded/baselined.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.openAISplitUpgrade;
  const d = Zotero.ZoteroTTS.diagnostics;
  const prefix = 'extensions.zotero.zotero-tts.';
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
    if (!baseline?.seeds) throw new Error('OpenAI split seed state is missing');
    const values = Object.fromEntries(Object.keys(baseline.prefs).map(key => [key, readPref(key)]));
    const retiredExact = values['openai.server'].value === baseline.seeds['openai.server']
      && values['openai.model'].value === baseline.seeds['openai.model']
      && values['openai.server'].hadUserValue && values['openai.model'].hadUserValue;
    const currentModelExact = values['mimo.model'].value === baseline.seeds['mimo.model'] && values['mimo.model'].hadUserValue;
    const switchesExact = ['openai.enabled', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled']
      .every(key => values[key].value === baseline.prefs[key].value && values[key].hadUserValue === baseline.prefs[key].hadUserValue);
    const sync = JSON.parse(d.positionSync());
    const hasOpenAISplitDiagnostic = Object.prototype.hasOwnProperty.call(d, 'openaiSplit');
    if (!retiredExact || !currentModelExact || !switchesExact || sync.folder !== false || hasOpenAISplitDiagnostic) {
      throw new Error('At least one #115 upgrade-preservation assertion failed');
    }
    out.retiredPreferences = { server: values['openai.server'].value, model: values['openai.model'].value, exact: retiredExact };
    out.currentMimoModel = { model: values['mimo.model'].value, exact: currentModelExact };
    out.switchesUnchanged = Object.fromEntries(['openai.enabled', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled'].map(key => [key, values[key]]));
    out.openAISplitDiagnosticAbsent = !hasOpenAISplitDiagnostic;
    out.webdavFolderAfterInstall = sync.folder;
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
