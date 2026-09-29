// Issue #157 run, items 13 completion + 14: (A) the Word switch back ON
// issues the current word's line at once (reason `line`, words `word`,
// delta 0 against the line formula) — the first attempt played past the
// document's end, so this repositions first; (B) trusted Shift+R while a
// word is active re-issues its line's target with reason `return` even
// when that line was already placed, A/M and paused state untouched.
// Restores the Word switch byte-identical; leaves the session paused.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const wordName = 'extensions.zotero.zotero-tts.highlight.word';
  const out = { itemID: slot?.itemID ?? null, errors: [], onWatch: [], returnWatch: [] };
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'PDF reader not open' });
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
  await sleep(300);
  const manager = reader._internalReader._readAloudManager;
  const wordBefore = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
  const rowFor = () => {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return rows[i] ?? null;
  };
  const eng = () => { try { const list = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers ?? []; for (const r of list) if (r.itemID === slot.itemID) return r; } catch (e) {} return null; };
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(hostWin);
  const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
  const press = (key, code, kc) => {
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    const r = tip.keydown(ev('keydown', key, code, kc, { shiftKey: true }));
    tip.keyup(ev('keyup', key, code, kc, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    return r;
  };
  const expectedFor = (row, g) => {
    const c = row?.covered ?? { top: 0, bottom: 0 };
    const vh = row?.viewport?.clientHeight ?? 0;
    if (!g || !vh) return null;
    const h = g[3] - g[1];
    const free = vh - c.top - c.bottom;
    const raw = g[1] - c.top - ((free - h) * 30) / 100;
    const max = Math.max(0, (row?.viewport?.scrollHeight ?? 0) - vh);
    return Math.max(0, Math.min(max, raw));
  };
  try {
    p.setStringPref(modeName, 'line');
    await sleep(250);
    // A: reposition into the document, word OFF for one push, then ON
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(250);
    try { manager.repositionTo(4); } catch (e) { out.errors.push('reposition: ' + String(e)); }
    await sleep(700);
    p.setBoolPref(wordName, false);
    await sleep(250);
    try { if (manager?.active && manager.paused) manager.play(); } catch (e) {}
    await sleep(1800); // a few pushes under `sentence`
    out.onRet = press('W', 'KeyW', 87);
    await sleep(350);
    out.wordAfterOn = { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) };
    const endOn = Date.now() + 9000;
    let lastAt = rowFor()?.last?.at ?? null;
    while (Date.now() < endOn && out.onWatch.length < 3) {
      const row = rowFor();
      const last = row?.last ?? null;
      if (last && last.at !== lastAt) {
        lastAt = last.at;
        out.onWatch.push({ at: last.at, reason: last.reason, issued: !!last.issued, top: last.top ?? null, words: last.words ?? null, placedY: last.placedLine ? Math.round(last.placedLine[1]) : null, expected: expectedFor(row, last.placedLine), delta: (last.issued && last.top != null && last.placedLine) ? expectedFor(row, last.placedLine) - last.top : null });
      }
      await sleep(90);
    }
    // B: pause, note the placed line, Shift+R: re-issues the word's line as `return`
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(500);
    const before = { following: (() => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); for (const r of rows) if (r?.kind === 'pdf') return r.following ?? null; } catch (e) {} return null; })(), paused: !!manager?.paused, mode: p.getStringPref(modeName), lastAt: rowFor()?.last?.at ?? null, placedY: rowFor()?.last?.placedLine ? Math.round(rowFor().last.placedLine[1]) : null, position: eng()?.session?.position ?? null };
    out.before = before;
    out.rRet = press('R', 'KeyR', 82);
    await sleep(350);
    const endR = Date.now() + 6000;
    let lastAt2 = before.lastAt;
    while (Date.now() < endR && out.returnWatch.length < 3) {
      const row = rowFor();
      const last = row?.last ?? null;
      if (last && last.at !== lastAt2) {
        lastAt2 = last.at;
        out.returnWatch.push({ at: last.at, reason: last.reason, issued: !!last.issued, top: last.top ?? null, words: last.words ?? null, placedY: last.placedLine ? Math.round(last.placedLine[1]) : null, expected: expectedFor(row, last.placedLine), delta: (last.issued && last.top != null && last.placedLine) ? expectedFor(row, last.placedLine) - last.top : null });
      }
      await sleep(90);
    }
    await sleep(400);
    const after = { following: (() => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()); for (const r of rows) if (r?.kind === 'pdf') return r.following ?? null; } catch (e) {} return null; })(), paused: !!manager?.paused, mode: p.getStringPref(modeName), position: eng()?.session?.position ?? null };
    out.after = after;
    out.unchanged = { followingSame: before.following === after.following, modeSame: before.mode === after.mode, pausedStill: before.paused === after.paused && after.paused === true, positionSame: before.position === after.position };
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    if (!wordBefore.user && p.prefHasUserValue(wordName)) p.clearUserPref(wordName);
    else if (wordBefore.user) p.setBoolPref(wordName, !!wordBefore.value);
    p.setStringPref(modeName, 'line');
    await sleep(250);
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    await sleep(300);
    out.restored = { word: { value: p.getBoolPref(wordName), user: p.prefHasUserValue(wordName) }, mode: p.getStringPref(modeName), paused: !!manager?.paused, hostMinimized: hostWin ? hostWin.windowState === 2 : null };
  }
  return JSON.stringify(out);
})()
