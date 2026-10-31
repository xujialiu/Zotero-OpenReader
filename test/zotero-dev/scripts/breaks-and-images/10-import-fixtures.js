// Import the two disposable fixtures of issue #209 (test/fixtures/br-alt-text/):
// the EPUB as a standalone attachment, the HTML as a snapshot attachment under a
// disposable parent webpage item (the html-compatibility kit's method). The source
// files are hashed before and after; nothing about them changes. Items that carry
// these titles already (a leftover of an earlier run) stop the script rather than
// being reused or erased.
// params: fixturesDir. state: writes fx (epub, parent, snapshot: id, key, ...).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'import-fixtures' };
  const sha256File = async (path) => {
    const bytes = await IOUtils.read(path);
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };
  const dir = PathUtils.join(p.fixturesDir, 'br-alt-text'); // variadic join: a 2-arg helper once dropped the file name
  const epubPath = PathUtils.join(dir, 'br-alt-text.epub');
  const htmlPath = PathUtils.join(dir, 'br-alt-text.html');
  const titles = { epub: 'ztts209 br-alt-text EPUB', parent: 'ztts209 br-alt-text snapshot parent', snapshot: 'ztts209 br-alt-text snapshot' };

  // Leftovers: refuse to run over them.
  const s = new Zotero.Search();
  s.libraryID = Zotero.Libraries.userLibraryID;
  s.addCondition('title', 'contains', 'ztts209');
  s.addCondition('includeParentsAndChildren', 'true');
  const existing = await s.search();
  if (existing.length) { out.ok = false; out.stop = 'items titled ztts209 already exist: ' + existing.join(','); return JSON.stringify(out, null, 1); }

  out.sourceSha256 = { epub: await sha256File(epubPath), html: await sha256File(htmlPath) };
  const describe = async (item, title) => {
    const row = { id: item.id, key: item.key, title };
    try { row.linkMode = item.attachmentLinkMode; row.contentType = item.attachmentContentType; } catch (e) { /* a parent has none */ }
    try { const path = await item.getFilePathAsync(); row.fileName = path ? PathUtils.filename(path) : null; row.bytes = path ? (await IOUtils.stat(path)).size : null; } catch (e) { row.pathError = String(e); }
    return row;
  };

  state.fx = {};
  const epub = await Zotero.Attachments.importFromFile({ file: epubPath, contentType: 'application/epub+zip', libraryID: Zotero.Libraries.userLibraryID, title: titles.epub });
  state.fx.epub = await describe(typeof epub === 'number' ? Zotero.Items.get(epub) : epub, titles.epub);

  const parent = new Zotero.Item('webpage');
  parent.libraryID = Zotero.Libraries.userLibraryID;
  parent.setField('title', titles.parent);
  const parentID = await parent.saveTx();
  state.fx.parent = { id: parentID, key: Zotero.Items.get(parentID).key, title: titles.parent };
  const snap = await Zotero.Attachments.importSnapshotFromFile({ file: htmlPath, url: 'file://' + htmlPath, parentItemID: parentID, title: titles.snapshot, contentType: 'text/html', charset: 'utf-8', singleFile: true });
  state.fx.snapshot = await describe(typeof snap === 'number' ? Zotero.Items.get(snap) : snap, titles.snapshot);

  await Zotero.Promise.delay(800); // let the post-import work settle
  out.sourceShaAfter = { epub: await sha256File(epubPath), html: await sha256File(htmlPath) };
  out.sourceUnchanged = out.sourceShaAfter.epub === out.sourceSha256.epub && out.sourceShaAfter.html === out.sourceSha256.html;
  out.fx = state.fx;
  out.ok = !!state.fx.epub.id && !!state.fx.snapshot.id && out.sourceUnchanged
    && state.fx.epub.contentType === 'application/epub+zip' && state.fx.snapshot.contentType === 'text/html';
  return JSON.stringify(out, null, 1);
})()
