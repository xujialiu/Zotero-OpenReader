// Item 9 (issue #237, second build): a Zotero voice through a narrowly
// scoped, restored transport stub — no paid request. Zotero's Standard tier
// is switched off in the pane (the owner's setting, restored here): it is
// enabled only for this check, the manager's voice list refreshed, a
// standard voice picked while paused, and Zotero.Sync.APIClient.prototype
// .getReadAloudAudio wrapped for the duration — it records the segment it
// receives (the copied segment whose text must be the replaced text),
// answers a silent WAV with word timestamps in the SPEECH text's own
// coordinates, and never forwards, so nothing is bought. The composite must
// hand the copied segment to Zotero's route and map the word ranges back
// into the document's coordinates: the manager's activeTimestamp is sampled
// while the sentence plays. The stub is restored in finally; the tier
// switch too; the voice pick's persistence is cleanup's (readAloudVoices
// snapshot). Volume is 0. params: none.
// state: reads fixture; writes item9.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const m = safe(() => ir._readAloudManager);
  if (!m?.active) throw new Error('the fixture session is not active');
  // 1. snapshots
  out.snapshot = {
    standardEnabled: Services.prefs.getBoolPref(P + 'zotero-standard.enabled', null),
    standardUser: Services.prefs.prefHasUserValue(P + 'zotero-standard.enabled'),
    selectedTier: safe(() => m.selectedTier),
    selectedVoiceID: safe(() => m.selectedVoiceID),
  };
  // 2. the Standard tier on, the list refreshed
  Services.prefs.setBoolPref(P + 'zotero-standard.enabled', true);
  await sleep(600);
  const wm = Components.utils.waiveXrays(m);
  try { await Promise.resolve(wm.loadVoices(true)); } catch (e) { out.loadVoicesError = String(e); }
  await sleep(1200);
  const voices = safe(() => wm._allVoices) ?? [];
  let picked = null;
  for (let i = 0; i < (Number(voices.length) || 0); i++) {
    const v = safe(() => Components.utils.waiveXrays(voices[i]));
    const tier = safe(() => v?.tier);
    const id = safe(() => v?.id);
    const lang = safe(() => String(v?.lang ?? ''));
    if (tier === 'standard' && id) { picked = { id, lang, tier }; break; }
  }
  out.picked = picked;
  if (!picked) {
    Services.prefs.setBoolPref(P + 'zotero-standard.enabled', out.snapshot.standardEnabled);
    throw new Error('no standard voice after the tier switch and refresh');
  }
  // 3. the stub
  const proto = Zotero.Sync.APIClient.prototype;
  const original = proto.getReadAloudAudio;
  const calls = [];
  const makeWav = (seconds) => {
    const rate = 16000;
    const samples = Math.round(rate * seconds);
    const buf = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buf);
    const str = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, buf.byteLength - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, samples * 2, true);
    return buf;
  };
  proto.getReadAloudAudio = function (segment, voiceID) {
    if (segment === 'sample') return original.call(this, segment, voiceID);
    const text = segment && typeof segment === 'object' ? String(segment.text) : String(segment);
    calls.push({ text, voiceID: String(voiceID), copied: segment && typeof segment === 'object' });
    const words = [];
    const re = /\S+/g;
    let match;
    let i = 0;
    while ((match = re.exec(text)) !== null) {
      words.push({ start: i * 0.25, end: (i + 1) * 0.25, charStart: match.index, charEnd: match.index + match[0].length });
      i++;
    }
    const blob = new Blob([makeWav(Math.max(1, text.length * 0.05))], { type: 'audio/wav' });
    return Promise.resolve({ audio: blob, timestamps: words });
  };
  out.stubInstalled = proto.getReadAloudAudio !== original;
  try {
    // 4. the pick while paused, then Play (the sentence starts over)
    if (!m.paused) await Promise.resolve(wm.pause());
    await sleep(300);
    try { await Promise.resolve(wm.selectTier('standard')); } catch (e) { out.selectTierError = String(e); }
    try { await Promise.resolve(wm.selectVoice(picked.id)); } catch (e) { out.selectVoiceError = String(e); }
    await sleep(600);
    out.afterPick = { selectedTier: safe(() => wm.selectedTier), selectedVoiceID: safe(() => wm.selectedVoiceID), paused: safe(() => m.paused) };
    wm.repositionTo(1);
    const trace = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 2400) {
      const at = safe(() => wm.activeTimestamp);
      trace.push({ t: Date.now() - t0, charStart: at ? safe(() => at.charStart) : null, charEnd: at ? safe(() => at.charEnd) : null });
      await sleep(100);
    }
    out.trace = trace;
    out.traceNonnull = trace.filter((t) => t.charStart !== null).length;
    const m2 = safe(() => ir._readAloudManager);
    if (m2 && m2.active && !m2.paused) await Promise.resolve(Components.utils.waiveXrays(m2).pause());
    await sleep(400);
    const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const s = engine.readers?.[fx.readerIndex]?.session;
    out.session = { voice: s?.voice, position: s?.position, paused: s?.paused, error: s?.error ?? null, clips: s?.store?.clips };
  } finally {
    // 5. the stub back, the tier switch back (the snapshot's value + user flag)
    proto.getReadAloudAudio = original;
    out.stubRestored = proto.getReadAloudAudio === original;
    Services.prefs.setBoolPref(P + 'zotero-standard.enabled', out.snapshot.standardEnabled);
    out.standardRestored = Services.prefs.getBoolPref(P + 'zotero-standard.enabled', null) === out.snapshot.standardEnabled;
  }
  out.stubCalls = calls;
  out.stubHit = calls.length > 0;
  state.item9 = { stubHit: out.stubHit, calls: calls.length, picked: picked?.id ?? null };
  return JSON.stringify(out, null, 1);
})()
