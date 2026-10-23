// Check 5 (EPUB control, corrected): import the actual EPUB file (the
// previous run's 2-argument join helper dropped the filename and imported
// the fixtures directory instead — a test bug, fixed in 10 and here), then
// prove Zotero's native analysis of it is nonempty through the reader's own
// _loadSDT() and that htmlDocuments() carries no row for it. Self-contained;
// records its item under state.fx2.epub for cleanup. params: fixturesDir.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'epub-control' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  const T = win.Zotero_Tabs;

  const file = PathUtils.join(p.fixturesDir, 'scroll-performance', 'scroll-performance.epub');
  out.file = file;
  const stat = await IOUtils.stat(file).catch(() => null);
  out.isFile = stat?.type === 'regular';
  out.size = stat?.size ?? null;

  const imported = await Zotero.Attachments.importFromFile({ file, contentType: 'application/epub+zip', libraryID: Zotero.Libraries.userLibraryID, title: 'ztts228b epub control' });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  out.itemID = item.id;
  out.linkMode = item.attachmentLinkMode;
  out.contentType = item.attachmentContentType;
  const path = await item.getFilePathAsync().catch(() => null);
  out.path = path ?? null;
  out.pathIsFile = path ? (await IOUtils.stat(path).catch(() => null))?.type === 'regular' : null;
  state.fx2 = state.fx2 || {};
  state.fx2.epub = { id: item.id, key: item.key, title: 'ztts228b epub control' };

  const opened = Zotero.Reader.open(item.id);
  if (opened && typeof opened.then === 'function') await opened;
  let reader = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !(reader = (Zotero.Reader._readers || []).find((r) => r.itemID === item.id))?.['_internalReader']) await sleep(250);
  if (!reader?._internalReader) throw new Error('epub reader never opened');
  if (T.selectedID !== reader.tabID) T.select(reader.tabID);
  const internal = waive(reader._internalReader);
  await internal._loadSDT();
  // First EPUB generation runs in the worker; give it time.
  for (let i = 0; i < 120 && !(internal._sdt && internal._sdt.structure); i++) await sleep(500);
  const sdt = internal._sdt ? waive(internal._sdt) : null;
  const st = sdt?.structure ? waive(sdt.structure) : null;
  const countBlocks = (node, depth) => {
    if (node === null || node === undefined || depth > 6) return 0;
    if (Array.isArray(node)) { let n = 0; for (const x of node) n += countBlocks(x, depth + 1); return n; }
    let n = typeof node.text === 'string' && node.text.length ? 1 : 0;
    if (Array.isArray(node.content)) n += countBlocks(node.content, depth + 1);
    return n;
  };
  out.analysis = {
    sdtLoaded: !!sdt,
    structure: !!st,
    contentLen: st && Array.isArray(st.content) ? st.content.length : null,
    textBlocks: st ? countBlocks(st.content, 0) : 0,
  };

  const rows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments());
  out.htmlRow = rows.find((r) => r.itemID === item.id) ?? null;

  if (reader.tabID) T.close(reader.tabID);
  for (let i = 0; i < 60 && (Zotero.Reader._readers || []).some((r) => r.itemID === item.id); i++) await sleep(200);

  out.ok = out.isFile && out.pathIsFile && out.analysis.sdtLoaded && out.analysis.textBlocks > 0 && !out.htmlRow;
  return JSON.stringify(out, null, 1);
})()
