// Case: system-voice-selection, items 1+2 — build identity after the install.
// Captures the initial raw System catalog via diagnostics.systemProvider()
// (raw Windows names — NOT the UI labels), and proves the install rewrote no
// saved non-fixture voice identity: every snapshot pref of script 01 must be
// byte-identical here, and the documentVoices key set unchanged.
(async () => {
  const P = 'extensions.zotero.zotero-tts.';
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const prov = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    out.systemProvider = {
      enabled: prov.enabled, platform: prov.platform, unsupported: prov.unsupported ?? null,
      backend: prov.backend ? { platform: prov.backend.platform, wordTimestamps: prov.backend.wordTimestamps } : null,
      voices: prov.voicesError ? { error: prov.voicesError } : prov.voices,
      voicesError: prov.voicesError ?? null,
    };
    S.svsCatalogInitial = prov.voicesError ? null : prov.voices;
  } catch (e) { out.catalogError = String(e); }

  // Saved identities must be byte-identical to the script-01 snapshot.
  try {
    const prefs = Services.prefs;
    const snap = S.svsPrefs ?? {};
    const names = Object.keys(snap).filter((n) => n && !n.startsWith('__'));
    const diffs = [];
    for (const name of names) {
      const before = snap[name];
      const t = prefs.getPrefType(name);
      const user = t !== 0 && prefs.prefHasUserValue(name);
      let value = null;
      if (user && t === 32) value = prefs.getStringPref(name);
      else if (user && t === 64) value = prefs.getIntPref(name);
      else if (user && t === 128) value = prefs.getBoolPref(name);
      if (user !== before.user || JSON.stringify(value) !== JSON.stringify(before.value)) {
        diffs.push({ pref: name.slice(name.indexOf('zotero-tts.') + 11), beforeUser: before.user, afterUser: user, changed: before.user && user });
      }
    }
    const docBranch = prefs.getBranch(P + 'documentVoices.');
    const docKeys = docBranch.getChildList('');
    const before = Object.keys(snap.__documentVoices ?? {}).sort().join(',');
    const nowKeys = docKeys.filter((k) => prefs.prefHasUserValue(P + 'documentVoices.' + k)).sort().join(',');
    out.noRewrite = { prefDiffs: diffs, documentVoicesUnchanged: before === nowKeys, documentVoicesNow: docKeys.length };
  } catch (e) { out.noRewriteError = String(e); }

  try {
    const s = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.folder = { folder: s.folder };
  } catch (e) { out.folderError = String(e); }

  return JSON.stringify(out, null, 1);
})()
