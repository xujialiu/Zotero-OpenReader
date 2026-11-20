(async () => {
  // voice-catalog 03 rev 2 — pre-Play verification for BOTH fixtures: each
  // Document voice = an actual plugin-catalog System id (the Samantha id this
  // branch's catalog has shown since the 2026-11-19 run), proven through
  // diagnostics.documentVoices BEFORE any Play. No popup is opened here.
  // rev 2 pins the expected id to the catalog row instead of "first en-US".
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state.vc261;
  const PR = 'extensions.zotero.zotero-tts.';
  const wantedId = 'system::osx/com.apple.voice.compact.en-US.Samantha';
  // 1. real catalog ids from the plugin's own listing (no browser-URI guessing)
  let catalog;
  try { catalog = JSON.parse(await Zotero.ZoteroTTS.diagnostics.defaultVoice()); } catch (e) { throw new Error('defaultVoice failed: ' + e.message); }
  const rows = (catalog.rows || []).filter(v => typeof v.id === 'string' && v.id.startsWith('system::'));
  const chosen = rows.find(v => v.id === wantedId);
  if (!chosen) throw new Error('expected Samantha id not in the plugin catalog listing');
  // 2. per-fixture document key + record: use what the plugin itself wrote;
  //    plant only if absent or not the pinned system:: id
  const fixtures = [['fixtureA', state.fixtureA], ['fixtureB', state.fixtureB]];
  const result = {};
  for (const [name, fixture] of fixtures) {
    const reader = (Zotero.Reader._readers || []).find(e => e.itemID === fixture.itemID);
    if (!reader) throw new Error(name + ' reader not open');
    let dv = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    let row = (dv.readers || []).find(x => x.key && x.key.includes(fixture.key));
    if (!row || !row.key) throw new Error('no document voice key for ' + name);
    const current = row.saved && row.saved.voice ? row.saved.voice.id : null;
    let planted = false;
    if (current !== chosen.id) {
      const record = { voice: { id: chosen.id, lang: 'en' }, manual: true, ts: Date.now() };
      Services.prefs.setStringPref(PR + 'documentVoices.' + row.key, JSON.stringify(record));
      planted = true;
    }
    await sleep(300);
    dv = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const row2 = (dv.readers || []).find(x => x.key && x.key.includes(fixture.key));
    const savedId = row2 && row2.saved && row2.saved.voice ? row2.saved.voice.id : null;
    state[name + 'Voice'] = { id: chosen.id, recordKey: row.key, savedId, planted };
    result[name] = {
      recordKey: row.key, planted,
      savedId, matchesChosen: savedId === chosen.id,
      manual: row2 && row2.saved ? row2.saved.manual : null,
    };
  }
  state.systemVoice = { id: chosen.id, label: chosen.label ?? null, locale: chosen.locale ?? null };
  // 3. pre-Play guards: destination + cleared headers + stub clean
  const baseURL = Services.prefs.getStringPref(PR + 'local.baseURL');
  const headersLen = Services.prefs.getStringPref(PR + 'local.headers').length;
  const localEnabled = Services.prefs.getBoolPref(PR + 'local.enabled');
  let stub = null;
  try { stub = await (await fetch(state.localRun.stubBase + '/control/state')).json(); } catch (e) { stub = { error: String(e) }; }
  return JSON.stringify({
    catalogSystemCount: rows.length, samanthaInCatalog: !!chosen,
    fixtures: result,
    prePlay: { localEnabled, baseURLIsStub: baseURL === state.localRun.stubBase, headersLen, systemEnabled: Services.prefs.getBoolPref(PR + 'system.enabled') },
    stubGuards: { sawCredentialLikeHeader: stub.sawCredentialLikeHeader ?? null, voicesTotal: stub.voicesTotal ?? null, speechTotal: stub.speechTotal ?? null },
  });
})()
