// system-voice-refresh 09: ONE real synthesis through the installed plugin with the exact
// LOCAL Andrew HD token (#241 item 3). No Online substitution, no playback. Requires the
// exact record, bytes > 0, an audio MIME, no synthesisError, and real word marks or an
// explicit honest note.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const ANDREW = 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  try {
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider(ANDREW));
    const record = (rep.voices || []).find((v) => v.id === ANDREW) || null;
    const synth = rep.synthesis || null;
    const out = {
      record: record ? { id: record.id, name: record.name, lang: record.lang, zoteroId: record.zoteroId } : null,
      synthesis: synth,
      synthesisError: rep.synthesisError ?? null,
      backendAfter: rep.backendAfter ?? null,
      checks: {
        exactRecordPresent: !!record,
        bytesPositive: !!synth && synth.bytes > 0,
        audioMime: !!synth && typeof synth.type === 'string' && /^audio\//.test(synth.type),
        noSynthesisError: rep.synthesisError == null,
        realWordMarks: !!synth && synth.words > 0,
        honestNoteIfNoMarks: !!synth && (synth.words > 0 || typeof synth.note === 'string'),
      },
    };
    out.allPass = Object.entries(out.checks).every(([, v]) => v === true);
    state.andrewSynthesis = out;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
