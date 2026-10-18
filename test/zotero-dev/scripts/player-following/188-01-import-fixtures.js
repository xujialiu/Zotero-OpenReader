// 188-01 — import the return-key HTML snapshot as a REAL snapshot (limitations §9) and fixture-a.pdf.
// Needs: parent item for text/html (xpcom/attachments.js 293-317). Then Zotero.SDT.ensure -> true.
// State: fixture item ids in Zotero.ZoteroTTSRun.state.fix4Items; erases a same-title leftover first.
(async () => {
  const out = {};
  const P = Zotero.ZoteroTTSRun.params;
  const S = Zotero.ZoteroTTSRun.state;
  S.fix4Items = S.fix4Items || {};
  const eraseIds = [];
  const eraseOld = async (title) => {
    const s = new Zotero.Search();
    s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
    s.addCondition('title', 'is', title);
    const ids = await s.search();
    for (const id of ids) eraseIds.push(id);
    return ids.length;
  };
  out.erasedLeftovers = {
    parent: await eraseOld('ztts 2026-10-18 188 host'),
    snapshot: await eraseOld('ztts 2026-10-18 188 snapshot'),
    pdf: await eraseOld('ztts 2026-10-18 188 pdf'),
  };
  if (eraseIds.length) {
    await Zotero.Items.eraseTx(eraseIds);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Parent document item
  const parent = new Zotero.Item('document');
  parent.setField('title', 'ztts 2026-10-18 188 host');
  await parent.saveTx();
  S.fix4Items.parent = parent.id;

  // The snapshot, imported as a real snapshot (LINK_MODE_IMPORTED_URL + text/html under a parent)
  const file = P.snapshotHtml;
  const attachment = await Zotero.Attachments.importSnapshotFromFile({
    file,
    url: 'file://' + file,
    title: 'ztts 2026-10-18 188 snapshot',
    contentType: 'text/html',
    charset: 'utf-8',
    parentItemID: parent.id,
  });
  S.fix4Items.snapshot = attachment.id;
  S.fix4Items.snapshotKey = attachment.key;

  // SDT pack: the step limitations.md measures at 68 ms; a false here ends the run
  const ensured = await Zotero.SDT.ensure(attachment.id, { isPriority: true });
  out.sdtEnsured = ensured === true;

  // Disposable PDF fixture (fixture-a: two pages, 17 segments)
  const pdf = await Zotero.Attachments.importFromFile({
    file: P.fixtureA,
    libraryID: Zotero.Libraries.userLibraryID,
    title: 'ztts 2026-10-18 188 pdf',
  });
  S.fix4Items.pdf = pdf.id;
  out.imported = S.fix4Items;

  const rows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.positionRows = rows.database.rows;
  out.baselineRows = S.fix4RowsBaseline ?? (S.fix4RowsBaseline = rows.database.rows);
  return JSON.stringify(out);
})()
