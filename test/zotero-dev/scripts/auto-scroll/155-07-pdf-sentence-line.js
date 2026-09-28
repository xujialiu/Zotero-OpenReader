// Issue #155 run, items 3 and 10 on the PDF (2026-09-29, 1.16.2-beta2).
// In Scroll at every sentence at line 10, every new fitting sentence's issued
// target (last.top) must equal whole.top − covered.top − (clientHeight −
// covered.top − covered.bottom − height) × line/100 within 1 px, or sit at a
// clamp bound. At least two sentences must advance by natural audio. Then a
// line change to 90 while a sentence is followed must issue one new target
// at once with the 90 value. Pauses at the end; restores line 10.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const lineName = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  const out = { itemID: slot?.itemID ?? null, errors: [], targets: [] };
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot?.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  const manager = reader._internalReader._readAloudManager;

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
    } catch (e) { /* one miss is not fatal */ }
    return null;
  };
  const expectedFor = (sv, line) => {
    const g = sv?.sentence?.whole, v = sv?.viewport, c = sv?.covered ?? { top: 0, bottom: 0 };
    if (!g || !v) return null;
    const h = g[3] - g[1];
    const vh = v.clientHeight - c.top - c.bottom;
    const raw = g[1] - c.top - ((vh - h) * line) / 100;
    const max = Math.max(0, v.scrollHeight - v.clientHeight);
    return { raw, clamped: Math.max(0, Math.min(max, raw)), h, vh, max, fits: sv.sentence?.fits ?? null };
  };

  try {
    // Sentence mode at line 10, set through the prefs the pane writes
    p.setStringPref(modeName, 'sentence');
    p.setIntPref(lineName, 10);
    await sleep(600); // pref observers re-place the current sentence
    let { d, s } = rowsFor();
    out.patchedNow = d?.patched ?? null;
    out.modeEntryTarget = d?.last ? { at: d.last.at, reason: d.last.reason, top: d.last.top, issued: d.last.issued, from: d.last.from } : null;
    out.modeEntryExpected = expectedFor(s, 10);
    if (out.modeEntryTarget?.top != null && out.modeEntryExpected) {
      out.modeEntryDelta = out.modeEntryExpected.clamped - out.modeEntryTarget.top;
    }

    // Resume the paused session and let audio advance the sentences
    let playError = null;
    try { if (manager?.active && manager.paused) manager.play(); } catch (e) { playError = String(e); }
    out.playError = playError;

    const seenPositions = new Set();
    let lastAt = null;
    const deadline = Date.now() + 100000;
    const perSentence = new Map();
    while (Date.now() < deadline) {
      const e = engineRow();
      const pos = e?.session?.position ?? null;
      const r = rowsFor();
      const at = r.d?.last?.at ?? null;
      if (at !== lastAt && r.d?.last) {
        lastAt = at;
        const exp = expectedFor(r.s, 10);
        const rec = {
          position: pos, playbackTime: e?.session?.playbackTime ?? null, audioState: e?.audio?.state ?? null,
          reason: r.d.last.reason, issued: r.d.last.issued, top: r.d.last.top, from: r.d.last.from,
          whole: r.s?.sentence?.whole ?? null, covered: r.s?.covered ?? null, viewport: r.s?.viewport ?? null,
          fits: r.s?.sentence?.fits ?? null, expected: exp, line: r.d?.line ?? null,
        };
        rec.delta = (rec.top != null && exp) ? exp.clamped - rec.top : null;
        out.targets.push(rec);
      }
      if (pos != null) {
        seenPositions.add(pos);
        const arr = perSentence.get(pos) ?? [];
        arr.push(at);
        perSentence.set(pos, arr);
      }
      const issuedSentenceTargets = out.targets.filter(t => t.issued === true && t.reason === 'sentence').length;
      if (issuedSentenceTargets >= 3 && seenPositions.size >= 3) break;
      await sleep(400);
    }
    out.distinctPositions = [...seenPositions];
    const e = engineRow();
    out.advance = {
      position: e?.session?.position ?? null,
      playbackTimeFirst: out.targets[0]?.playbackTime ?? null,
      playbackTimeLast: out.targets[out.targets.length - 1]?.playbackTime ?? null,
      audioStates: [...new Set(out.targets.map(t => t.audioState))],
    };
    // Repeated pushes inside one sentence must not retarget: unique last.at per position
    out.uniqueTargetsPerPosition = [...perSentence.entries()].map(([pos, ats]) => ({ position: pos, pushes: ats.length, uniqueLasts: [...new Set(ats)].length }));

    // Line change to 90 while a sentence is followed: one new target at once
    const beforeChange = rowsFor();
    out.beforeChange = { position: engineRow()?.session?.position ?? null, lastAt: beforeChange.d?.last?.at ?? null, top: beforeChange.d?.last?.top ?? null, following: beforeChange.d?.following ?? null };
    p.setIntPref(lineName, 90);
    await sleep(200);
    const afterChange = rowsFor();
    await sleep(700);
    const settled = rowsFor();
    const exp90 = expectedFor(afterChange.s, 90);
    out.lineChange = {
      newAt: afterChange.d?.last?.at ?? null,
      changed: (afterChange.d?.last?.at ?? null) !== out.beforeChange.lastAt,
      reason: afterChange.d?.last?.reason ?? null, issued: afterChange.d?.last?.issued ?? null,
      top: afterChange.d?.last?.top ?? null, line: afterChange.d?.line ?? null,
      expected: exp90,
      delta: (afterChange.d?.last?.top != null && exp90) ? exp90.clamped - afterChange.d.last.top : null,
      stableAfter700ms: (settled.d?.last?.at ?? null) === (afterChange.d?.last?.at ?? null),
      sentenceUnchanged: (engineRow()?.session?.position ?? null) === out.beforeChange.position,
    };
  } finally {
    // Pause and put the line back to 10 for the outside-mode checks
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    p.setIntPref(lineName, 10);
    await sleep(250);
    const r = rowsFor();
    out.afterPause = { paused: !!manager?.paused, line: r.d?.line ?? null, lastReason: r.d?.last?.reason ?? null };
  }
  return JSON.stringify(out);
})()
