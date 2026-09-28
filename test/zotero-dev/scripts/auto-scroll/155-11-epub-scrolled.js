// Issue #155 run, items 3+10 on the scrolled EPUB (2026-09-29, 1.16.2-beta2).
// Opens the imported EPUB, switches to scrolled flow, starts a muted session
// with a trusted Shift+Space, and checks the reading line through
// diagnostics.autoScroll()'s EPUB rows: each new sentence's issued last.top
// against the expected value computed from the displayed range's rects plus
// scrollY (whole.top − covered.top − (clientHeight − covered.top −
// covered.bottom − height) × line/100), a line change to 90 mid-follow,
// outside mode (visible: nothing issued, even on a line change; clipped: a
// cut target to the line), and the paused Shift+R return. Leaves the
// session paused in scrolled flow at line 10, mode outside.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.epub;
  const p = Services.prefs;
  const lineName = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const waive = Components.utils.waiveXrays;
  const out = { itemID: slot?.itemID ?? null, errors: [], decisions: [] };
  p.setStringPref(modeName, 'sentence');
  p.setIntPref(lineName, 10);

  await Zotero.Reader.open(slot.itemID);
  const deadline = Date.now() + 24000;
  let reader = null;
  while (Date.now() < deadline) {
    reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID) ?? null;
    if (reader?._internalReader && reader._internalReader?._readAloudManager) break;
    await sleep(700);
  }
  if (!reader) return JSON.stringify({ error: 'EPUB reader did not open within 24s' });
  const internal = reader._internalReader;
  await sleep(1000);
  const view = internal._primaryView;
  const win = view?.iframeWindow;
  out.flowAfterOpen = view?.flowMode ?? null;
  try { await view.setFlowMode('scrolled'); } catch (e) { out.errors.push('flow: ' + String(e)); }
  await sleep(800);
  out.flow = view?.flowMode ?? null;

  const rowFor = () => {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return rows[i] ?? null;
  };

  const geometry = () => {
    const row = rowFor();
    try {
      const helper = waive(view._readAloud);
      const current = waive(helper.state);
      const selector = helper._resolveSegmentSelector(current);
      const range = selector ? view.toDisplayedRange(selector) : null;
      const list = range?.getClientRects?.() ?? [];
      const rects = [];
      for (let i = 0; i < list.length; i++) { const b = list[i]; rects.push([b.left, b.top, b.right, b.bottom]); }
      const sx = win.scrollX, sy = win.scrollY;
      let whole = null;
      if (rects.length) {
        const xs1 = Math.min(...rects.map(b => b[0])), ys1 = Math.min(...rects.map(b => b[1]));
        const xs2 = Math.max(...rects.map(b => b[2])), ys2 = Math.max(...rects.map(b => b[3]));
        whole = [xs1 + sx, ys1 + sy, xs2 + sx, ys2 + sy];
      }
      const doc = view.iframeDocument;
      const height = doc.documentElement.clientHeight || win.innerHeight;
      const covered = row?.covered ?? { top: 0, bottom: 0 };
      const vh = height - covered.top - covered.bottom;
      let expected = null;
      if (whole) {
        const h = whole[3] - whole[1];
        const line = p.getIntPref(lineName, 10);
        const raw = whole[1] - covered.top - ((vh - h) * line) / 100;
        const max = Math.max(0, (doc.scrollingElement ?? doc.documentElement).scrollHeight - height);
        const centering = (whole[1] + whole[3]) / 2 - vh / 2 - covered.top;
        expected = { raw, clamped: Math.max(0, Math.min(max, raw)), centeringRaw: centering, centeringClamped: Math.max(0, Math.min(max, centering)), h, vh, coveredTop: covered.top, max };
      }
      return { whole, scrollY: sy, height, expected, selector: selector ? JSON.stringify(selector).slice(0, 80) : null, following: row?.following ?? null };
    } catch (e) { out.errors.push('geometry: ' + String(e)); return { whole: null, expected: null }; }
  };

  // Muted session via a trusted Shift+Space. The dom-follow's setState path
  // requires the player popup open, so ensure it is open (toggle semantics:
  // only call when it reads closed) and pause; then require the EPUB row to
  // be patched before anything.
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) { out.errors.push('select: ' + String(e)); }
  await sleep(400);
  const manager = internal._readAloudManager;
  if (!manager?.active) {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(hostWin);
    const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    tip.keydown(ev('keydown', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', ' ', 'Space', 32, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    const activeDeadline = Date.now() + 9000;
    while (Date.now() < activeDeadline && !manager?.active) await sleep(400);
  }
  let popupToggles = 0;
  // internal.popupOpen reads false through any wrapper; the players()
  // diagnostic is the truthful per-item popup state
  const playerRow = async () => {
    try {
      const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.players());
      const list = Array.isArray(raw) ? raw : [...(raw.before ?? []), ...(raw.after ?? [])];
      for (const r of list) if (r.itemID === slot.itemID) return r;
    } catch (e) {}
    return null;
  };
  const popupIsOpen = async () => (await playerRow())?.popupOpen === true;
  out.popupReads = [];
  while (!(await popupIsOpen()) && popupToggles < 3) {
    try { internal.toggleReadAloudPopup(true); } catch (e) { out.errors.push('popup: ' + String(e)); }
    popupToggles++;
    await sleep(700);
    const row = await playerRow();
    out.popupReads.push({ after: popupToggles, popupOpen: row?.popupOpen ?? null, popupInDom: row?.popupInDom ?? null });
  }
  let pauseError = null;
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
  await sleep(400);
  out.session = { active: !!manager?.active, paused: !!manager?.paused, pauseError, popupOpen: await popupIsOpen(), popupToggles };
  const patchDeadline = Date.now() + 7000;
  while (Date.now() < patchDeadline && (rowFor()?.patched !== true || !(await popupIsOpen()))) await sleep(400);
  const rowPatched = rowFor();
  out.patchedPoll = { patched: rowPatched?.patched ?? null, line: rowPatched?.line ?? null, kind: rowPatched?.kind ?? null, popupOpen: await popupIsOpen() };
  if (rowPatched?.patched !== true || !(await popupIsOpen())) return JSON.stringify({ ...out, error: 'EPUB follow not ready: patched or popup missing' });

  const watchDecisions = async (seconds) => {
    const end = Date.now() + seconds * 1000;
    let lastAt = null;
    const seen = new Set();
    while (Date.now() < end) {
      const row = rowFor();
      const at = row?.last?.at ?? null;
      if (at !== lastAt && row?.last) {
        lastAt = at;
        if (row.last.top != null && !seen.has(at)) {
          seen.add(at);
          const g = geometry();
          out.decisions.push({ reason: row.last.reason, top: row.last.top, scrollY: g.scrollY,
            line: row.line, whole: g.whole, expected: g.expected,
            delta: (g.expected) ? g.expected.clamped - row.last.top : null });
        }
      }
      await sleep(90);
    }
  };

  try {
    // Controlled start, then natural audio advance through sentence entries at line 10
    try { manager.repositionTo(5); } catch (e) { out.errors.push('reposition 5: ' + String(e)); }
    await sleep(600);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);
    out.startWhole = geometry().whole;
    if (manager?.active && manager.paused) manager.play();
    await watchDecisions(35);
    // A line change to 90 while followed: one new target at once
    p.setIntPref(lineName, 90);
    await watchDecisions(2.5);
    p.setIntPref(lineName, 10);
    await watchDecisions(2.5);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);

    // Outside mode, visible sentence: nothing issued on pushes or a line change
    p.setStringPref(modeName, 'outside');
    await sleep(350);
    const g0 = geometry();
    if (g0.whole) {
      const targetY = Math.max(0, Math.round(g0.whole[1] - g0.height / 2 + (g0.whole[3] - g0.whole[1]) / 2));
      win.scrollTo(0, targetY);
      await sleep(250);
    }
    out.outsideVisibleArrange = { scrollY: win.scrollY, whole: geometry().whole };
    const mark = out.decisions.length;
    if (manager?.active && manager.paused) manager.play();
    await watchDecisions(3);
    p.setIntPref(lineName, 90);
    await watchDecisions(2);
    p.setIntPref(lineName, 10);
    await watchDecisions(2);
    out.outsideVisible = { issuedDecisions: out.decisions.length - mark };

    // Clipped: half the sentence above the viewport
    const g1 = geometry();
    if (g1.whole) {
      win.scrollTo(0, Math.round(g1.whole[3] - 10)); // bottom edge near the top: fully clipped
      await sleep(250);
      out.clipArrange = { scrollY: win.scrollY, whole: geometry().whole };
      const mark2 = out.decisions.length;
      await watchDecisions(4);
      out.clipped = out.decisions.slice(mark2);
    }

    // Paused Shift+R: return to the line, A/M untouched
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);
    const followingBefore = rowFor()?.following ?? null;
    const modeBefore = p.getStringPref(modeName);
    {
      const tip2 = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      tip2.beginInputTransactionForTests(hostWin);
      const ev2 = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
      tip2.keydown(ev2('keydown', 'Shift', 'ShiftLeft', 16, {}));
      tip2.keydown(ev2('keydown', 'R', 'KeyR', 82, { shiftKey: true }));
      tip2.keyup(ev2('keyup', 'R', 'KeyR', 82, { shiftKey: true }));
      tip2.keyup(ev2('keyup', 'Shift', 'ShiftLeft', 16, {}));
    }
    await watchDecisions(3);
    const recR = out.decisions.filter(d => d.reason === 'return').pop() ?? null;
    out.shiftR = {
      decision: recR ? { top: recR.top, expected: recR.expected, delta: recR.delta } : null,
      following: rowFor()?.following ?? null, followingUnchanged: (rowFor()?.following ?? null) === followingBefore,
      modeUnchanged: p.getStringPref(modeName) === modeBefore, paused: !!manager?.paused,
    };

    // Paginated flow (item 11): a line change turns no page; item 6 holds
    try { await view.setFlowMode('paginated'); } catch (e) { out.errors.push('flow2: ' + String(e)); }
    await sleep(900);
    const flowObj = view.flow;
    const pagState = async () => ({ offset: flowObj?._offsetLeft ?? null, section: flowObj?._currentSectionIndex ?? null, last: rowFor()?.last ?? null, popupOpen: await popupIsOpen() });
    out.paginatedStart = await pagState();
    // paused: line change issues nothing, moves no page
    p.setIntPref(lineName, 90);
    await sleep(1500);
    const mid90 = await pagState();
    p.setIntPref(lineName, 10);
    await sleep(1500);
    const mid10 = await pagState();
    out.paginatedLineChangePaused = {
      lastUnchanged: JSON.stringify(mid90.last) === JSON.stringify(out.paginatedStart.last) && JSON.stringify(mid10.last) === JSON.stringify(out.paginatedStart.last),
      offsetUnchanged: mid90.offset === out.paginatedStart.offset && mid10.offset === out.paginatedStart.offset,
    };
    // playing: a line change mid-follow still turns no page
    if (manager?.active && manager.paused) manager.play();
    await sleep(1200);
    const playBase = await pagState();
    p.setIntPref(lineName, 50);
    await sleep(2000);
    const playChanged = await pagState();
    p.setIntPref(lineName, 10);
    await sleep(1200);
    out.paginatedLineChangePlaying = {
      base: playBase, after: playChanged,
      lastUnchanged: JSON.stringify(playChanged.last) === JSON.stringify(playBase.last),
      offsetUnchanged: playChanged.offset === playBase.offset,
    };
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);
    // item 6 core in outside mode at line 10: a wholly visible sentence turns no page;
    // a sentence outside the spread brings its page in
    p.setStringPref(modeName, 'outside');
    await sleep(300);
    try { manager.repositionTo(1); } catch (e) { out.errors.push('reposition 1: ' + String(e)); }
    await sleep(300);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    await sleep(300);
    const visBase = await pagState();
    if (manager?.active && manager.paused) manager.play();
    await sleep(2500);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    const visAfter = await pagState();
    out.paginatedVisible = { base: visBase, after: visAfter, pageUnchanged: visAfter.offset === visBase.offset && !visAfter.last,
      note: 'a page turn here is correct when the next sentence leaves the spread (item 6)' };
    try { manager.repositionTo(50); } catch (e) { out.errors.push('reposition 50: ' + String(e)); }
    await sleep(900);
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    const after50 = await pagState();
    out.paginatedOutsideMoved = { after: after50, pageTurned: after50.offset !== visAfter.offset || !!after50.last, reason: after50.last?.reason ?? null };
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    // Restore the paginated document at its first page
    try { await view.setFlowMode('paginated'); await sleep(500); await view.navigateToFirstPage(); await sleep(500); } catch (e) { out.errors.push('restore flow: ' + String(e)); }
    p.setIntPref(lineName, 10);
    await sleep(250);
    out.after = { paused: !!manager?.paused, line: p.getIntPref(lineName, -1), mode: p.getStringPref(modeName), flow: view?.flowMode ?? null, offset: view?.flow?._offsetLeft ?? null };
  }
  return JSON.stringify(out);
})()
