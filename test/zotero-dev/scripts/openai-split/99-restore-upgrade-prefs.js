// Restore the exact pre-run values and user-value flags captured by 00.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.openAISplitUpgrade;
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
  const restore = (suffix, snap) => {
    const name = prefix + suffix;
    if (!snap.hadUserValue) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
    } else if (snap.type === 32) Services.prefs.setStringPref(name, snap.value);
    else if (snap.type === 64) Services.prefs.setIntPref(name, snap.value);
    else if (snap.type === 128) Services.prefs.setBoolPref(name, snap.value);
    else throw new Error('Unsupported preference type for ' + suffix);
  };
  try {
    if (!baseline?.prefs) throw new Error('OpenAI split baseline is missing');
    for (const [key, snap] of Object.entries(baseline.prefs)) restore(key, snap);
    const after = Object.fromEntries(Object.keys(baseline.prefs).map(key => [key, readPref(key)]));
    const exact = Object.keys(baseline.prefs).every(key => after[key].value === baseline.prefs[key].value
      && after[key].hadUserValue === baseline.prefs[key].hadUserValue);
    if (!exact) throw new Error('OpenAI preferences or user-value flags did not restore exactly');
    out.restoredExact = exact;
    out.restored = Object.fromEntries(['openai.server', 'openai.model', 'mimo.model', 'openai-official.enabled', 'mimo.enabled', 'compatible.enabled']
      .map(key => [key, after[key]]));
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    throw error;
  }
})()
