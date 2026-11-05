// Case: system-voice-selection, item 3 — real synthesis through the
// installed plugin, switching back. Calls diagnostics.systemProvider(<raw
// token>) once per step, in order: Andrew HD -> Andrew Online ->
// AndrewMultilingual Online -> Andrew HD. Requires per step: no
// synthesisError, synthesis.bytes > 0, an audio type, and real word marks
// or an explicit fallback note. The daemon's `starts` staying flat across
// steps proves the same helper served ordinary reuse (no per-voice
// process). Afterwards the raw catalog is listed again and compared with
// the run's initial capture (02) — same records, same count.
(async () => {
  const out = {};
  const steps = [
    { expect: 'Andrew (Natural HD)', voice: 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1' },
    { expect: 'Andrew Online (Natural)', voice: 'sapi5/Edge-en-US-AndrewNeural' },
    { expect: 'AndrewMultilingual Online (Natural)', voice: 'sapi5/Edge-en-US-AndrewMultilingualNeural' },
    { expect: 'Andrew (Natural HD) again', voice: 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1' },
  ];
  const call = async (voice) => {
    const r = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider(voice));
    return {
      backend: r.backend, backendAfter: r.backendAfter ?? null,
      synthesis: r.synthesis ?? null, synthesisError: r.synthesisError ?? null,
      voicesError: r.voicesError ?? null,
    };
  };
  const stepsOut = [];
  for (const s of steps) {
    const r = await call(s.voice);
    stepsOut.push({
      expect: s.expect, voice: s.voice,
      synthesisError: r.synthesisError,
      bytes: r.synthesis?.bytes ?? null,
      type: r.synthesis?.type ?? null,
      ms: r.synthesis?.ms ?? null,
      words: r.synthesis?.words ?? null,
      note: r.synthesis?.note ?? null,
      firstWord: r.synthesis?.first?.[0] ?? null,
      lastWord: r.synthesis?.last ?? null,
      starts: r.backend?.state ? r.backend.state : r.backend, // daemon state before the call
      sentBefore: r.backend?.state?.sent ?? null,
      sentAfter: r.backendAfter?.sent ?? null,
      startsBefore: r.backend?.state?.starts ?? null,
      startsAfter: r.backendAfter?.starts ?? null,
      runningAfter: r.backendAfter?.running ?? null,
      lastErrorAfter: r.backendAfter?.lastError ?? null,
    });
  }
  out.steps = stepsOut;

  // Catalog again — compare with the initial capture
  try {
    const again = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const initial = Zotero.ZoteroTTSRun.state.svsCatalogInitial ?? [];
    out.catalog = {
      countInitial: initial.length,
      countNow: (again.voices ?? []).length,
      identical: JSON.stringify(initial) === JSON.stringify(again.voices ?? []),
      error: again.voicesError ?? null,
    };
  } catch (e) { out.catalogError = String(e); }

  return JSON.stringify(out, null, 1);
})()
