(async () => {
  // voice-catalog 02b — standalone fixture-b import, open, ready poll (24 s ceiling).
  // Item 4 and item 2's "look at the other fixture tab" need B open next to A.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const params = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  state.vc261 = state.vc261 || {};
  const title = (params.fixtureBTitle || 'ztts vc261 B');
  const file = PathUtils.join(params.fixturesDir, 'fixture-b.pdf');
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  state.vc261.fixtureB = { itemID: item.id, key: item.key, title };
  await Zotero.Reader.open(item.id);
  let ready = null;
  const deadline = Date.now() + 24000;
  while (Date.now() < deadline) {
    const r = (Zotero.Reader._readers || []).find(e => e.itemID === item.id);
    if (r && r._internalReader && r._internalReader._readAloudManager) { ready = { internal: true, manager: true, atMs: 24000 - (deadline - Date.now()) }; break; }
    await sleep(1000);
  }
  const r = (Zotero.Reader._readers || []).find(e => e.itemID === item.id);
  let dv = null;
  try { dv = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()); } catch (e) { dv = { error: String(e) }; }
  const row = (dv.readers || []).find(x => x.key && x.key.includes(item.key));
  const out = {
    fixtureB: state.vc261.fixtureB, opened: !!r, ready,
    managerActive: !!(r && r._internalReader && r._internalReader._readAloudManager && r._internalReader._readAloudManager.active),
    documentVoiceKey: row ? row.key : null,
    savedRecord: row ? row.saved : null,
    selected: row ? row.selected : null,
  };
  const main = Zotero.getMainWindow();
  out.selectedTabIsB = main.Zotero_Tabs.selectedID === r.tabID;
  return JSON.stringify(out);
})()
