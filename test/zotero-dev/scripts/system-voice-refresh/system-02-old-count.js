// system-voice-refresh 02: the OLD build's System voice count before upgrading (#241 item 1).
// Research baseline: nine voices (three Desktop SAPI5 + six OneCore), no Andrew HD.
// The retained helper may still hold the pre-bridge snapshot — that is the point.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const ANDREW = 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const countBy = (voices, re) => voices.filter((v) => re.test(v.id)).length;
  try {
    const started = Date.now();
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const voices = rep.voices || [];
    const out = {
      ms: Date.now() - started,
      enabled: rep.enabled,
      platform: rep.platform,
      unsupported: rep.unsupported ?? null,
      backend: rep.backend ? { running: rep.backend.running, starts: rep.backend.starts, sent: rep.backend.sent, lastError: rep.backend.lastError } : null,
      count: voices.length,
      sapi5: countBy(voices, /^sapi5\//),
      onecore: countBy(voices, /^onecore\//),
      andrewPresent: voices.some((v) => v.id === ANDREW),
      firstVoice: voices[0] ? { id: voices[0].id, name: voices[0].name } : null,
      voicesError: rep.voicesError ?? null,
    };
    state.oldCount = out;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
