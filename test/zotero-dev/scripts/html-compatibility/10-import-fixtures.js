// Check 1-2 setup: import every disposable item the case uses — bodyless
// HTML as imported file, linked file, and snapshot (with a disposable
// parent), ordinary HTML imported and as snapshot, the reporter's original
// (by path, source file hashed before/after and never modified), an empty
// HTML authored under tmpDir for check 6, and PDF/EPUB controls.
// params: htmlFixturesDir, originalFile, fixturesDir, tmpDir, runId.
// state: writes fx.
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'import-fixtures' };
  const join = (...parts) => PathUtils.join(...parts); // variadic: a 2-arg helper silently dropped the filename and imported the directory
  const tag = 'ztts228 ' + String(p.runId || '').slice(0, 16);

  const sha256File = async (path) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    const bytes = await IOUtils.read(path);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };
  const sha256Bytes = (bytes) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };
  const storageListing = async (item) => {
    try {
      const dir = Zotero.Attachments.getStorageDirectory(item).path;
      if (!(await IOUtils.exists(dir))) return { dir: 'absent' };
      const children = await IOUtils.getChildren(dir);
      const rows = [];
      for (const c of children) {
        const p = typeof c === 'string' ? c : c.path;
        rows.push({ name: p.split('/').pop(), type: (await IOUtils.stat(p).catch(() => ({}))).type ?? null });
      }
      return { dir: 'present', files: rows };
    } catch (e) { return { error: String(e) }; }
  };
  const describe = async (raw, title) => {
    const item = typeof raw === 'number' ? Zotero.Items.get(raw) : raw;
    const row = { id: item.id, key: item.key, title, errors: [] };
    try { row.linkMode = item.attachmentLinkMode; } catch (e) { row.errors.push('linkMode: ' + e); }
    try { row.contentType = item.attachmentContentType; } catch (e) { row.errors.push('contentType: ' + e); }
    try {
      const path = await item.getFilePathAsync().catch(() => null);
      row.path = path ?? null;
      if (path) {
        const stat = await IOUtils.stat(path).catch(e => ({ err: String(e) }));
        row.isDirectory = stat?.type === 'directory';
        if (!stat?.err && stat?.type !== 'directory') {
          try { row.sha256 = await sha256File(path); } catch (e) { row.errors.push('sha256: ' + e); }
        }
      }
    } catch (e) { row.errors.push('path: ' + e); }
    try { row.storage = await storageListing(item); } catch (e) { row.errors.push('storage: ' + e); }
    return row;
  };
  const importFile = async (file, title) => describe(await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title }), title);
  const importFileCT = async (file, contentType, title) => describe(await Zotero.Attachments.importFromFile({ file, contentType, libraryID: Zotero.Libraries.userLibraryID, title }), title);
  const linkFile = async (file, title) => describe(await Zotero.Attachments.linkFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title }), title);
  const newParent = async (title) => {
    const item = new Zotero.Item('webpage');
    item.libraryID = Zotero.Libraries.userLibraryID;
    item.setField('title', title);
    return item.saveTx();
  };
  const importSnapshot = async (file, parentID, title) =>
    describe(await Zotero.Attachments.importSnapshotFromFile({ file, url: 'file://' + file, parentItemID: parentID, title, contentType: 'text/html', charset: 'utf-8', singleFile: true }), title);

  await IOUtils.makeDirectory(p.tmpDir, { ignoreExisting: true, createAncestors: true });

  const fx = {};
  const step = async (name, fn) => {
    try { fx[name] = await fn(); } catch (e) { fx[name] = { error: String(e && e.stack ? e.stack.split('\n')[0] : e) }; }
  };

  await step('pdfControl', () => importFile(join(p.fixturesDir, 'fixture-a.pdf'), tag + ' pdf control'));
  // Explicit contentType: with the earlier 2-argument join helper the path
  // silently lost the filename and imported the fixtures directory (test
  // bug, since fixed in join); the explicit type also keeps the import from
  // sniffing the file at all.
  await step('epubControl', () => importFileCT(join(p.fixturesDir, 'scroll-performance', 'scroll-performance.epub'), 'application/epub+zip', tag + ' epub control'));

  await step('bodylessImported', () => importFile(join(p.htmlFixturesDir, 'bodyless.html'), tag + ' bodyless imported'));
  await step('bodylessLinked', () => linkFile(join(p.htmlFixturesDir, 'bodyless.html'), tag + ' bodyless linked'));
  const parentB = await newParent(tag + ' snapshot parent B');
  fx.parentB = { id: parentB, key: Zotero.Items.get(parentB).key, title: tag + ' snapshot parent B' };
  await step('bodylessSnapshot', () => importSnapshot(join(p.htmlFixturesDir, 'bodyless.html'), parentB, tag + ' bodyless snapshot'));
  await step('ordinaryImported', () => importFile(join(p.htmlFixturesDir, 'ordinary.html'), tag + ' ordinary imported'));
  const parentO = await newParent(tag + ' snapshot parent O');
  fx.parentO = { id: parentO, key: Zotero.Items.get(parentO).key, title: tag + ' snapshot parent O' };
  await step('ordinarySnapshot', () => importSnapshot(join(p.htmlFixturesDir, 'ordinary.html'), parentO, tag + ' ordinary snapshot'));

  // The reporter's original: hash the source before and after the import —
  // the file itself must never change; the import only copies it.
  out.originalSourceShaBefore = await sha256File(p.originalFile);
  await step('original', () => importFile(p.originalFile, tag + ' original'));
  out.originalSourceShaAfter = await sha256File(p.originalFile);
  out.originalSourceUnchanged = out.originalSourceShaBefore === out.originalSourceShaAfter;

  // Empty HTML for check 6: a body that carries no readable text.
  const emptyPath = join(p.tmpDir, 'empty.html');
  await IOUtils.writeUTF8(emptyPath, '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Empty fixture</title></head>\n<body><script>var nothingHere = true;</script><style>.x { color: red; }</style></body></html>\n');
  await step('emptyImported', () => importFile(emptyPath, tag + ' empty'));

  // Controls: refresh the storage listing once the post-import work settled.
  await Zotero.Promise.delay(1200);
  for (const name of ['pdfControl', 'epubControl']) {
    const row = fx[name];
    if (row?.id && !row.error) { try { fx[name] = await describe(row.id, row.title); } catch (e) { row.errors = ['redescribe: ' + e]; } }
  }

  state.fx = fx;
  out.fx = fx;
  const ids = Object.entries(fx).filter(([, v]) => v && v.id).map(([, v]) => v.id);
  out.counts = { attachments: ids.length, parents: 2 };
  return JSON.stringify(out, null, 1);
})()
