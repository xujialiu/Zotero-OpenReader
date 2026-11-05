// The run's fixture imported as a fresh standalone attachment (never a user
// document): title from params, file from params.fixturePath. Nothing is
// recorded yet (sync suspended): counts must be unchanged except the Zotero
// item itself.
(async () => {
  const out = { step: 'fixture-import' };
  const P = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  try {
    if (state.fixtureDocWasAbsent !== true || state.serverSnapshotsVerified !== true) throw new Error('fixture absence/server snapshots gate not verified');
    const fieldID = await Zotero.DB.valueQueryAsync('SELECT fieldID FROM fieldsCombined WHERE fieldName=?', ['title']);
    const pre = Number(await Zotero.DB.valueQueryAsync(
      'SELECT COUNT(*) FROM itemData JOIN itemDataValues USING (valueID) WHERE fieldID=? AND value=?', [fieldID, P.fixtureTitle]));
    if (pre !== 0) throw new Error('a fixture-titled item already exists (' + pre + ')');
    const item = await Zotero.Attachments.importFromFile({
      file: P.fixturePath,
      libraryID: Zotero.Libraries.userLibraryID,
      title: P.fixtureTitle,
    });
    out.itemID = item.id;
    out.libraryID = item.libraryID;
    out.key = item.key;
    out.contentType = item.attachmentContentType;
    state.fixture = { itemID: item.id, lib: item.libraryID, key: item.key, title: P.fixtureTitle };
    const d = Zotero.ZoteroTTS.diagnostics;
    const position = JSON.parse(await d.position());
    const sync = JSON.parse(await d.positionSync());
    out.countsAfter = {
      databaseRows: position.database?.rows ?? null, localEntries: sync.localEntries ?? null,
      tombstones: sync.tombstones ?? null, documents: sync.shared?.documents?.documents ?? null,
      sharedItems: sync.shared?.documents?.items ?? null,
    };
    out.ok = out.contentType === 'application/epub+zip';
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
