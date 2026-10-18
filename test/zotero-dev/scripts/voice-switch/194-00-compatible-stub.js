// 194-00 — point the OpenAI Compatible section at the local stub (voice-switch #194/#196 with
// provider-replies #198-#201; one stub for both cases). The section's original values and user
// flags are already in the run snapshot (state.fix4Prefs); this writes the test values and
// verifies the section reads them. Never prints a key: masked lengths only.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  if (!P.stubBase) { out.error = 'params.stubBase missing'; return JSON.stringify(out); }
  const write = (name, value) => Zotero.Prefs.set('zotero-tts.' + name, value);
  write('compatible.enabled', true);
  write('compatible.baseURL', P.stubBase);
  write('compatible.apiKey', '');
  write('compatible.model', 'stub');
  write('compatible.voices', '');
  write('compatible.headers', '');
  await new Promise((r) => setTimeout(r, 300));
  // masked readback
  const g = (n) => Zotero.Prefs.get(n, true);
  out.section = {
    enabled: g('zotero-tts.compatible.enabled'),
    baseURL: g('zotero-tts.compatible.baseURL'),
    apiKeyLen: String(g('zotero-tts.compatible.apiKey') ?? '').length,
    model: g('zotero-tts.compatible.model'),
    voices: g('zotero-tts.compatible.voices'),
    headersLen: String(g('zotero-tts.compatible.headers') ?? '').length,
  };
  out.stubVoices = null;
  try {
    const r = await fetch(P.stubBase + '/v1/audio/voices');
    out.stubVoices = { status: r.status, body: (await r.text()).slice(0, 120) };
  } catch (e) { out.stubError = String(e); }
  out.pass = out.section.enabled === true && out.section.baseURL === P.stubBase && out.section.apiKeyLen === 0;
  return JSON.stringify(out);
})()
