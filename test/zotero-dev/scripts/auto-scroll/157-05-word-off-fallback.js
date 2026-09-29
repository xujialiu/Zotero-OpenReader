// Issue #157 run, item 13: the fallback without a highlighted word.
// Trusted Shift+W turns the Word switch off on the PDF: the rows read
// words `sentence` and each NEW sentence issues one target — the sentence
// placed whole at the reading line (the fallback branch labels the reason
// `cut` with mode `line`) — and nothing inside it. Shift+W back on issues
// the current word's line at once (reason `line`, words `word`). Restores
// the pref byte-identical (the baseline held no user value) and Zotero's
// own highlight level. Leaves the session paused, host minimized.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const wordName = 'extensions.zotero.zotero-tts.highlight.word';
  const out = { itemID: slot?.itemID ?? null, errors: [], off: [], on: [] };
  if (!slot?.itemID) return JSON.stringify({ error: 'no imported PDF in state' });
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
  await sleep(300);
  const manager = reader._internalReader._readAloudManager;
  const wordBefore = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
  out.wordBefore = wordBefore;

  const rowFor = () => {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return rows[i] ?? null;
  };
  const gran = () => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlight()); for (const r of rows) if (r?.itemID === slot.itemID) return (r.views ?? [])[0]?.state?.highlightGranularity ?? null; } catch (e) {} return null; };

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(hostWin);
  const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
  const pressShiftW = () => {
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    const r = tip.keydown(ev('keydown', 'W', 'KeyW', 87, { shiftKey: true }));
    tip.keyup(ev('keyup', 'W', 'KeyW', 87, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    return r;
  };

  try {
    p.setStringPref(modeName, 'line');
    await sleep(250);
    out.granBefore = gran();
    // Start mid-document: a watch that runs into the document's end sees no
    // pushes at all (the 1.16.2-beta4 run's on-watch died that way)
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(250);
    try { manager.repositionTo(4); } catch (e) { out.errors.push('reposition: ' + String(e)); }
    await sleep(600);
    try { if (manager?.active && manager.paused) manager.play(); } catch (e) { out.errors.push('resume: ' + String(e)); }
    await sleep(400);

    // Word OFF
    out.offRet = pressShiftW();
    await sleep(450);
    out.wordAfterOff = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
    out.granAfterOff = gran();

    // Watch the fallback: new sentences issue once, words `sentence`
    const endOff = Date.now() + 27000;
    let lastAt = rowFor()?.last?.at ?? null;
    let cutIssues = 0;
    while (Date.now() < endOff) {
      const row = rowFor();
      const last = row?.last ?? null;
      if (last && last.at !== lastAt) {
        lastAt = last.at;
        const g = row?.sentence?.whole ?? null;
        const c = row?.covered ?? { top: 0, bottom: 0 };
        const vh = row?.viewport?.clientHeight ?? 0;
        let expected = null;
        if (g && vh) {
          const h = g[3] - g[1];
          const free = vh - c.top - c.bottom;
          const raw = g[1] - c.top - ((free - h) * 30) / 100;
          const max = Math.max(0, (row?.viewport?.scrollHeight ?? 0) - vh);
          expected = Math.max(0, Math.min(max, raw));
        }
        const rec = { at: last.at, reason: last.reason, issued: !!last.issued, top: last.top ?? null, words: last.words ?? null, placedLine: last.placedLine ?? null, sentenceH: g ? Math.round(g[3] - g[1]) : null, expected, delta: (expected != null && last.top != null && last.issued) ? expected - last.top : null };
        out.off.push(rec);
        if (rec.issued && rec.words === 'sentence') cutIssues++;
      }
      if (!manager?.active) { out.endedEarlyOff = true; break; }
      await sleep(100);
    }
    out.cutIssueCount = cutIssues;

    // Word back ON mid-sentence: the current word's line issues at once
    out.onRet = pressShiftW();
    await sleep(450);
    out.wordAfterOn = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
    const endOn = Date.now() + 9000;
    let lastAt2 = rowFor()?.last?.at ?? null;
    while (Date.now() < endOn) {
      const row = rowFor();
      const last = row?.last ?? null;
      if (last && last.at !== lastAt2) {
        lastAt2 = last.at;
        const g = last.placedLine ?? null;
        const c = row?.covered ?? { top: 0, bottom: 0 };
        const vh = row?.viewport?.clientHeight ?? 0;
        let expected = null;
        if (g && vh) {
          const h = g[3] - g[1];
          const free = vh - c.top - c.bottom;
          const raw = g[1] - c.top - ((free - h) * 30) / 100;
          const max = Math.max(0, (row?.viewport?.scrollHeight ?? 0) - vh);
          expected = Math.max(0, Math.min(max, raw));
        }
        out.on.push({ at: last.at, reason: last.reason, issued: !!last.issued, top: last.top ?? null, words: last.words ?? null, placedLine: last.placedLine ?? null, expected, delta: (expected != null && last.top != null && last.issued) ? expected - last.top : null });
        if (out.on.length >= 4) break;
      }
      await sleep(90);
    }
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    // Byte-identical restore of the Word switch
    if (!wordBefore.user && p.prefHasUserValue(wordName)) p.clearUserPref(wordName);
    else if (wordBefore.user) p.setBoolPref(wordName, !!wordBefore.value);
    p.setStringPref(modeName, 'line');
    await sleep(250);
    out.granAfterRestore = gran();
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    await sleep(300);
    out.restored = { word: { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) }, mode: p.getStringPref(modeName), paused: !!manager?.paused, hostMinimized: hostWin ? hostWin.windowState === 2 : null };
  }
  return JSON.stringify(out);
})()
