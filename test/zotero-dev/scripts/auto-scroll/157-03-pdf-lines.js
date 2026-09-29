// Issue #157 run, item 12 (PDF): Scroll at every line with the word-timed
// memory voice (Fish), Word switch on, reading line 30, mode `line`.
// Samples sentenceInView() fast while the session plays: along one line
// nothing is issued and placedLine holds; the word onto a new line issues
// ONE target, reason `line`, top == placedLine[1] - covered.top -
// (clientHeight - covered.top - covered.bottom - h) * 0.30 clamped;
// a sentence's first pushes read words `coming` with nothing issued; a
// sentence starting on the placed line issues nothing; a page/column change
// issues for the new line. Proves issued decisions against the debug store's
// `[zotero-tts] sentence in view:` lines. Settled offsets are NOT TESTABLE
// (machine, kit Limits). Leaves the session paused, host minimized.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const wordName = 'extensions.zotero.zotero-tts.highlight.word';
  const out = { itemID: slot?.itemID ?? null, errors: [], pushes: [], issues: [], debugLines: [] };
  if (!slot?.itemID) return JSON.stringify({ error: 'no imported PDF in state' });
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) { out.errors.push('select: ' + String(e)); }
  await sleep(400);
  const manager = reader._internalReader._readAloudManager;

  const wordPrefBefore = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
  out.wordPref = wordPrefBefore;
  let wordTouched = false;
  try {
    if (!wordPrefBefore.value) { p.setBoolPref(wordName, true); wordTouched = true; await sleep(300); }
    p.setStringPref(modeName, 'line');
    await sleep(250);
    if (manager?.active && manager.paused) manager.play();
    await sleep(500);

    // Voice/timing gate: the highlight diagnostic's wordTiming must read real
    const hl = () => {
      try {
        const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlight());
        for (const r of rows) if (r?.itemID === slot.itemID) return r;
      } catch (e) { return null; }
      return null;
    };
    const hl1 = hl();
    out.wordTiming = hl1?.wordTiming ?? hl1?.state ?? JSON.stringify(hl1)?.slice(0, 200) ?? null;
    out.wordTimingFull = hl1 ? { wordTiming: hl1.wordTiming ?? null, granularity: hl1.granularity ?? hl1.level ?? null } : null;

    // Fast sampler over sentenceInView()
    const rowFor = () => {
      const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
      let i = -1, k = 0;
      for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
      return rows[i] ?? null;
    };
    const debugLengthBefore = (await Zotero.Debug.get()).length;
    const watchMs = 100000;
    const end = Date.now() + watchMs;
    let lastAt = null, lastHeadJson = null, lastPlaced = null;
    let lineIssues = 0, pageJump = null;
    while (Date.now() < end) {
      const row = rowFor();
      const last = row?.last ?? null;
      const at = last?.at ?? null;
      if (at != null && at !== lastAt) {
        lastAt = at;
        const push = {
          at, reason: last.reason, issued: !!last.issued, top: last.top ?? null,
          words: last.words ?? null, placedLine: last.placedLine ?? null,
          from: last.from ?? null, head: row?.sentence?.head ?? null, cut: row?.sentence?.cut ?? null,
          covered: row?.covered ?? null, viewportH: row?.viewport?.clientHeight ?? null,
          viewportSH: row?.viewport?.scrollHeight ?? null,
        };
        out.pushes.push(push);
        if (push.issued && push.reason === 'line' && push.top != null && push.placedLine) {
          lineIssues++;
          const g = push.placedLine, c = push.covered ?? { top: 0, bottom: 0 }, vh = push.viewportH ?? 0;
          const h = g[3] - g[1];
          const free = vh - c.top - c.bottom;
          const raw = g[1] - c.top - ((free - h) * 30) / 100;
          const max = Math.max(0, (push.viewportSH ?? 0) - vh);
          const expected = Math.max(0, Math.min(max, raw));
          const rec = { n: lineIssues, at, top: push.top, expected, delta: expected - push.top, rawClampNeeded: raw !== expected, words: push.words, placedLine: push.placedLine, from: push.from, headY: push.head ? push.head[1] : null };
          if (lastPlaced != null && Math.abs(g[1] - lastPlaced[1]) > 300) rec.bigJump = g[1] - lastPlaced[1];
          if (rec.bigJump != null && pageJump == null) pageJump = rec;
          out.issues.push(rec);
          lastPlaced = g;
        }
        // same-line sentence start: a new sentence (head value changed) whose
        // first line sits on the currently placed line — expect no issue
        const headJson = push.head ? JSON.stringify(push.head) : null;
        if (headJson && lastHeadJson && headJson !== lastHeadJson && push.placedLine && Math.abs(push.head[1] - push.placedLine[1]) < 2 && !push.issued) {
          out.sameLineStarts = out.sameLineStarts || [];
          out.sameLineStarts.push({ at, words: push.words, reason: push.reason, issued: push.issued, top: push.top, placedLine: push.placedLine, head: push.head });
        }
        if (headJson) lastHeadJson = headJson;
        if (push.words === 'coming') {
          out.coming = out.coming || [];
          if (out.coming.length < 8) out.coming.push({ at, reason: push.reason, issued: push.issued, top: push.top, head: push.head });
        }
      }
      // early exit: enough evidence
      if (lineIssues >= 3 && out.coming?.length >= 1 && out.sameLineStarts?.length >= 1 && pageJump) break;
      if (!manager?.active) { out.sessionEndedEarly = true; break; }
      await sleep(100);
    }
    out.watchMs = watchMs;
    out.pushCount = out.pushes.length;
    out.lineIssueCount = lineIssues;
    const debugAll = await Zotero.Debug.get();
    const tail = debugAll.slice(debugLengthBefore);
    for (const line of tail.split('\n')) if (line.includes('sentence in view:')) { out.debugLines.push(line.trim()); if (out.debugLines.length >= 40) break; }
    out.debugLineCount = out.debugLines.length;

    // Along-line check: pushes between consecutive line issues that read
    // words `word`, no issue, placedLine identical to the previous issue's
    out.alongLine = [];
    let lastIssueIdx = -1;
    let lastIssuePlaced = null;
    for (let i = 0; i < out.pushes.length; i++) {
      const push = out.pushes[i];
      if (push.issued && push.reason === 'line' && push.placedLine) {
        if (lastIssueIdx >= 0) {
          const between = out.pushes.slice(lastIssueIdx + 1, i);
          const wordPushes = between.filter(b => b.words === 'word');
          const badIssue = between.filter(b => b.issued && b.top != null);
          const placedStable = wordPushes.every(b => b.placedLine && lastIssuePlaced && JSON.stringify(b.placedLine) === JSON.stringify(lastIssuePlaced));
          out.alongLine.push({ between: between.length, wordPushes: wordPushes.length, issuedInBetween: badIssue.length, placedStable });
        }
        lastIssueIdx = i; lastIssuePlaced = push.placedLine;
      }
    }

    // Page/column change: the issue whose placedLine jumped (page 2 in container coords)
    out.pageJump = pageJump ? { n: pageJump.n, top: pageJump.top, expected: pageJump.expected, delta: pageJump.delta, bigJump: pageJump.bigJump, headY: pageJump.headY } : null;
    out.pageJumpNote = pageJump ? 'new line placed after a large container-y jump (next page)' : null;
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    if (wordTouched) {
      if (!wordPrefBefore.user) { if (p.prefHasUserValue(wordName)) p.clearUserPref(wordName); }
      else p.setBoolPref(wordName, !!wordPrefBefore.value);
    }
    p.setStringPref(modeName, 'line');
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    await sleep(300);
    out.restored = { mode: p.getStringPref(modeName), wordPref: { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) }, paused: !!manager?.paused, hostMinimized: hostWin ? hostWin.windowState === 2 : null };
  }
  return JSON.stringify(out);
})()
