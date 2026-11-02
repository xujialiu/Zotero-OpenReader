// Item 8, while paused (issue #237, second build): the session paused with
// its clip loaded, the IL-6 row's Read as edited back to 'interleukin six'
// (straight pref write + pulse), then Play — repositionTo(1), which starts
// the sentence over — must read the new text: the handoff prepares while
// paused and commits when the reading resumes, and the fake Kokoro log
// gains a request for the new text. repositionTo must be called on the
// WAIVED manager. Volume is 0. params: none.
// state: reads fixture, session.logPath; writes item8paused.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const P = 'extensions.zotero.zotero-tts.';
  const docPref = P + 'documentReplacements.user/' + fx.key;
  const pulsePref = P + 'documentReplacementsChanged';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const readLogCounts = async () => {
    try {
      const text = await IOUtils.readUTF8(state.session?.logPath);
      const counts = {};
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { const j = JSON.parse(line); if (j.input !== undefined) counts[j.input] = (counts[j.input] ?? 0) + 1; } catch (e) {}
      }
      return counts;
    } catch (e) { return { error: String(e) }; }
  };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const m = safe(() => ir._readAloudManager);
  if (!m?.active) throw new Error('the fixture session is not active');
  if (!m.paused) await Promise.resolve(Components.utils.waiveXrays(m).pause());
  await sleep(400);
  out.paused = safe(() => m.paused);
  const rep0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.staleLastEditAt = (rep0.readers ?? [])[fx.readerIndex]?.lastEdit?.at ?? null;
  out.held1Before = (rep0.readers ?? [])[fx.readerIndex]?.held?.['1'] ?? null;
  out.logBefore = await readLogCounts();
  const rows = [
    { text: 'IL-6', readAs: 'interleukin six', mode: 'exact', matchCase: true },
    { text: 'anti IL-(\\d+)', readAs: 'anti-interleukin $1', mode: 'regex', matchCase: false },
  ];
  const pulseBefore = Number(Services.prefs.getStringPref(pulsePref, '0'));
  Services.prefs.setStringPref(docPref, JSON.stringify({ rows, ts: Date.now() }));
  Services.prefs.setStringPref(pulsePref, String(pulseBefore + 1));
  const wroteAt = Date.now();
  out.pulse = { before: pulseBefore, after: pulseBefore + 1 };
  // the paused handoff prepares
  await sleep(1200);
  const rep1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  const le1 = (rep1.readers ?? [])[fx.readerIndex]?.lastEdit;
  out.pausedLastEdit = le1 && le1.at > wroteAt - 50 ? {
    outcome: le1.outcome, changed: le1.changed, stage: le1.report?.stage ?? null, kind: le1.report?.last?.kind ?? null,
  } : { stale: true, at: le1?.at ?? null };
  out.enginePaused = (() => 'see watch')();
  // Play: the sentence starts over and reads the new text
  const m2 = safe(() => ir._readAloudManager);
  Components.utils.waiveXrays(m2).repositionTo(1);
  const watch = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
    const le = (rep.readers ?? [])[fx.readerIndex]?.lastEdit;
    watch.push({
      t: Date.now() - t0,
      outcome: le?.outcome ?? null,
      changed: le?.changed ?? null,
      stage: le?.report?.stage ?? null,
      kind: le?.report?.last?.kind ?? null,
      held1: (rep.readers ?? [])[fx.readerIndex]?.held?.['1'] ?? null,
    });
    if (le?.report?.stage === 'committed' && le?.report?.last?.kind) break;
    await sleep(150);
  }
  out.watch = watch;
  const m3 = safe(() => ir._readAloudManager);
  if (m3 && m3.active && !m3.paused) await Promise.resolve(Components.utils.waiveXrays(m3).pause());
  await sleep(600);
  out.logAfter = await readLogCounts();
  const diff = {};
  for (const key of new Set([...Object.keys(out.logBefore), ...Object.keys(out.logAfter)])) {
    const b = out.logBefore[key] ?? 0;
    const a = out.logAfter[key] ?? 0;
    if (a !== b) diff[key] = { before: b, after: a };
  }
  out.requestDiff = diff;
  out.playedNewText = (out.logAfter['interleukin six levels rose after the second dose.'] ?? 0) > (out.logBefore['interleukin six levels rose after the second dose.'] ?? 0);
  state.item8paused = { outcome: out.pausedLastEdit?.outcome, playedNewText: out.playedNewText };
  return JSON.stringify(out, null, 1);
})()
