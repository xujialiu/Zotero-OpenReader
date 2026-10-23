// Check 5: an ordinary webpage snapshot stays native; PDF and EPUB controls
// keep their native nonempty analysis and never appear in htmlDocuments();
// two direct getPack calls for the same affected HTML show the compatibility
// cache hit and hand out separate byte buffers; the attachment's storage
// directory gains no native cache file. state: reads fx; writes controls.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fx;
  const out = { step: 'controls-cache' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  win.focus();
  const T = win.Zotero_Tabs;
  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const htmlRows = async () => { try { return JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments()); } catch (e) { return []; } };
  const openAndAnalyze = async (name, ceilingMs = 30000) => {
    const row = fx[name];
    const opened = Zotero.Reader.open(row.id);
    if (opened && typeof opened.then === 'function') await opened;
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs && !(reader = findReader(row.id))?.['_internalReader']) await sleep(250);
    if (!reader?._internalReader) throw new Error(name + ': reader never ready');
    if (T.selectedID !== reader.tabID) T.select(reader.tabID);
    // The reader's own Document analysis, loaded through its own init path
    // (what the first Read Aloud would do): top-level blocks. The segment
    // list only exists once a session needs it.
    let count = 0;
    try {
      await waive(reader._internalReader)._loadSDT();
      // An EPUB's first generation runs in the worker; give it time.
      for (let i = 0; i < 120 && !reader._internalReader._sdt?.structure; i++) await sleep(500);
      const sdt = waive(reader._internalReader._sdt);
      const content = sdt?.structure?.content;
      const countBlocks = (node, depth) => {
        if (node === null || node === undefined || depth > 5) return 0;
        if (Array.isArray(node)) { let n = 0; for (const x of node) n += countBlocks(x, depth + 1); return n; }
        let n = typeof node.text === 'string' && node.text.length ? 1 : 0;
        if (Array.isArray(node.content)) n += countBlocks(node.content, depth + 1);
        return n;
      };
      count = Array.isArray(content) ? countBlocks(content, 0) : 0;
    } catch (e) { count = -1; }
    return { name, itemID: row.id, textBlocks: count };
  };
  const closeTab = async (itemID) => {
    const r = findReader(itemID);
    if (!r) return;
    if (r.tabID && (T._tabs || []).some((t) => t.id === r.tabID)) T.close(r.tabID);
    for (let i = 0; i < 60 && findReader(itemID); i++) await sleep(150);
  };
  const storageNames = async (itemID) => {
    const item = Zotero.Items.get(itemID);
    const dir = Zotero.Attachments.getStorageDirectory(item).path;
    const children = await IOUtils.getChildren(dir);
    const names = [];
    for (const c of children) names.push(String(typeof c === 'string' ? c : c.path).split('/').pop());
    return names.sort();
  };

  // Close whatever tabs earlier stages left open, so rows settle.
  for (const key of Object.keys(fx)) {
    const row = fx[key];
    if (row?.id && findReader(row.id)) await closeTab(row.id);
  }
  await sleep(500);

  // 1. The ordinary snapshot: native, nonempty.
  out.ordinarySnapshot = await openAndAnalyze('ordinarySnapshot');
  const rows1 = await htmlRows();
  out.ordinarySnapshotRow = rows1.find((r) => r.itemID === fx.ordinarySnapshot.id) ?? null;
  await closeTab(fx.ordinarySnapshot.id);

  // 2. PDF and EPUB controls: native nonempty, no HTML rows.
  out.pdfControl = await openAndAnalyze('pdfControl');
  out.epubControl = await openAndAnalyze('epubControl');
  const rows2 = await htmlRows();
  out.rowsAfterControls = rows2;
  out.pdfHasHtmlRow = rows2.some((r) => r.itemID === fx.pdfControl.id);
  out.epubHasHtmlRow = rows2.some((r) => r.itemID === fx.epubControl.id);
  await closeTab(fx.pdfControl.id);
  await closeTab(fx.epubControl.id);

  // 3. Two direct getPack calls for the same affected HTML file: cache hit,
  //    separate byte buffers, no native cache file appears.
  const target = fx.bodylessImported.id;
  out.storageBefore = await storageNames(target);
  const rowsBefore = await htmlRows();
  out.rowBeforeCalls = rowsBefore.find((r) => r.itemID === target) ?? null;
  const pack1 = await Zotero.SDT.getPack(target);
  const rowsMid = await htmlRows();
  out.rowAfterFirstCall = rowsMid.find((r) => r.itemID === target) ?? null;
  const pack2 = await Zotero.SDT.getPack(target);
  const rowsAfter = await htmlRows();
  out.rowAfterSecondCall = rowsAfter.find((r) => r.itemID === target) ?? null;
  out.packs = {
    firstOk: !!pack1?.ok, secondOk: !!pack2?.ok,
    separateBuffers: pack1?.ok && pack2?.ok ? pack1.bytes !== pack2.bytes : null,
    sameLength: pack1?.ok && pack2?.ok ? pack1.bytes.byteLength === pack2.bytes.byteLength : null,
    byteLength: pack1?.ok ? pack1.bytes.byteLength : null,
  };
  out.storageAfter = await storageNames(target);
  out.storageUnchanged = JSON.stringify(out.storageBefore) === JSON.stringify(out.storageAfter);
  out.noSdtCacheFile = !out.storageAfter.includes('.zotero-sdt-cache');

  out.ok = out.ordinarySnapshotRow?.status === 'native'
    && (out.ordinarySnapshotRow?.blocks ?? 0) > 0
    && out.ordinarySnapshot.textBlocks > 0
    && out.pdfControl.textBlocks > 0
    && out.epubControl.textBlocks > 0
    && !out.pdfHasHtmlRow && !out.epubHasHtmlRow
    && out.packs.firstOk && out.packs.secondOk && out.packs.separateBuffers
    && out.rowAfterSecondCall?.cacheHit === true
    && out.storageUnchanged && out.noSdtCacheFile;
  return JSON.stringify(out, null, 1);
})()
