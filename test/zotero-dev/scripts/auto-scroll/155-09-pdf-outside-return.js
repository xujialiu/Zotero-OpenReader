// Issue #155 run, items 2+10 completion on the PDF, second attempt
// (2026-09-29, 1.16.2-beta2). Fixes from the first attempt: repositionTo
// starts playback, so each step re-pauses; page-2 sentences are always
// `cut` on this machine (the view physically never moves), so the deep
// sentence needs no visibility condition. Evidence: issued decisions caught
// by fast sampling with the geometry read at the same tick, plus the
// `[zotero-tts] sentence in view:` debug lines. Covers the deep sentence's
// line-10 entry, 50 = old centering, outside mode (visible: nothing issued,
// not even on a line change; clipped under the docked Top bar: a cut target
// to the line) and the paused Shift+R return. Leaves mode outside, paused.
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
  const pauseIfPlaying = async () => { try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {} };

  const rowsFor = () => {
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return { d: d[i] ?? null, s: s[i] ?? null };
  };
  const expectedFor = (sv, line) => {
    const g = sv?.sentence?.whole, v = sv?.viewport, c = sv?.covered ?? { top: 0, bottom: 0 };
    if (!g || !v) return null;
    const h = g[3] - g[1];
    const vh = v.clientHeight - c.top - c.bottom;
    const raw = g[1] - c.top - ((vh - h) * line) / 100;
    const max = Math.max(0, v.scrollHeight - v.clientHeight);
    const centering = (g[1] + g[3]) / 2 - vh / 2 - c.top;
    return { raw, clamped: Math.max(0, Math.min(max, raw)), centeringRaw: centering, centeringClamped: Math.max(0, Math.min(max, centering)), h, vh, coveredTop: c.top, max };
  };
  const watchDecisions = async (seconds) => {
    const end = Date.now() + seconds * 1000;
    let lastAt = null;
    while (Date.now() < end) {
      const { d, s } = rowsFor();
      const at = d?.last?.at ?? null;
      if (at !== lastAt && d?.last) {
        lastAt = at;
        if (d.last.issued) {
          const e = expectedFor(s, p.getIntPref(lineName, 10));
          out.decisions.push({ reason: d.last.reason, top: d.last.top, from: d.last.from,
            whole: s?.sentence?.whole ?? null, coveredTop: s?.covered?.top ?? null,
            expected: e, delta: (d.last.top != null && e) ? e.clamped - d.last.top : null });
        }
      }
      await sleep(90);
    }
  };

  try {
    p.setIntPref(lineName, 10);
    p.setStringPref(modeName, 'sentence');
    await pauseIfPlaying();
    await sleep(300);

    // Debug-store corroboration of the issued scrolls so far
    try {
      const log = await Zotero.Debug.get();
      const lines = (log.split('\n').filter(l => l.includes('sentence in view')) ?? []);
      out.debugLines = { count: lines.length, last3: lines.slice(-3).map(l => l.slice(-160)) };
    } catch (e) { out.errors.push('debug: ' + String(e)); }

    // Does a direct scrollTop assignment stick on this machine?
    const c0 = container();
    const before = c0.scrollTop;
    c0.scrollTop = Math.min(before + 400, c0.scrollHeight);
    await sleep(120);
    out.scrollStickTest = { before, after: c0.scrollTop, sticks: Math.abs(c0.scrollTop - (before + 400)) < 5 };
    c0.scrollTop = before;
    await sleep(120);

    // Deep sentence: repositionTo walk, re-pausing after every step
    let segments = 0;
    try { segments = manager?.segments?.length ?? manager?._segments?.length ?? 0; } catch (e) {}
    out.segments = segments;
    let deepIndex = null, deepGeometry = null;
    const walk = [];
    for (let idx = 0; idx < Math.min(segments || 25, 40); idx++) {
      try { manager.repositionTo(idx); } catch (e) { out.errors.push('reposition ' + idx + ': ' + String(e)); break; }
      await sleep(220);
      await pauseIfPlaying();
      await sleep(140);
      const { s } = rowsFor();
      const e = expectedFor(s, 10);
      walk.push({ idx, top: s?.sentence?.whole?.[1] ?? null, raw: e?.raw ?? null, cut: s?.sentence?.cut ?? null });
      if (e && e.raw > 500 && e.clamped === e.raw) { deepIndex = idx; deepGeometry = s; break; }
    }
    out.walkTail = walk.slice(-4);
    out.deep = deepIndex != null ? {
      index: deepIndex,
      whole: deepGeometry?.sentence?.whole ?? null, covered: deepGeometry?.covered ?? null,
      cut: deepGeometry?.sentence?.cut ?? null, fits: deepGeometry?.sentence?.fits ?? null,
      expected10: expectedFor(deepGeometry, 10),
    } : { found: false };
    if (deepIndex == null) return JSON.stringify({ ...out, error: 'no deep sentence found' });

    // Resume: entry target of the deep sentence at line 10
    if (manager?.active && manager.paused) manager.play();
    await watchDecisions(4);
    // 50 = the old centering on the same sentence
    p.setIntPref(lineName, 50);
    await watchDecisions(2.5);
    // and back to 10
    p.setIntPref(lineName, 10);
    await watchDecisions(2.5);
    await pauseIfPlaying();
    await sleep(250);

    // Outside mode with a VISIBLE page-1 sentence: nothing issued, even on a line change
    try { manager.repositionTo(2); } catch (e) { out.errors.push('reposition 2: ' + String(e)); }
    await sleep(220);
    await pauseIfPlaying();
    await sleep(200);
    p.setStringPref(modeName, 'outside');
    await sleep(350);
    const decisionsBeforeOutside = out.decisions.length;
    if (manager?.active && manager.paused) manager.play();
    await watchDecisions(3);
    p.setIntPref(lineName, 90);
    await watchDecisions(2);
    p.setIntPref(lineName, 10);
    await watchDecisions(2);
    out.outsideVisible = { issuedDecisions: out.decisions.length - decisionsBeforeOutside, scrollTop: container()?.scrollTop ?? null };

    // Clip under the docked Top bar (covered.top 34): cut target to the line
    const { s: clipGeo } = rowsFor();
    const whole = clipGeo?.sentence?.whole;
    if (whole && out.scrollStickTest?.sticks) {
      const target = Math.max(0, Math.round(whole[1] - 12));
      container().scrollTop = target;
      await sleep(200);
      out.clipArrange = { target, actual: container()?.scrollTop ?? null, sentenceTop: whole[1] };
      const mark = out.decisions.length;
      await watchDecisions(4);
      out.clipped = out.decisions.slice(mark);
    } else {
      out.clipped = { skipped: !out.scrollStickTest?.sticks ? 'scrollTop assignment does not stick (machine)' : 'no geometry' };
    }

    // Paused Shift+R: one return to the line, A/M untouched
    await pauseIfPlaying();
    await sleep(300);
    const followingBefore = rowsFor().d?.following ?? null;
    const modeBefore = p.getStringPref(modeName);
    const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
    try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
    await sleep(250);
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(hostWin);
    const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', 'R', 'KeyR', 82, { shiftKey: true }));
    tip.keyup(ev('keyup', 'R', 'KeyR', 82, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    await watchDecisions(3);
    const recR = out.decisions.filter(d => d.reason === 'return').pop() ?? null;
    out.shiftR = {
      decision: recR ? { top: recR.top, expected: recR.expected, delta: recR.delta } : null,
      following: rowsFor().d?.following ?? null, followingUnchanged: (rowsFor().d?.following ?? null) === followingBefore,
      modeUnchanged: p.getStringPref(modeName) === modeBefore, paused: !!manager?.paused,
    };
  } finally {
    await pauseIfPlaying();
    p.setIntPref(lineName, 10);
    await sleep(250);
    out.after = { paused: !!manager?.paused, line: p.getIntPref(lineName, -1), mode: p.getStringPref(modeName) };
  }
  return JSON.stringify(out);
})()
