// Issue #157 run, item 15: the paginated EPUB at every line. With the
// word-timed voice, a word moving WITHIN the page turns nothing (no `last`
// change, offset still); the word reaching the NEXT page navigates once
// (last.reason `page`). The follow is verified in A (`following: true`)
// before the watch; a bounded natural-reading watch only — no contrived
// jumps. If no word crosses a page within it, the crossing half is
// NOT TESTABLE (no natural crossing observed). Pauses at the end.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.epub;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const waive = Components.utils.waiveXrays;
  const out = { itemID: slot?.itemID ?? null, errors: [], samples: [] };
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'EPUB not open' });
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
  await sleep(300);
  const internal = reader._internalReader;
  const manager = internal._readAloudManager;
  const view = internal._primaryView;
  const rowFor = () => { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); let i = -1, k = 0; for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; } return rows[i] ?? null; };
  const eng = () => { try { const list = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers ?? []; for (const r of list) if (r.itemID === slot.itemID) return r; } catch (e) {} return null; };
  const flowState = () => { try { const f = view.flow; return { offset: f?._offsetLeft ?? null, section: f?._currentSectionIndex ?? null }; } catch (e) { return { offset: null, section: null }; } };
  try {
    p.setStringPref(modeName, 'line');
    await sleep(250);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);
    try { await view.setFlowMode('paginated'); } catch (e) { out.errors.push('flow: ' + String(e)); }
    await sleep(1000);
    out.flow = view?.flowMode ?? null;
    out.start = flowState();
    if (rowFor()?.following !== true) {
      const tipM = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      tipM.beginInputTransactionForTests(hostWin);
      const evM = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
      tipM.keydown(evM('keydown', 'Shift', 'ShiftLeft', 16, {}));
      tipM.keydown(evM('keydown', 'M', 'KeyM', 77, { shiftKey: true }));
      tipM.keyup(evM('keyup', 'M', 'KeyM', 77, { shiftKey: true }));
      tipM.keyup(evM('keyup', 'Shift', 'ShiftLeft', 16, {}));
      await sleep(500);
      out.reengaged = true;
    }
    out.following = rowFor()?.following ?? null;
    const posBefore = eng()?.session?.position ?? null;
    try { if (manager?.active && manager.paused) manager.play(); } catch (e) { out.errors.push('play: ' + String(e)); }
    // Bounded natural watch: 40 s, no jumps
    const end = Date.now() + 40000;
    let lastAt = rowFor()?.last?.at ?? null;
    let pageDecisions = 0, otherDecisions = 0, offsetChanges = 0;
    let lastOffset = out.start.offset;
    while (Date.now() < end) {
      const row = rowFor();
      const at = row?.last?.at ?? null;
      const f = flowState();
      if (f.offset !== lastOffset) { offsetChanges++; lastOffset = f.offset; }
      if (at != null && at !== lastAt) {
        lastAt = at;
        if (row?.last?.reason === 'page') { pageDecisions++; out.pageDecision = { at, reason: row.last.reason, words: row?.words ?? null, placedY: row?.placedLine ? Math.round(row.placedLine[1]) : null, offsetBefore: out.samples.length ? out.samples[out.samples.length - 1].offset : null, offset: f.offset, pos: eng()?.session?.position ?? null }; }
        else otherDecisions++;
        if (out.samples.length < 30 || row?.last?.reason === 'page') out.samples.push({ at, reason: row?.last?.reason ?? null, words: row?.words ?? null, offset: f.offset, pos: eng()?.session?.position ?? null });
      }
      if (!manager?.active) { out.endedEarly = true; break; }
      await sleep(150);
    }
    out.counts = { pageDecisions, otherDecisions, offsetChanges, posAfter: eng()?.session?.position ?? null };
    out.end = { flow: flowState(), paused: (() => { try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {} return !!manager?.paused; })() };
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    p.setStringPref(modeName, 'line');
    await sleep(250);
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    out.restored = { mode: p.getStringPref(modeName), paused: !!manager?.paused, flow: view?.flowMode ?? null, hostMinimized: hostWin ? hostWin.windowState === 2 : null };
  }
  return JSON.stringify(out);
})()
