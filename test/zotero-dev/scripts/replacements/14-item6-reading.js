// Item 6 (issue #237, second build): what the voice is given and what the
// highlight shows while reading sentence 2 (segment index 1) with the
// word-timed voice. Reads the fake Kokoro server's log (the outgoing
// requests, with their input text — not a debug line), repositions to the
// sentence start — repositionTo resumes playing by itself, and must be
// called on the WAIVED manager: through the unwaived Xray the argument is
// lost (2026-11-03) — samples the manager's activeTimestamp (document
// coordinates) every 100 ms while the sentence plays, pauses, and reads
// the log again: the per-input counts must be unchanged — the re-read was
// served from the cache. The rows are already in the prefs (07's OK).
// Needs the fixture session active (04 started it). Volume is 0.
// params: none. state: reads fixture, session.logPath; writes item6.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const logPath = state.session?.logPath;
  const readLog = async () => {
    try {
      const text = await IOUtils.readUTF8(logPath);
      const counts = {};
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { const j = JSON.parse(line); if (j.input !== undefined) counts[j.input] = (counts[j.input] ?? 0) + 1; } catch (e) {}
      }
      return counts;
    } catch (e) { return { error: String(e) }; }
  };
  out.logBefore = await readLog();
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const m = safe(() => ir._readAloudManager);
  if (!m?.active) throw new Error('the fixture session is not active');
  if (!m.paused) await Promise.resolve(m.pause());
  await sleep(300);
  const wm = Components.utils.waiveXrays(m);
  try { wm.repositionTo(1); } catch (e) { out.repositionError = String(e); }
  // sample the highlight while the sentence plays (repositionTo resumed it)
  const trace = [];
  const engineAt = async () => {
    try {
      const e = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const s = e.readers?.[fx.readerIndex]?.session;
      return { position: s?.position, playing: s?.playing, playbackTime: s?.playbackTime, audioState: e.readers?.[fx.readerIndex]?.audio?.state };
    } catch (e) { return { error: String(e) }; }
  };
  out.engineAtStart = await engineAt();
  const t0 = Date.now();
  while (Date.now() - t0 < 2800) {
    const at = safe(() => wm.activeTimestamp);
    trace.push({
      t: Date.now() - t0,
      charStart: at ? safe(() => at.charStart) : null,
      charEnd: at ? safe(() => at.charEnd) : null,
    });
    await sleep(100);
  }
  out.trace = trace;
  out.traceNonnull = trace.filter((t) => t.charStart !== null).length;
  const m2 = safe(() => ir._readAloudManager);
  if (m2 && m2.active && !m2.paused) await Promise.resolve(Components.utils.waiveXrays(m2).pause());
  await sleep(400);
  out.engineAtEnd = await engineAt();
  await sleep(400);
  out.logAfter = await readLog();
  const diff = {};
  for (const key of new Set([...Object.keys(out.logBefore), ...Object.keys(out.logAfter)])) {
    const b = out.logBefore[key] ?? 0;
    const a = out.logAfter[key] ?? 0;
    if (a !== b) diff[key] = { before: b, after: a };
  }
  out.logDiff = diff;
  out.sentence2CountBefore = out.logBefore['interleukin six levels rose after the second dose.'] ?? 0;
  out.sentence2CountAfter = out.logAfter['interleukin six levels rose after the second dose.'] ?? 0;
  out.sentence2CacheServed = out.sentence2CountBefore === out.sentence2CountAfter;
  state.item6 = { trace: trace.length, nonnull: out.traceNonnull, sentence2CacheServed: out.sentence2CacheServed };
  return JSON.stringify(out, null, 1);
})()
