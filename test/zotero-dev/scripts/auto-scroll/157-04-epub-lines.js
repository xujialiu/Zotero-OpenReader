// Issue #157 run, item 12 (scrolled EPUB): Scroll at every line through
// diagnostics.autoScroll()'s EPUB row (words, placedLine, last.reason/top).
// Word-timed memory voice, Word switch on, mode `line`, reading line 30.
// The EPUB follow runs only with the player popup open (ensured here); its
// `last` carries issued scrolls only, so "nothing issued" is a still `at`.
// Expected: along one line words `word`, placedLine holds, last unchanged;
// the word onto a new line issues once, reason `line`, top == placedLine[1]
// - covered.top - (clientHeight - covered.top - covered.bottom - h) * 0.30
// clamped; a sentence's first pushes read `coming` with no decision.
// Settled offsets are NOT TESTABLE (machine, kit Limits). Leaves the EPUB
// session paused in scrolled flow with the popup open (157-07 continues).
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.epub;
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const waive = Components.utils.waiveXrays;
  const out = { itemID: slot?.itemID ?? null, errors: [], decisions: [], wordsLog: [] };
  if (!slot?.itemID) return JSON.stringify({ error: 'no imported EPUB in state' });
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  if (hostWin?.windowState === 2) { hostWin.restore(); await sleep(600); }

  p.setStringPref(modeName, 'line');
  await Zotero.Reader.open(slot.itemID);
  const deadline = Date.now() + 24000;
  let reader = null;
  while (Date.now() < deadline) {
    reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID) ?? null;
    if (reader?._internalReader && reader._internalReader?._readAloudManager) break;
    await sleep(700);
  }
  if (!reader) return JSON.stringify({ ...out, error: 'EPUB reader did not open within 24s' });
  const internal = reader._internalReader;
  await sleep(900);
  const view = internal._primaryView;
  try { if (view?.flowMode !== 'scrolled') await view.setFlowMode('scrolled'); } catch (e) { out.errors.push('flow: ' + String(e)); }
  await sleep(700);
  out.flow = view?.flowMode ?? null;

  // Tab selected, muted session, popup open (the dom follow's gate)
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) { out.errors.push('select: ' + String(e)); }
  await sleep(300);
  const manager = internal._readAloudManager;
  if (!manager?.active) {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(hostWin);
    const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    const activeBy = Date.now() + 9000;
    while (Date.now() < activeBy && !manager?.active) await sleep(400);
  }
  const playerRow = async () => {
    try {
      const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.players());
      const list = Array.isArray(raw) ? raw : [...(raw.before ?? []), ...(raw.after ?? [])];
      for (const r of list) if (r.itemID === slot.itemID) return r;
    } catch (e) {}
    return null;
  };
  let toggles = 0;
  while ((await playerRow())?.popupOpen !== true && toggles < 3) {
    try { internal.toggleReadAloudPopup(true); } catch (e) { out.errors.push('popup: ' + String(e)); }
    toggles++;
    await sleep(700);
  }
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
  await sleep(400);
  out.session = { active: !!manager?.active, paused: !!manager?.paused, popupOpen: (await playerRow())?.popupOpen ?? null };

  const rowFor = () => {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return rows[i] ?? null;
  };

  // The follow must hold A intent (following: true); a stuck M never follows.
  // Re-engage with a trusted Shift+M when needed (issue #153's manual intent).
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
  const row = rowFor();
  out.patched = row?.patched ?? null;
  out.rowFields = row ? { hasWords: 'words' in row, hasPlacedLine: 'placedLine' in row, line: row.line ?? null, mode: row.mode ?? null } : null;
  if (row?.patched !== true) return JSON.stringify({ ...out, error: 'EPUB follow not patched' });
  out.wordTiming = (() => { try { const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlight()); for (const r of rows) if (r?.itemID === slot.itemID) { const v = (r.views ?? [])[0]; return v?.activeWordTimestamp ?? null; } } catch (e) {} return null; })();

  const metrics = () => {
    try {
      const win = waive(view).iframeWindow;
      const doc = win.document;
      return {
        height: doc.documentElement.clientHeight || win.innerHeight,
        scrollH: (doc.scrollingElement ?? doc.documentElement).scrollHeight,
        scrollY: win.scrollY,
      };
    } catch (e) { return { height: null, scrollH: null, scrollY: null }; }
  };

  try {
    if (manager?.active && manager.paused) manager.play();
    const watchMs = 38000;
    const end = Date.now() + watchMs;
    let lastAt = null, lastPlaced = null, prevWords = null;
    let lineIssues = 0;
    while (Date.now() < end) {
      const r = rowFor();
      const last = r?.last ?? null;
      const at = last?.at ?? null;
      if (at != null && at !== lastAt) {
        lastAt = at;
        const m = metrics();
        const c = r?.covered ?? { top: 0, bottom: 0 };
        const g = r?.placedLine ?? null;
        let expected = null;
        if (g && m.height) {
          const h = g[3] - g[1];
          const free = m.height - c.top - c.bottom;
          const raw = g[1] - c.top - ((free - h) * 30) / 100;
          const max = Math.max(0, m.scrollH - m.height);
          expected = { raw, clamped: Math.max(0, Math.min(max, raw)) };
        }
        const rec = { at, reason: last?.reason ?? null, top: last?.top ?? null, words: r?.words ?? null, placedLine: g, coveredTop: c.top, height: m.height, expectedClamped: expected?.clamped ?? null, delta: (expected && last?.top != null) ? expected.clamped - last.top : null };
        if (rec.reason === 'line') { lineIssues++; out.decisions.push(rec); }
        // words transitions, for the coming -> word record
        if (r?.words !== prevWords) { prevWords = r?.words; if (out.wordsLog.length < 24) out.wordsLog.push({ at, words: r?.words ?? null, reason: rec.reason, top: rec.top }); }
        // placedLine changes WITHOUT an issued decision are the clamp no-ops
        if (g && lastPlaced && Math.abs(g[1] - lastPlaced[1]) > 2 && rec.reason !== 'line') {
          out.noopPlacements = out.noopPlacements || [];
          if (out.noopPlacements.length < 6) out.noopPlacements.push({ at, yFrom: lastPlaced[1], yTo: g[1], words: rec.words, reason: rec.reason, top: rec.top });
        }
        if (g) lastPlaced = g;
      }
      if (!manager?.active) { out.sessionEndedEarly = true; break; }
      await sleep(90);
    }
    out.lineIssueCount = lineIssues;
    out.watchMs = watchMs;
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    p.setStringPref(modeName, 'line');
    try { if (hostWin?.windowState !== 2 && hostWin?.minimize) hostWin.minimize(); } catch (e) {}
    await sleep(300);
    out.restored = { mode: p.getStringPref(modeName), paused: !!manager?.paused, popupOpen: (await playerRow())?.popupOpen ?? null, flow: view?.flowMode ?? null, hostMinimized: hostWin ? hostWin.windowState === 2 : null };
  }
  return JSON.stringify(out);
})()
