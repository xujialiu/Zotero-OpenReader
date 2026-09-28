// Issue #155 run, items 3+10 completion on the PDF (2026-09-29, 1.16.2-beta2).
// The `last` diagnostic row is overwritten by every word push, so issued
// decisions are caught by fast sampling and PROVEN by the container's settled
// scrollTop ~1.5 s after each change. Covers: line 90 re-place while followed
// (clamps to 0 on the first-page sentence), back to 10, forward sentences
// with more entry targets at line 10, the 50 = centering equivalence, and
// the issued-decision stream. Leaves the session paused at line 10.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const lineName = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const out = { itemID: slot?.itemID ?? null, errors: [], decisions: [] };
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot?.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  const manager = reader._internalReader._readAloudManager;
  const container = () => reader._internalReader._primaryView?._iframeWindow?.document?.getElementById('viewerContainer');

  const rowsFor = () => {
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return { d: d[i] ?? null, s: s[i] ?? null };
  };
  const engineRow = () => {
    try {
      const list = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers ?? [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === slot.itemID) return list[i] ?? null;
    } catch (e) { return null; }
    return null;
  };
  const expectedFor = (sv, line) => {
    const g = sv?.sentence?.whole, v = sv?.viewport, c = sv?.covered ?? { top: 0, bottom: 0 };
    if (!g || !v) return null;
    const h = g[3] - g[1];
    const vh = v.clientHeight - c.top - c.bottom;
    const raw = g[1] - c.top - ((vh - h) * line) / 100;
    const max = Math.max(0, v.scrollHeight - v.clientHeight);
    const centering = (g[1] + g[3]) / 2 - vh / 2 - c.top;
    return { raw, clamped: Math.max(0, Math.min(max, raw)), centeringRaw: centering, centeringClamped: Math.max(0, Math.min(max, centering)), h, vh, max };
  };
  // Sample one change: catch issued decisions, then wait for the view to settle
  const watch = async (label, seconds) => {
    const end = Date.now() + seconds * 1000;
    let lastAt = null;
    const scrollTrail = [];
    let settled = null;
    while (Date.now() < end) {
      const c = container();
      const st = c ? c.scrollTop : null;
      scrollTrail.push(st);
      const { d } = rowsFor();
      const at = d?.last?.at ?? null;
      if (at !== lastAt) {
        lastAt = at;
        if (d?.last?.issued) out.decisions.push({ label, at, reason: d.last.reason, top: d.last.top, from: d.last.from });
      }
      const n = scrollTrail.length;
      if (n >= 6) {
        const tail = scrollTrail.slice(-3);
        if (Math.max(...tail) - Math.min(...tail) < 0.5) { settled = tail[0]; break; }
      }
      await sleep(120);
    }
    const finite = scrollTrail.filter(v => v != null);
    return { label, settled: settled ?? finite[finite.length - 1] ?? null, moved: finite.length ? Math.max(...finite) - Math.min(...finite) : null, first: finite[0] ?? null, samples: finite.length };
  };

  try {
    // Resume and let the view settle at line 10 on the current sentence
    if (manager?.active && manager.paused) manager.play();
    await sleep(400);
    let geo = rowsFor().s;
    const exp10 = expectedFor(geo, 10);
    const baseline = await watch('resume-line10', 2.5);
    out.start = { position: engineRow()?.session?.position ?? null, expected10: exp10, ...baseline };

    // Line 90 while followed: re-place at once, clamped to 0 on this sentence
    p.setIntPref(lineName, 90);
    const w90 = await watch('line-90', 2.5);
    out.line90 = { expected: expectedFor(geo, 90), ...w90 };
    out.line90.delta = (out.line90.settled != null && out.line90.expected) ? out.line90.expected.clamped - out.line90.settled : null;

    // Back to 10
    p.setIntPref(lineName, 10);
    const w10 = await watch('line-10-again', 2.5);
    out.line10Again = { expected: exp10, ...w10 };
    out.line10Again.delta = (out.line10Again.settled != null) ? exp10.clamped - out.line10Again.settled : null;

    // Play forward to a sentence deep enough that 50 and 90 differ clearly
    const deadline = Date.now() + 75000;
    let deep = null;
    while (Date.now() < deadline) {
      const g = rowsFor().s;
      const e = expectedFor(g, 10);
      if (e && e.raw > 500 && e.clamped === e.raw && !g.sentence?.cut) { deep = { geometry: g, expected: e }; break; }
      await sleep(500);
    }
    out.deep = deep ? {
      position: engineRow()?.session?.position ?? null,
      whole: deep.geometry?.sentence?.whole ?? null, covered: deep.geometry?.covered ?? null,
      expected10: deep.expected, playbackTime: engineRow()?.session?.playbackTime ?? null,
    } : { found: false };
    if (deep) {
      await sleep(800); // let its entry target land and the animation finish
      // 50 must equal the old centering, on a sentence with headroom both ways
      p.setIntPref(lineName, 50);
      const w50 = await watch('line-50-centering', 2.5);
      out.line50 = { expected: expectedFor(deep.geometry, 50), ...w50 };
      out.line50.delta = (out.line50.settled != null && out.line50.expected) ? out.line50.expected.centeringClamped - out.line50.settled : null;
      out.line50.equalsOldCenteringFormula = out.line50.delta != null && Math.abs(out.line50.delta) <= 1;
      // and back to 10
      p.setIntPref(lineName, 10);
      const wD10 = await watch('line-10-deep', 2.5);
      out.line10Deep = { expected: deep.expected, ...wD10 };
      out.line10Deep.delta = (out.line10Deep.settled != null) ? deep.expected.clamped - out.line10Deep.settled : null;
    }
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    p.setIntPref(lineName, 10);
    await sleep(300);
    out.afterPause = { paused: !!manager?.paused, line: p.getIntPref(lineName, -1), mode: p.getStringPref(modeName), position: engineRow()?.session?.position ?? null };
  }
  return JSON.stringify(out);
})()
