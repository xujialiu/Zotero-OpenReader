// Items 3+4 (issue #237): the row dialog and the window's writes, driven
// through the real UI. The window is opened with diagnostics.openReplacements
// Window(index), whose internal setTimeout makes it appear while this script
// still runs — a modal opened from the eval's own stack (the Player click's
// path) only opens after the script unwinds. 12a proves the click's path.
// Resets the replacements prefs to the baseline (empty) first — the run's
// snapshot authorizes it; cleanup restores them whole — makes a selection in
// the fixture document, drives the row dialog through the five refusals and
// the accepted rows (a prefill row, the case's two document rows, the case's
// two global rows), removes the prefill row, OKs, and checks the written
// prefs, the pulse and diagnostics.replacements(). Reopens the window, adds
// a temp row, Cancels, and checks nothing was written. params: none.
// state: reads fixture; writes win4 (pulse before) for 12/17.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const topId = () => safe(() => Services.wm.getMostRecentWindow(null)?.document?.documentElement?.id);
  const globalPref = prefix + 'readAloud.replacements';
  const docPref = prefix + 'documentReplacements.user/' + fx.key;
  // 1. reset to the baseline (no user value for either)
  Services.prefs.clearUserPref(globalPref);
  Services.prefs.clearUserPref(docPref);
  const pulseBefore = Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0);
  out.pulseBefore = pulseBefore;
  await sleep(900);
  const repAfterClear = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.ownerAfterClear = safe(() => ({ changed: repAfterClear.readers?.[0]?.lastEdit?.changed, outcome: repAfterClear.readers?.[0]?.lastEdit?.outcome }));
  out.fixtureRowsAfterClear = safe(() => repAfterClear.readers?.[1]?.rows);
  // 2. a selection in sentence 9 ('closes'), as the selection-start kit does
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const rw = view?._iframeWindow;
  const vdoc = view?._iframeDocument;
  const vw = Components.utils.waiveXrays(view);
  let selectionText = null;
  try {
    const seg = ir._readAloudSegments.segments[8];
    const position = seg.sourcePosition || seg.position;
    const base = position ? vw.toDisplayedRange(position) : null;
    if (!base) throw new Error('sentence 9 did not resolve to a DOM range');
    const full = String(base.toString());
    const at = full.indexOf('closes');
    if (at < 0) throw new Error('the word "closes" is not in sentence 9');
    const nodes = [];
    const rootEl = base.commonAncestorContainer.nodeType === rw.Node.TEXT_NODE ? base.commonAncestorContainer.parentNode : base.commonAncestorContainer;
    const walker = vdoc.createTreeWalker(rootEl, rw.NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) { try { if (base.intersectsNode(n)) nodes.push(n); } catch (e) {} }
    const pointAt = (offset) => {
      let remaining = Math.max(0, offset);
      for (const node of nodes) {
        const lo = node === base.startContainer ? base.startOffset : 0;
        const hi = node === base.endContainer ? base.endOffset : String(node.nodeValue || '').length;
        const avail = Math.max(0, hi - lo);
        if (remaining <= avail) return [node, lo + remaining];
        remaining -= avail;
      }
      return [base.endContainer, base.endOffset];
    };
    const selRange = vdoc.createRange();
    selRange.setStart(...pointAt(at));
    selRange.setEnd(...pointAt(at + 6));
    const sel = rw.getSelection();
    sel.removeAllRanges();
    sel.addRange(selRange);
    const opts = Components.utils.cloneInto({ bubbles: true }, rw);
    vdoc.dispatchEvent(new rw.Event('selectionchange', opts));
    vw._openSelectionPopup(sel);
    const popup = safe(() => ir._state?.primaryViewSelectionPopup ?? ir._state?.secondaryViewSelectionPopup);
    selectionText = String(sel.toString());
    out.selection = { viewText: selectionText, popupText: safe(() => popup?.annotation?.text ?? null) };
  } catch (e) {
    out.selection = { error: String(e) };
  }
  // 3. open the window (the wrapper's setTimeout makes it appear mid-script)
  await Zotero.ZoteroTTS.diagnostics.openReplacementsWindow(fx.readerIndex);
  let win = null;
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    if (topId() === 'ztts-replacements-window') { win = Services.wm.getMostRecentWindow(null); break; }
  }
  if (!win) throw new Error('the replacements window did not open');
  const wdoc = win.document;
  out.windowIntro = safe(() => wdoc.getElementById('ztts-replacements-intro')?.textContent);
  out.windowColumns = safe(() => Array.from(wdoc.querySelectorAll('#ztts-replacements-tree .virtualized-table-header .cell .label')).map(l => l.textContent));
  out.rowsBefore = safe(() => wdoc.querySelectorAll('#ztts-replacements-tree .row').length);
  // 4. the row dialog
  const rowDialogFlow = async () => {
    safe(() => wdoc.getElementById('ztts-replacements-add').doCommand());
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      if (topId() === 'ztts-replacement-row-window') return Services.wm.getMostRecentWindow(null);
    }
    return null;
  };
  const readRowDialog = (rd) => {
    const d = rd.document;
    return {
      text: safe(() => d.getElementById('ztts-replacement-text').value),
      readAs: safe(() => d.getElementById('ztts-replacement-read-as').value),
      mode: safe(() => d.getElementById('ztts-replacement-mode').value),
      matchCase: safe(() => d.getElementById('ztts-replacement-match-case').checked),
      scope: safe(() => d.getElementById('ztts-replacement-scope').value),
      scopeRowHidden: safe(() => d.getElementById('ztts-replacement-scope-row')?.hidden),
      helpIcons: safe(() => ['ztts-help-replacement-mode', 'ztts-help-replacement-match-case', 'ztts-help-replacement-scope'].map(id => {
        const el = d.querySelector(`[data-l10n-id="${id}"]`);
        return { id, helpHead: el?.getAttribute('help')?.slice(0, 40) ?? null };
      })),
      title: safe(() => d.title),
    };
  };
  const setRow = (rd, f) => {
    const d = rd.document;
    if (f.text !== undefined) { const el = d.getElementById('ztts-replacement-text'); el.value = f.text; el.dispatchEvent(new rd.Event('input', { bubbles: true })); }
    if (f.readAs !== undefined) { const el = d.getElementById('ztts-replacement-read-as'); el.value = f.readAs; el.dispatchEvent(new rd.Event('input', { bubbles: true })); }
    if (f.mode !== undefined) d.getElementById('ztts-replacement-mode').value = f.mode;
    if (f.matchCase !== undefined) d.getElementById('ztts-replacement-match-case').checked = f.matchCase;
    if (f.scope !== undefined) d.getElementById('ztts-replacement-scope').value = f.scope;
  };
  const refuse = async (rd, fields) => {
    setRow(rd, fields);
    safe(() => rd.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
    await sleep(200);
    return {
      stillOpen: topId() === 'ztts-replacement-row-window',
      error: safe(() => rd.document.getElementById('ztts-replacement-error')?.textContent),
      hidden: safe(() => rd.document.getElementById('ztts-replacement-error')?.hidden),
    };
  };
  const rd1 = await rowDialogFlow();
  if (!rd1) throw new Error('the row dialog did not open from +');
  out.rowDialog1 = readRowDialog(rd1);
  out.refusals = {};
  out.refusals.empty = await refuse(rd1, { text: '' });
  out.refusals.syntax = await refuse(rd1, { text: 'IL-(\\d+', readAs: 'x', mode: 'regex' });
  out.refusals.emptyMatch = await refuse(rd1, { text: 'a*', mode: 'regex' });
  out.refusals.placeholders = await refuse(rd1, { text: 'IL-*', mode: 'wildcard', readAs: '* *' });
  setRow(rd1, { text: selectionText ?? 'closes', readAs: 'closes the fixture', mode: 'exact', matchCase: true, scope: 'document' });
  safe(() => rd1.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  const rd2 = await rowDialogFlow();
  out.rowDialog2Prefilled = safe(() => rd2?.document?.getElementById('ztts-replacement-text')?.value);
  setRow(rd2, { text: 'IL-6', readAs: 'interleukin six', mode: 'exact', matchCase: true, scope: 'document' });
  safe(() => rd2.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  const rd3 = await rowDialogFlow();
  out.refusals.duplicate = await refuse(rd3, { text: 'IL-6', readAs: 'x', mode: 'exact', matchCase: true, scope: 'document' });
  setRow(rd3, { text: 'anti IL-*', readAs: 'anti-interleukin *', mode: 'wildcard', matchCase: false, scope: 'document' });
  safe(() => rd3.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  const rd4 = await rowDialogFlow();
  setRow(rd4, { text: 'IL-*', readAs: 'interleukin *', mode: 'wildcard', matchCase: true, scope: 'global' });
  safe(() => rd4.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  const rd5 = await rowDialogFlow();
  setRow(rd5, { text: '(\\d+) ?mg\\b', readAs: '$1 milligrams', mode: 'regex', matchCase: true, scope: 'global' });
  safe(() => rd5.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  out.tableBeforeOk = safe(() => Array.from(wdoc.querySelectorAll('#ztts-replacements-tree .row')).map(row => Array.from(row.querySelectorAll('.cell')).map(c => c.textContent)));
  // 5. remove the prefill row
  const row0 = safe(() => wdoc.querySelectorAll('#ztts-replacements-tree .row')[0]);
  row0?.click();
  await sleep(250);
  out.removeStep = {
    editEnabledAfterClick: safe(() => !wdoc.getElementById('ztts-replacements-edit').disabled),
    row0Text: safe(() => row0?.textContent),
  };
  if (out.removeStep.editEnabledAfterClick) {
    safe(() => wdoc.getElementById('ztts-replacements-remove').doCommand());
    await sleep(300);
  }
  out.tableAfterRemove = safe(() => Array.from(wdoc.querySelectorAll('#ztts-replacements-tree .row')).map(row => Array.from(row.querySelectorAll('.cell')).map(c => c.textContent)));
  // 6. OK writes
  state.win4 = { pulseBefore };
  safe(() => wdoc.getElementById('ztts-replacements-dialog').acceptDialog());
  await sleep(800);
  out.afterOk = {
    windowGone: topId() !== 'ztts-replacements-window',
    globalPref: safe(() => Zotero.Prefs.get('zotero-tts.readAloud.replacements', true)),
    docPref: safe(() => Zotero.Prefs.get('zotero-tts.documentReplacements.user/' + fx.key, true)),
    pulse: Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0),
  };
  out.afterOk.pulseIncremented = out.afterOk.pulse === pulseBefore + 1;
  const repAfterOk = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.afterOk.fixtureReader = safe(() => ({ rows: repAfterOk.readers?.[1]?.rows, documentRows: repAfterOk.readers?.[1]?.documentRows }));
  // 7. Cancel writes nothing
  await Zotero.ZoteroTTS.diagnostics.openReplacementsWindow(fx.readerIndex);
  let win2 = null;
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    if (topId() === 'ztts-replacements-window') { win2 = Services.wm.getMostRecentWindow(null); break; }
  }
  if (!win2) throw new Error('the reopened window did not appear');
  const wdoc2 = win2.document;
  const before = {
    global: safe(() => Zotero.Prefs.get('zotero-tts.readAloud.replacements', true)),
    doc: safe(() => Zotero.Prefs.get('zotero-tts.documentReplacements.user/' + fx.key, true)),
    pulse: Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0),
  };
  const rd6 = await (async () => {
    safe(() => wdoc2.getElementById('ztts-replacements-add').doCommand());
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      if (topId() === 'ztts-replacement-row-window') return Services.wm.getMostRecentWindow(null);
    }
    return null;
  })();
  setRow(rd6, { text: 'TEMPROW never saved', readAs: 'x', mode: 'exact', matchCase: true, scope: 'global' });
  safe(() => rd6.document.getElementById('ztts-replacement-row-dialog').acceptDialog());
  await sleep(300);
  safe(() => wdoc2.getElementById('ztts-replacements-dialog').cancelDialog());
  await sleep(800);
  const after = {
    global: safe(() => Zotero.Prefs.get('zotero-tts.readAloud.replacements', true)),
    doc: safe(() => Zotero.Prefs.get('zotero-tts.documentReplacements.user/' + fx.key, true)),
    pulse: Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0),
  };
  out.cancelCheck = { before, after, identical: before.global === after.global && before.doc === after.doc && before.pulse === after.pulse };
  // clear the selection popup
  safe(() => { try { vw.setSelectionPopup(null); } catch (e) {} try { rw.getSelection()?.removeAllRanges(); } catch (e) {} });
  return JSON.stringify(out, null, 1);
})()
