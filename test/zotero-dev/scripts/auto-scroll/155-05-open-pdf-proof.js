// Issue #155 run, PDF fixture open and build proof (2026-09-29, 1.16.2-beta2).
// Opens the imported PDF in its own tab, polls the reader to readiness, then
// proves the installed build by mechanism: the autoScroll and sentenceInView
// rows for the patched view carry `line` (older builds have none), and the
// readingLine pref reads its int default 50 without a user value.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const slot = state.fixturesImported?.pdf;
  if (!slot?.itemID) return JSON.stringify({ error: 'no imported PDF in state' });
  const out = { itemID: slot.itemID, errors: [] };

  await Zotero.Reader.open(slot.itemID);
  const deadline = Date.now() + 24000;
  let reader = null;
  while (Date.now() < deadline) {
    reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === slot.itemID) ?? null;
    if (reader?._internalReader && reader._internalReader?._readAloudManager && reader._internalReader?.initialized) break;
    await sleep(700);
  }
  out.ready = !!(reader?._internalReader && reader._internalReader?._readAloudManager);
  out.initialized = !!reader?._internalReader?.initialized;
  if (!reader) return JSON.stringify({ ...out, error: 'reader did not open within 24s' });
  await sleep(1200);

  // Patch poll: the plugin's PDF follow prototype patch
  const patchDeadline = Date.now() + 7000;
  let row = null;
  while (Date.now() < patchDeadline) {
    const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
    let index = -1, i = 0;
    for (const r of Zotero.Reader._readers ?? []) { if (r === reader) { index = i; break; } i++; }
    row = index >= 0 ? rows[index] ?? null : null;
    if (row?.patched) break;
    await sleep(700);
  }
  out.autoScrollRow = row ? {
    kind: row.kind, patched: row.patched, line: row.line ?? null, hasLineField: 'line' in row,
    mode: row.mode ?? null, following: row.following ?? null, covered: row.covered ?? null,
  } : null;
  try {
    const svRows = JSON.parse(Zotero.ZoteroTTS.diagnostics.sentenceInView());
    const sv = svRows[index0Of(reader)] ?? null;
    out.sentenceInViewRow = sv ? { kind: sv.kind, patched: sv.patched, line: sv.line ?? null, hasLineField: 'line' in sv } : null;
  } catch (e) { out.errors.push('sentenceInView: ' + String(e)); }
  function index0Of(r) { let i = 0; for (const x of Zotero.Reader._readers ?? []) { if (x === r) return i; i++; } return -1; }

  const name = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  const p = Services.prefs;
  out.readingLinePref = { value: p.getIntPref(name, -1), user: p.prefHasUserValue(name), type: p.getPrefType(name) };

  // View facts for the record: selected tab, scale, page, container size
  const hostWin = Services.wm.getMostRecentWindow('navigator:browser');
  const view = reader._internalReader._primaryView;
  const win = view?._iframeWindow;
  const container = win?.document?.getElementById('viewerContainer');
  out.view = {
    tabSelected: hostWin?.Zotero_Tabs?.selectedID === reader.tabID,
    itemTabTitle: hostWin?.Zotero_Tabs?._tabs?.find(t => t.id === reader.tabID)?.title ?? null,
    flowMode: view?.flowMode ?? null,
    scale: win?.PDFViewerApplication?.pdfViewer?.currentScale ?? null,
    page: win?.PDFViewerApplication?.pdfViewer?.currentPageNumber ?? null,
    container: container ? { clientHeight: container.clientHeight, scrollHeight: container.scrollHeight, scrollTop: container.scrollTop } : null,
  };
  out.readersOpen = (Zotero.Reader._readers ?? []).length;
  return JSON.stringify(out);
})()
