// The run's own fixture: the generated 6-page PDF imported into My Library as
// a standalone attachment. No reader is opened here. params.fixturePath and
// params.fixtureTitle; leaves state.fixture {itemID, lib, key}.
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = {};
  const item = await Zotero.Attachments.importFromFile({
    file: p.fixturePath,
    libraryID: Zotero.Libraries.userLibraryID,
    title: p.fixtureTitle,
  });
  out.itemID = item.id;
  out.lib = item.libraryID;
  out.key = item.key;
  out.contentType = item.attachmentContentType;
  Zotero.ZoteroTTSRun.state.fixture = { itemID: item.id, lib: item.libraryID, key: item.key, tabID: null };
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.after = {
    rows: position.database?.rows ?? null, localEntries: sync.localEntries ?? null,
    documents: sync.shared?.documents?.documents ?? null, sharedItems: sync.shared?.documents?.items ?? null,
    queued: position.store?.queued ?? null,
  };
  out.unchanged = out.after.rows === 75 && out.after.localEntries === 75
    && out.after.documents === 93 && out.after.sharedItems === 15;
  return JSON.stringify(out);
})()
