(async () => {
  // #189: import the brackets EPUB after the previous fixture's player is
  // closed, open it, force cacheAudio off, read textSettings before the tab's
  // first session. Row came from the 2026-10-17 document-voices run (item 4).
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params;
  // close the sibling fixture's player when running inside a larger run
  const readerA = (Zotero.Reader._readers || []).find(e => e.itemID === state.fixtures?.A?.itemID);
  let aClosed = 'no sibling fixture';
  if (readerA) {
    readerA._internalReader.toggleReadAloudPopup(false);
    for (let i = 0; i < 50; i++) { if (!readerA._internalReader._readAloudManager?.active) break; await sleep(150); }
    aClosed = !readerA._internalReader._readAloudManager?.active;
  }
  // import the EPUB fixture
  const title = params.fixtureTitle || 'ztts brackets';
  const file = PathUtils.join(params.fixturesDir, 'angle-brackets', 'angle-brackets.epub');
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  state.fixtures.B = { itemID: item.id, key: item.key, title };
  await Zotero.Reader.open(item.id);
  let ready = null;
  const deadline = Date.now() + 24000;
  while (Date.now() < deadline) {
    const r = (Zotero.Reader._readers || []).find(e => e.itemID === item.id);
    if (r && r._internalReader && r._internalReader._readAloudManager) { ready = true; break; }
    await sleep(1000);
  }
  // force cacheAudio off for the sequence (request proofs)
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.cacheAudio', false);
  // textSettings before any session in this tab
  const ts = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const idx = (Zotero.Reader._readers || []).findIndex(r => r.itemID === item.id);
  return JSON.stringify({ aClosed, itemID: item.id, key: item.key, ready, idx, textSettingsRow: ts[idx] ?? null, allRows: ts }, null, 1);
})()
