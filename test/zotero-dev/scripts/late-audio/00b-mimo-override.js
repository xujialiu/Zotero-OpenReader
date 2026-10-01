// Run AFTER 00-baseline-and-mute.js, only when Kokoro answered too fast to
// catch (see 00's header): temporarily enables Xiaomi MiMo (already
// configured -- an API key is set -- but off) and points readAloud.memory at
// one of its documented built-in voices, mimo::mimo_default (MIMO_VOICES in
// src/core/providers/mimo.ts; no voice listing needed, so no extra request).
// Issue #165's run (2026-10-01) also points readAloud.defaultVoice at the same
// voice: a NEW document takes readAloud.defaultVoice, not readAloud.memory, so
// item 6's fresh fixture would otherwise not read in MiMo. 90-cleanup-restore
// .js's own restore order includes mimo.enabled and defaultVoice, so running 90
// after 01/03/06 restores them along with the rest -- no separate hand restore
// needed.
// params: none. state: reads baseline (must have run already).
(async () => {
  const out = { step: 'mimo-override' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    if (!S.baseline) throw new Error('00-baseline-and-mute.js must run first');
    Zotero.Prefs.set('zotero-tts.mimo.enabled', true);
    Zotero.Prefs.set('zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'mimo::mimo_default', lang: 'en' } }));
    Zotero.Prefs.set('zotero-tts.readAloud.defaultVoice', JSON.stringify({ id: 'mimo::mimo_default', lang: 'en' }));
    out.mimoEnabledNow = Zotero.Prefs.get('zotero-tts.mimo.enabled');
    out.memoryNow = Zotero.Prefs.get('zotero-tts.readAloud.memory');
    out.defaultVoiceNow = Zotero.Prefs.get('zotero-tts.readAloud.defaultVoice');
  } catch (e) {
    out.error = String(e);
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
