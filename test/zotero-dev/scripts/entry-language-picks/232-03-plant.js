// System is the only permitted synthesis provider for this item. Plant a
// missing manual fixture record before opening; no pulse is manufactured.
(async () => {
  const Z = Zotero, S = Services.prefs, state = Z.ZoteroTTSRun.state.ep232;
  const P = 'extensions.zotero.zotero-tts.', out = { steps: [] };
  try {
    if (state?.schema !== 2 || !state.snapshotComplete || !state.fixture?.created) throw new Error('Validated baseline and run-created fixture required');
    const fixture = state.fixture;
    if (!/^[A-Z0-9]{8}$/.test(fixture.key)) throw new Error('Invalid fixture identity');
    const nativeName = 'extensions.zotero.reader.readAloudVoices';
    const map = S.getPrefType(nativeName) === 32 ? JSON.parse(S.getStringPref(nativeName)) : {};
    if (map.en) throw new Error('The controlled en entry changed; do not overwrite it or continue');
    const key = `documentVoices.user/${fixture.key}`;
    if (S.getPrefType(P + key) !== 0 || S.prefHasUserValue(P + key)) throw new Error('Fixture key already has a record; do not overwrite it');
    S.setBoolPref(P + 'system.enabled', true);
    const record = { voice: { id: 'ztts-232-missing-voice', lang: 'en' }, manual: true, ts: Date.now() };
    S.setStringPref(P + key, JSON.stringify(record));
    state.fixtureRecordKey = key;
    state.fixtureRecordPlanted = JSON.stringify(record);
    out.ok = S.getBoolPref(P + 'system.enabled') === true && S.getStringPref(P + key) === state.fixtureRecordPlanted;
    out.independentConfirmationRequired = true; // 232-04, never this write/readback alone.
  } catch (e) { out.ok = false; out.error = String(e); }
  return JSON.stringify(out);
})()
