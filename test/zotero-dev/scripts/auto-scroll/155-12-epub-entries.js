// Issue #155 run, items 3+10 completion on the scrolled EPUB
// (2026-09-29, 1.16.2-beta2). The earlier pass found the follow intent
// disengaged (`following: false`, reason unread), so no entry targets could
// issue. This pass re-engages the product way — a trusted Shift+Enter
// (locate once and switch to A) — then plays 20 s at line 10 catching every
// new last (the EPUB row's last has no `issued` field: a top is a decision),
// changes the line to 90 mid-follow, and pauses. Muted throughout.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported.epub;
  const p = Services.prefs;
  const lineName = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  p.setIntPref(lineName, 10);
  const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID);
  if (!reader?._internalReader) return JSON.stringify({ error: 'EPUB reader not open' });
  const internal = reader._internalReader;
  const manager = internal._readAloudManager;
  const view = internal._primaryView;
  const win = view.iframeWindow;
  const waive = Components.utils.waiveXrays;
  const out = { itemID: slot.itemID, decisions: [], errors: [] };

  const rowFor = () => {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    let i = -1, k = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { i = k; break; } k++; }
    return rows[i] ?? null;
  };
  try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
  await sleep(300);
  out.flow = view?.flowMode ?? null;
  if (view?.flowMode !== 'scrolled') { try { await view.setFlowMode('scrolled'); } catch (e) { out.errors.push('flow: ' + String(e)); } await sleep(800); }

  const row0 = rowFor();
  out.rowBefore = { following: row0?.following ?? null, reason: row0?.reason ?? null, paused: row0?.paused ?? null };
  try { const log = await Zotero.Debug.get(); const lines = log.split('\n').filter(l => l.includes('[zotero-tts]') && (l.includes('follow') || l.includes('manual'))); out.debugFollow = { count: lines.length, last4: lines.slice(-4).map(l => l.slice(-170)) }; } catch (e) { out.errors.push('debug: ' + String(e)); }

  // Re-engage: trusted Shift+Enter locates once and switches to A
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  try { hostWin.Zotero_Tabs.select(reader.tabID); } catch (e) {}
  await sleep(300);
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(hostWin);
  const ev = (type, key, code, keyCode, mods) => new hostWin.KeyboardEvent('', { type, key, code, keyCode, ...mods });
  tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
  tip.keydown(ev('keydown', 'Enter', 'Enter', 13, { shiftKey: true }));
  tip.keyup(ev('keyup', 'Enter', 'Enter', 13, { shiftKey: true }));
  tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
  await sleep(800);
  const row1 = rowFor();
  out.afterShiftEnter = { following: row1?.following ?? null, reason: row1?.reason ?? null, last: row1?.last ?? null };

  const geometry = () => {
    try {
      const helper = waive(view._readAloud);
      const current = waive(helper.state);
      const selector = helper._resolveSegmentSelector(current);
      const range = selector ? view.toDisplayedRange(selector) : null;
      const list = range?.getClientRects?.() ?? [];
      let whole = null;
      if (list.length) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < list.length; i++) { const b = list[i]; if (!b.width && !b.height) continue; x1 = Math.min(x1, b.left); y1 = Math.min(y1, b.top); x2 = Math.max(x2, b.right); y2 = Math.max(y2, b.bottom); }
        whole = [x1 + win.scrollX, y1 + win.scrollY, x2 + win.scrollX, y2 + win.scrollY];
      }
      const row = rowFor();
      const covered = row?.covered ?? { top: 0, bottom: 0 };
      const height = view.iframeDocument.documentElement.clientHeight || win.innerHeight;
      const vh = height - covered.top - covered.bottom;
      let expected = null;
      if (whole) {
        const h = whole[3] - whole[1];
        const line = p.getIntPref(lineName, 10);
        const raw = whole[1] - covered.top - ((vh - h) * line) / 100;
        const max = Math.max(0, view.iframeDocument.scrollingElement.scrollHeight - height);
        expected = { raw, clamped: Math.max(0, Math.min(max, raw)), h, vh, coveredTop: covered.top, max };
      }
      return { whole, expected, scrollY: win.scrollY };
    } catch (e) { return { whole: null, expected: null, scrollY: null }; }
  };
  const decisions = out.decisions;
  const watch = async (seconds, label) => {
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
          decisions.push({ label, reason: row.last.reason, top: row.last.top, line: row.line, whole: g.whole, expected: g.expected, delta: g.expected ? g.expected.clamped - row.last.top : null });
        }
      }
      await sleep(90);
    }
  };

  try {
    if (manager?.active && manager.paused) manager.play();
    await watch(22, 'line-10-entries');
    p.setIntPref(lineName, 90);
    await watch(3, 'line-90');
    p.setIntPref(lineName, 10);
    await watch(2, 'line-10-back');
  } finally {
    try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
    p.setIntPref(lineName, 10);
    await sleep(250);
    const rowEnd = rowFor();
    out.rowEnd = { following: rowEnd?.following ?? null, reason: rowEnd?.reason ?? null, paused: !!manager?.paused, line: p.getIntPref(lineName, -1) };
  }
  return JSON.stringify(out);
})()
