(async () => {
  // voice-catalog 02 — standalone fixture-a import, open, ready poll (24 s ceiling).
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const params = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  state.vc261 = state.vc261 || {};
  const title = (params.fixtureTitle || 'ztts vc261 A');
  const file = PathUtils.join(params.fixturesDir, 'fixture-a.pdf');
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  state.vc261.fixtureA = { itemID: item.id, key: item.key, title };
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
  return JSON.stringify({
    fixtureA: state.vc261.fixtureA, opened: !!r, ready,
    managerActive: !!(r && r._internalReader && r._internalReader._readAloudManager && r._internalReader._readAloudManager.active),
    documentVoiceKey: row ? row.key : null,
    savedRecord: row ? row.saved : null,
    selected: row ? row.selected : null,
    positionRowsNow: (() => { try { return null; } catch (e) { return null; } })(),
  });
})()
