// The fixture (issue #237): import test/fixtures/replacements/replacements.epub
// as a temporary standalone attachment titled 'Replacement fixture', open it,
// and wait for _internalReader + _readAloudManager + the document iframe
// (7 s polls, ~24 s ceiling). Reads the reader list as found: the fixture's
// index is recorded, the owner's tabs are never closed. params: none.
// state: writes fixture { itemID, key, readerIndex, title }.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const path = Zotero.ZoteroTTSRun.params.fixturesDir + '/replacements/replacements.epub';
  const item = await Zotero.Attachments.importFromFile({
    file: path,
    libraryID: Zotero.Libraries.userLibraryID,
    title: 'Replacement fixture',
  });
  out.itemID = item.id;
  out.key = item.key;
  const before = (Zotero.Reader._readers ?? []).map((r) => r.itemID);
  await Zotero.Reader.open(item.id);
  let reader = null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 7000));
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
    if (!reader) continue;
    const ir = reader._internalReader;
    if (!ir?._readAloudManager) continue;
    if (!reader._iframeWindow) continue;
    break;
  }
  if (!reader?._internalReader?._readAloudManager) throw new Error('the fixture reader did not become ready within the ceiling');
  const index = (Zotero.Reader._readers ?? []).indexOf(reader);
  state.fixture = { itemID: item.id, key: item.key, readerIndex: index, title: 'Replacement fixture' };
  out.fixture = state.fixture;
  out.readersBefore = before;
  out.readersNow = (Zotero.Reader._readers ?? []).map((r) => r.itemID);
  out.managerActive = !!reader._internalReader._readAloudManager.active;
  // segments materialize at manager activation; read them if present
  out.segmentCount = (() => { try { return reader._internalReader._readAloudSegments?.segments?.length ?? null; } catch (e) { return null; } })();
  out.segmentTexts = (() => {
    try {
      const segs = reader._internalReader._readAloudSegments?.segments ?? [];
      return segs.slice(0, 12).map((s) => String(s.text).slice(0, 60));
    } catch (e) { return null; }
  })();
  out.positionRows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database?.rows ?? null;
  return JSON.stringify(out, null, 1);
})()
