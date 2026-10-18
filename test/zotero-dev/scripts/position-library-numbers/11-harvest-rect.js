// Harvest the crafted point WITHOUT reading anything into the store: open the
// fixture's tab once, wait for _internalReader + _readAloudManager (7 s polls,
// 24 s ceiling) and the SDT structure, take page 4 (index 3)'s first line rect
// off the structure (index walks only — reader-compartment arrays), then close
// the tab and prove nothing was recorded (no session ever existed here).
// Leaves state.craftPos {pageIndex, rects}.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  if (!f?.itemID) throw new Error('run 10 first');
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const win = Zotero.getMainWindow();
  let reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID) || null;
  if (!reader) reader = await Zotero.Reader.open(f.itemID);
  if (reader.tabID) { try { win.Zotero_Tabs.select(reader.tabID); } catch {} }
  await new Promise((r) => setTimeout(r, 1200));
  const started = Date.now();
  while (Date.now() - started < 24000 && !(reader?._internalReader && reader?._internalReader?._readAloudManager)) {
    await new Promise((r) => setTimeout(r, 700));
  }
  out.readyMs = Date.now() - started;
  out.hasInternal = !!reader?._internalReader;
  out.hasManager = !!reader?._internalReader?._readAloudManager;
  if (!out.hasInternal || !out.hasManager) throw new Error('reader not ready within the ceiling');
  f.tabID = reader.tabID;
  out.tabID = reader.tabID;

  // The SDT structure, once loaded — `_loadSDT()` is what loads and returns it
  // (a bare `_sdt` read stays empty until then, measured this run).
  let sdt = null;
  const sdtStarted = Date.now();
  while (Date.now() - sdtStarted < 24000) {
    try { sdt = waive(await reader._internalReader._loadSDT()) ?? null; } catch (e) { sdt = null; }
    if (sdt?.structure?.content?.length) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.sdtReadyMs = Date.now() - sdtStarted;
  const content = sdt?.structure?.content;
  if (!content || !content.length) throw new Error('SDT structure did not load');
  out.contentNodes = content.length;

  // First text node on pageIndex 3: the PARAGRAPH container holds the line's
  // anchor.pageRects; the text child under it carries anchor.textMap.
  const PAGE = 3;
  let chosen = null;
  const walk = (arr, path) => {
    if (!Array.isArray(arr) || chosen) return;
    for (let i = 0; i < arr.length && !chosen; i++) {
      const n = waive(arr[i]);
      if (!n) continue;
      const prs = n.anchor ? waive(n.anchor).pageRects : null;
      const pr = Array.isArray(prs) ? prs.find((q) => Array.isArray(q) && q[0] === PAGE) : null;
      if (pr) {
        // Text node directly here, or one level down inside the container.
        const kids = Array.isArray(n.content) ? n.content : null;
        let textNode = typeof n.text === 'string' ? n : null;
        let kidPath = path.concat(i);
        if (!textNode && kids) {
          for (let k = 0; k < kids.length && !textNode; k++) {
            const c = waive(kids[k]);
            if (typeof c?.text === 'string') { textNode = c; kidPath = path.concat(i, k); }
          }
        }
        if (textNode) { chosen = { path: kidPath, text: textNode.text, rect: Array.from(pr).slice(1, 5), containerPath: path.concat(i) }; break; }
      }
      if (Array.isArray(n.content)) walk(n.content, path.concat(i));
    }
  };
  walk(content, []);
  if (!chosen) throw new Error('no text node anchored on pageIndex 3');
  out.node = { path: chosen.path, chars: chosen.text.length, textStart: String(chosen.text).slice(0, 60) };
  // The lesson of this run: a single-line page reads as a running head and the
  // analysis excludes the block from the reading flow (flowClass 'excluded') —
  // it is never segmented, and a resume at its point falls to the next
  // included segment. The crafted block must be included.
  const container = waive(content[chosen.containerPath[0]]) ?? null;
  out.flowClass = container ? (container.flowClass ?? null) : 'unknown';
  if (out.flowClass === 'excluded') throw new Error('the crafted block is excluded from the reading flow — regenerate the fixture');
  const [x1, y1, x2, y2] = chosen.rect;
  out.lineRect = chosen.rect;
  const inside = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b);
  out.rectSane = inside(x1, -5, 620) && inside(x2, -5, 620) && inside(y1, -5, 800) && inside(y2, -5, 800);

  // Precision: the first character's run rect via the mapper, when reachable.
  let point = null;
  try {
    const mapper = waive(sdt.mapper);
    let node = null;
    let arr = content;
    for (const idx of chosen.path) { node = waive(arr[idx]); arr = node?.content; }
    const runData = mapper?._getRunData?.(node, chosen.path);
    if (Array.isArray(runData) && runData.length && runData[0]?.pageIndex === PAGE) {
      const rr = Array.from(runData[0].rect);
      out.firstCharRun = rr;
      const px = Math.round((rr[0] + 1.5) * 10) / 10, py = Math.round((rr[1] + rr[3]) / 2 * 10) / 10;
      point = [px, py, px, py];
      out.pointFrom = 'first-char-run';
    }
  } catch (e) { out.runDataError = String(e).slice(0, 120); }
  if (!point) {
    const cx = Math.round((x1 + 2) * 10) / 10, cy = Math.round((y1 + y2) / 2 * 10) / 10;
    point = [cx, cy, cx, cy];
    out.pointFrom = 'line-rect-left';
  }
  s.craftPos = { pageIndex: PAGE, rects: [point] };
  out.craftPos = s.craftPos;

  // Close through the real path; no session ever existed, so nothing records.
  const closedTabID = String(reader.tabID);
  win.Zotero_Tabs.close(closedTabID);
  await new Promise((r) => setTimeout(r, 3000));
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.afterClose = {
    rows: position.database?.rows ?? null, localEntries: sync.localEntries ?? null,
    documents: sync.shared?.documents?.documents ?? null, sharedItems: sync.shared?.documents?.items ?? null,
    tabHooks: position.tabHooks, ownOutcome: sync.transport?.lastOutcome, ownTrigger: sync.transport?.lastTrigger,
  };
  out.nothingRecorded = out.afterClose.rows === 75 && out.afterClose.localEntries === 75
    && out.afterClose.documents === 93 && out.afterClose.sharedItems === 15;
  out.fixtureTabClosed = !win.Zotero_Tabs._tabs.some((t) => t.id === closedTabID);
  return JSON.stringify(out);
})()
