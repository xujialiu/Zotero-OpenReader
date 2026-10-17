// 1.17 core listing: diagnostics.systemProvider() — platform, 193 voices, no repeated id,
// Daniel/Moira/Rishi/Samantha/Tessa once each; the `macOS lists 193 voices` debug line;
// points readAloud.memory at a free System voice so no popup can pick the paid voice it names.
// Memory is restored verbatim by 06-cleanup.js, last of all prefs.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  try {
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    out.enabled = diag.enabled;
    out.platform = diag.platform;
    out.unsupported = diag.unsupported;
    out.backend = diag.backend ? { platform: diag.backend.platform, wordTimestamps: diag.backend.wordTimestamps, spawned: diag.backend.spawned } : null;
    const voices = diag.voices || [];
    out.voiceCount = voices.length;
    const seen = new Map();
    for (const v of voices) seen.set(v.id, (seen.get(v.id) || 0) + 1);
    const dups = [];
    for (const [id, n] of seen) if (n > 1) dups.push({ id, n });
    out.duplicateIds = dups;
    out.distinctIds = seen.size;
    // The five English voices macOS 27 repeats (issue #185), matched by the identifier's tail
    // (the display name carries a locale suffix: "Daniel (English (UK))").
    const wanted = ['Daniel', 'Moira', 'Rishi', 'Samantha', 'Tessa'];
    out.named = {};
    for (const name of wanted) {
      const hits = voices.filter((v) => new RegExp('\\.' + name + '$', 'i').test(v.id));
      const ids = Array.from(new Set(hits.map((v) => v.id)));
      out.named[name] = { count: hits.length, distinctIds: ids.length, id: ids[0] || null, name: hits[0] ? hits[0].name : null };
    }
    out.namedOnceEach = wanted.every((n) => out.named[n].count === 1);
    // Zotero's own view of the same list (the set the manager publishes from).
    // The debug line the listing logs (mac.ts listVoices): read the store, filter by content.
    const debug = String(await Zotero.Debug.get());
    const lines = debug.split('\n').filter((l) => l.includes('macOS lists') && l.includes('voices'));
    out.debugListingLines = lines.slice(-3);
    out.debugSays = lines.length ? lines[lines.length - 1].match(/macOS lists (\d+) voices/)?.[1] : null;

    // Point the default voice the memory-sync applies at Daniel (a listed, free voice) so the
    // player cannot start the paid voice the memory names. readAloud.defaultVoice is the pref
    // memory-sync applies (memory-sync.ts memory()); readAloud.memory is its legacy carrier.
    if (out.named.Daniel.id) {
      state.memoryVoice = 'system::' + out.named.Daniel.id;
      const DV = 'extensions.zotero.zotero-tts.readAloud.defaultVoice';
      if (!state.baseline['zotero-tts.readAloud.defaultVoice']) {
        state.baseline['zotero-tts.readAloud.defaultVoice'] = {
          type: Services.prefs.getPrefType(DV),
          value: Services.prefs.prefHasUserValue(DV) ? Services.prefs.getStringPref(DV) : null,
          user: Services.prefs.prefHasUserValue(DV)
        };
      }
      const body = JSON.stringify({ id: state.memoryVoice, lang: 'en' });
      Services.prefs.setStringPref(DV, body);
      out.defaultVoiceNow = { voice: state.memoryVoice, ok: Services.prefs.getStringPref(DV) === body };
      state.danielEncoded = state.memoryVoice;
    }
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e) });
  }
})()
