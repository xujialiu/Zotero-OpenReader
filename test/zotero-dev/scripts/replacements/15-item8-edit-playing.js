// Item 8, while playing (issue #237, second build, the real edit): sentence
// 2 playing before "levels", the IL-6 row's Read as becomes a text it did
// not have (the two earlier writes had already landed 'interleukin 6', so
// that edit's refresh was a correct none — 2026-11-03). The watch accepts
// only a lastEdit written after this edit and lets the handoff commit
// before pausing. Only held sentences whose text changed may be requested
// again (the fake Kokoro log). Volume is 0. params: none.
// state: reads fixture, session.logPath; writes item8playing.
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
  const rep0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.staleLastEditAt = (rep0.readers ?? [])[fx.readerIndex]?.lastEdit?.at ?? null;
  out.held1Before = (rep0.readers ?? [])[fx.readerIndex]?.held?.['1'] ?? null;
  out.logBefore = await readLogCounts();
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const m = safe(() => ir._readAloudManager);
  if (!m?.active) throw new Error('the fixture session is not active');
  if (!m.paused) await Promise.resolve(Components.utils.waiveXrays(m).pause());
  await sleep(300);
  Components.utils.waiveXrays(m).repositionTo(1); // resumes playing
  await sleep(150); // inside "interleukin six", before "levels" (~330 ms at 140% speed)
  const rows = [
    { text: 'IL-6', readAs: 'interleukin 6 v3', mode: 'exact', matchCase: true },
    { text: 'anti IL-(\\d+)', readAs: 'anti-interleukin $1', mode: 'regex', matchCase: false },
  ];
  const pulseBefore = Number(Services.prefs.getStringPref(pulsePref, '0'));
  Services.prefs.setStringPref(docPref, JSON.stringify({ rows, ts: Date.now() }));
  Services.prefs.setStringPref(pulsePref, String(pulseBefore + 1));
  const wroteAt = Date.now();
  out.pulse = { before: pulseBefore, after: pulseBefore + 1 };
  const watch = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
    const le = (rep.readers ?? [])[fx.readerIndex]?.lastEdit;
    const fresh = le && typeof le.at === 'number' && le.at > wroteAt - 50;
    watch.push({
      t: Date.now() - t0,
      fresh,
      outcome: fresh ? le.outcome : null,
      changed: fresh ? le.changed : null,
      stage: fresh ? (le.report?.stage ?? null) : null,
      kind: fresh ? (le.report?.last?.kind ?? null) : null,
      held1: (rep.readers ?? [])[fx.readerIndex]?.held?.['1'] ?? null,
    });
    if (fresh && le.outcome === 'handoff' && le.report?.stage === 'committed' && le.report?.last?.kind) break;
    await sleep(150);
  }
  out.watch = watch;
  const repFinal = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  const leFinal = (repFinal.readers ?? [])[fx.readerIndex]?.lastEdit;
  out.lastEdit = leFinal ? {
    at: leFinal.at,
    outcome: leFinal.outcome,
    changed: leFinal.changed,
    kind: leFinal.report?.last?.kind ?? null,
    lastIndex: leFinal.report?.last?.index ?? null,
    lastCharStart: leFinal.report?.last?.charStart ?? null,
    stage: leFinal.report?.stage ?? null,
    prepared: leFinal.report?.prepared ?? null,
  } : null;
  out.held1 = (repFinal.readers ?? [])[fx.readerIndex]?.held?.['1'] ?? null;
  const m2 = safe(() => ir._readAloudManager);
  if (m2 && m2.active && !m2.paused) await Promise.resolve(Components.utils.waiveXrays(m2).pause());
  await sleep(600);
  out.logAfter = await readLogCounts();
  const diff = {};
  for (const key of new Set([...Object.keys(out.logBefore), ...Object.keys(out.logAfter)])) {
    const b = out.logBefore[key] ?? 0;
    const a = out.logAfter[key] ?? 0;
    if (a !== b) diff[key] = { before: b, after: a };
  }
  out.requestDiff = diff;
  state.item8playing = { outcome: out.lastEdit?.outcome, kind: out.lastEdit?.kind, changed: out.lastEdit?.changed };
  return JSON.stringify(out, null, 1);
})()
