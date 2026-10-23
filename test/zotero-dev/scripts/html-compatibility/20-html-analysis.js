// Checks 1-2: open each HTML fixture the failure classes cover — the
// reporter's original (imported), bodyless as imported/linked/snapshot, and
// ordinary.html imported (classification isolated from the omitted tag) —
// read diagnostics.htmlDocuments() per item, count pack characters through
// Zotero's own structured-document-text reader, and prove normalization is
// inert: the fixture's script marker never runs in chrome and neither the
// script's text nor the comment's <body> mention leaks into extracted text.
// Closes every tab it opened. params/state: state.fx.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fx;
  if (!fx) throw new Error('run 10 first');
  const out = { step: 'html-analysis' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const chromeRequire = (name) => Reflect.apply(Zotero.getMainWindow().require, Zotero.getMainWindow(), [name]);
  const readPack = async (pack) => {
    const module = chromeRequire('resource://zotero/document-worker/structured-document-text.js');
    const pako = chromeRequire('pako');
    const reader = await module.openStructuredDocumentTextPack(pack.bytes, { inflate: (bytes) => pako.inflateRaw(bytes) });
    const n = reader.getTopLevelBlockCount();
    const blocks = await reader.getBlocks(0, n - 1);
    let chars = 0;
    const firstLines = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let text = typeof b?.text === 'string' ? b.text : '';
      if (!text && Array.isArray(b?.content)) {
        const walk = (node) => {
          if (typeof node === 'string') return node;
          if (typeof node?.text === 'string') return node.text;
          if (Array.isArray(node?.content)) return node.content.map(walk).join('');
          return '';
        };
        text = b.content.map(walk).join('');
      }
      chars += text.length;
      if (firstLines.length < 4) firstLines.push(text.slice(0, 40));
    }
    return { blocks: n, chars, firstLines };
  };

  const rowsAll = async () => { try { return JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments()); } catch (e) { return []; } };

  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  // Close through Zotero's own tab close: reader.close() alone unregisters
  // the reader but can leave the tab-bar entry behind (stale tabs), which
  // then breaks selection and the next popup open.
  const closeFixtureTab = async (reader) => {
    const win = Zotero.getMainWindow();
    const T = win.Zotero_Tabs;
    const tabID = reader.tabID;
    const tabLive = tabID && (T._tabs || []).some((t) => t.id === tabID);
    if (tabLive) T.close(tabID);
    else { const p = reader.close(); if (p && typeof p.then === 'function') await p; }
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const tabGone = !tabID || !(T._tabs || []).some((t) => t.id === tabID);
      if (tabGone && !findReader(reader.itemID)) return true;
      await sleep(150);
    }
    return !findReader(reader.itemID);
  };
  const openAnalyze = async (name, ceilingMs = 45000) => {
    const row = fx[name];
    if (!row?.id) throw new Error(name + ' was not imported');
    const item = Zotero.Items.get(row.id);
    const before = { linkMode: item.attachmentLinkMode, contentType: item.attachmentContentType };
    const opened = Zotero.Reader.open(row.id);
    if (opened && typeof opened.then === 'function') await opened;
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      reader = findReader(row.id);
      if (reader?._internalReader) break;
      await sleep(200);
    }
    if (!reader?._internalReader) throw new Error(name + ': reader never exposed _internalReader');
    // Wait for the hook's own observation to settle.
    let obs = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 45000) {
      const rows = await rowsAll();
      obs = rows.find((r) => r.itemID === row.id) ?? null;
      if (obs && obs.status !== 'preparing') break;
      await sleep(300);
    }
    // Direct pack: characters through Zotero's own reader.
    let charsInfo = null, directErr = null;
    try {
      const pack = await Zotero.SDT.getPack(row.id);
      charsInfo = pack?.ok ? await readPack(pack) : { notOk: pack?.reason ?? 'unknown' };
    } catch (e) { directErr = String(e); }
    const after = { linkMode: Zotero.Items.get(row.id).attachmentLinkMode, contentType: Zotero.Items.get(row.id).attachmentContentType };
    // Close this fixture's tab before the next one.
    out['closed' + name] = await closeFixtureTab(reader);
    return { name, itemID: row.id, before, after, observation: obs, charsInfo, directErr };
  };

  const scriptMarkerBefore = typeof globalThis.htmlCompatibilityScriptExecuted === 'undefined';
  out.results = [];
  for (const name of ['original', 'bodylessImported', 'bodylessLinked', 'bodylessSnapshot', 'ordinaryImported']) {
    out.results.push(await openAnalyze(name));
  }
  out.scriptMarkerUndefinedAfter = typeof globalThis.htmlCompatibilityScriptExecuted === 'undefined';
  out.scriptMarkerWasUndefinedBefore = scriptMarkerBefore;

  // Extracted-text sanity on the bodyless fixture: the comment and the
  // script's text must not be part of the document's readable text.
  const bodyless = out.results.find((r) => r.name === 'bodylessImported');
  out.leakChecks = null;
  try {
    const pack = await Zotero.SDT.getPack(fx.bodylessImported.id);
    const module = chromeRequire('resource://zotero/document-worker/structured-document-text.js');
    const pako = chromeRequire('pako');
    const reader = await module.openStructuredDocumentTextPack(pack.bytes, { inflate: (bytes) => pako.inflateRaw(bytes) });
    const n = reader.getTopLevelBlockCount();
    const blocks = await reader.getBlocks(0, n - 1);
    const all = JSON.stringify(blocks);
    out.leakChecks = {
      blocks: n,
      hasScriptText: all.includes('htmlCompatibilityScriptExecuted'),
      hasCommentText: all.includes('not a body element'),
      hasHeading: all.includes('A small local reading document'),
      hasPara2: all.includes('The second paragraph is the place to remember'),
    };
  } catch (e) { out.leakChecks = { error: String(e) }; }

  out.ok = out.results.every((r) => {
    if (r.name === 'original') return r.observation?.status === 'compatibility' && (r.observation?.blocks ?? 0) > 0;
    return r.observation?.status === 'compatibility' && (r.observation?.blocks ?? 0) > 0 && r.before.linkMode === r.after.linkMode;
  }) && out.scriptMarkerUndefinedAfter && !!out.leakChecks && out.leakChecks.hasHeading && !out.leakChecks.hasScriptText && !out.leakChecks.hasCommentText;
  return JSON.stringify(out, null, 1);
})()
