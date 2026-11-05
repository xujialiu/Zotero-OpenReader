// Open the fixture's reader, prove the plugin's open path named its document,
// then survey the real loaded SDT: every leaf block walked the way
// sdt-anchor.walkSnapshot walks it (run inside the reader window via its own
// Function, exactly as index.ts.blocksSnapshotOf does), with the spec locator
// derived per block by sdt-anchor.elementLocator. This survey is the source
// of every locator and offset the run's phone items use — nothing here is
// assumed from the EPUB markup.
(async () => {
  const out = { step: 'open-survey' };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  try {
    if (!f?.itemID) throw new Error('run 20 first');

    // Self-contained copy of sdt-anchor.walkSnapshot (what index.ts hands the
    // reader window); runs either compartment, reaches outside for nothing.
    const walkSnapshot = function (structure, wantPath) {
      const out = [];
      const related = (path) => {
        if (wantPath === null) return true;
        if (path === wantPath) return true;
        const longer = path.length > wantPath.length ? path : wantPath;
        const shorter = longer === path ? wantPath : path;
        if (longer.indexOf(shorter) !== 0) return false;
        const next = longer.charAt(shorter.length);
        return next === '/' || next === ':' || next === '!';
      };
      const isLeaf = (node) => {
        if (!node || typeof node.text === 'string') return false;
        if (!Array.isArray(node.content) || node.content.length === 0) return true;
        for (let i = 0; i < node.content.length; i++) {
          const child = node.content[i];
          if (child && typeof child.text !== 'string') return false;
        }
        return true;
      };
      const walk = (node, ref) => {
        if (!node || typeof node.text === 'string') return;
        if (isLeaf(node)) {
          const map = node.anchor ? node.anchor.selectorMap : null;
          if (typeof map !== 'string') return;
          const path = map.replace(/\[[^\]]*\]/g, '');
          if (!related(path)) return;
          let text = '';
          const starts = [];
          const nodes = Array.isArray(node.content) ? node.content : [];
          for (let i = 0; i < nodes.length; i++) {
            const child = nodes[i];
            if (child && typeof child.text === 'string') { starts.push(text.length); text += child.text; }
            else starts.push(-1);
          }
          out.push({ ref, path, text, starts });
          return;
        }
        const content = Array.isArray(node.content) ? node.content : [];
        for (let i = 0; i < content.length; i++) walk(content[i], ref.concat(i));
      };
      const top = structure && Array.isArray(structure.content) ? structure.content : [];
      for (let i = 0; i < top.length; i++) walk(top[i], [i]);
      return JSON.stringify(out);
    }.toString();

    // sdt-anchor.elementLocator: the spec locator of a walked path.
    const elementLocator = function (path) {
      const bang = path.indexOf('!');
      if (bang < 0) return null;
      const steps = path.slice(bang + 1).split('/').filter((step) => step !== '');
      while (steps.length && Number(steps[steps.length - 1]) % 2 === 1) steps.pop();
      if (!steps.length) return null;
      const locator = 'epubcfi(' + path.slice(0, bang) + '!/' + steps.join('/') + ')';
      return /^epubcfi\(\/\d*[02468]\/\d*[02468]!(?:\/\d*[02468])+\)$/.test(locator) ? locator : null;
    }.toString();

    const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).length;
    const linesBefore = await linesNow();

    let reader = await Zotero.Reader.open(f.itemID);
    if (reader.tabID) {
      const win = Zotero.getMainWindow();
      try { win.Zotero_Tabs.select(String(reader.tabID)); } catch {}
    }
    const opened = Date.now();
    while (Date.now() - opened < 24000 && !(reader?._internalReader && reader?._internalReader?._readAloudManager)) {
      await sleep(700);
      reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID) || reader;
    }
    f.tabID = reader.tabID;
    out.ready = !!(reader?._internalReader && reader?._internalReader?._readAloudManager);
    out.readyMs = Date.now() - opened;
    if (!out.ready) throw new Error('fixture reader did not become ready in 24 s');

    const internal = reader._internalReader;
    const sdt = await internal._loadSDT();
    const structure = sdt?.structure ?? null;
    out.structureLoaded = !!structure;
    if (!structure) throw new Error('_loadSDT returned no structure');
    const win = waive(reader._iframeWindow);

    // The walk runs in the reader window when it lends its Function (the
    // function's text is evaluated there, as index.ts.blocksSnapshotOf does).
    let blocks = null;
    let walkedIn = null, walkError = null;
    try {
      const walk = new win.Function('structure', 'return (' + walkSnapshot + ')(structure, null)');
      blocks = JSON.parse(walk(structure));
      walkedIn = 'reader window';
    } catch (e) {
      walkError = String(e).slice(0, 120);
      // Sandbox fallback: same walk from chrome, waiving every node (reader
      // compartment arrays answer no chrome callback).
      const json = new Function('structure', 'waive', 'return (' + walkSnapshot + ')(waive(structure), null)')(structure, waive);
      blocks = JSON.parse(json);
      walkedIn = 'chrome (fallback)';
    }
    out.walkedIn = walkedIn;
    if (walkError) out.walkError = walkError;
    state.survey = { blocks: blocks.map((b) => ({ ref: b.ref.join('/'), path: b.path, text: b.text, starts: b.starts })) };

    out.blocks = blocks.map((b) => ({
      ref: b.ref.join('/'),
      path: b.path,
      locator: new Function('elementLocator', 'path', 'return (' + elementLocator + ')(path)')(null, b.path),
      textLen: b.text.length,
      text: b.text,
      starts: b.starts,
      nfc: b.text.normalize('NFC') === b.text,
    }));

    // The document naming the open performed (debug line + documents table).
    out.namedLine = String(await Zotero.Debug.get()).split('\n')
      .filter((l) => l.indexOf('document named on open') !== -1 || l.indexOf('document ids backfilled') !== -1)
      .map((l) => l.slice(l.indexOf('[zotero-tts]'))).slice(-2);
    const path2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database?.path;
    const db = new Zotero.DBConnection(path2);
    try {
      const plainRow = (row, cols) => { const o = {}; if (row) for (const c of cols) o[c] = row[c]; return o; };
      const cols = ['documentId', 'publicationId', 'identifiedAt'];
      out.documentsRow = plainRow(await db.rowQueryAsync('SELECT documentId, publicationId, identifiedAt FROM documents WHERE libraryID=? AND key=?', [f.lib, f.key]), cols);
      out.documentPositionsRow = plainRow(await db.rowQueryAsync('SELECT documentId, stampAt, stampDevice FROM document_positions WHERE documentId=?', [out.documentsRow?.documentId ?? '']), ['documentId', 'stampAt', 'stampDevice']);
    } finally {
      try { await db.closeDatabase(); } catch {}
    }
    out.expectedDocId = state.fixtureDocId;
    out.docIdMatchesOffline = out.documentsRow?.documentId === state.fixtureDocId;
    out.newPluginLines = String(await Zotero.Debug.get()).split('\n')
      .filter((l) => l.indexOf('[zotero-tts]') !== -1).slice(linesBefore).map((l) => l.slice(l.indexOf('[zotero-tts]'))).slice(0, 12);
    out.ok = out.docIdMatchesOffline && out.structureLoaded;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
