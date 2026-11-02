// Items 3+4, preparation (issue #237): the replacements prefs are reset to
// the baseline (empty — the run's snapshot authorizes it; cleanup restores
// them whole) and the document selection that prefills the row dialog is
// made ('closes' in the fixture's last sentence). THE DIALOG FLOW ITSELF IS
// NOT A SCRIPT: every row dialog is opened by `add.doCommand()`, whose
// openDialog('modal') runs ON THE EVAL'S OWN STACK — the call parks (its
// reply is lost) until the dialog closes, and a script that tries to wait
// for the window with setTimeout sleeps never advances while the modal
// loop runs (both proven 2026-11-03, twice). The flow that ran, one modal
// action per bridge call, each later call a fresh eval that CAN run inside
// the modal loop (synchronous steps only — no awaits, they stall too):
//   1. await Zotero.ZoteroTTS.diagnostics.openReplacementsWindow(index)
//      — returns at once; the window opens from its setTimeout.
//   2. fresh call: find the window via Services.wm (enumerator by id
//      ztts-replacements-window), read intro/columns/rows.
//   3. fresh call: add.doCommand() — PARKS (ignore the lost reply).
//   4. fresh call: read the dialog's fields (prefill, mode, menupopup
//      menuitems, match case, scope, the ? helps), fire-and-forget a
//      drawSnapshot chain for the screenshot (its continuation runs as a
//      task inside the loop; never await it — awaits stall in the loop),
//      then the refusals: setRow + dialog.acceptDialog() + read the error
//      element, all synchronous. acceptDialog on an OPEN dialog does not
//      park anything.
//   5. fresh call: setRow + acceptDialog to ACCEPT — the dialog closes on
//      a LATER task: read the table (`.row .cell` texts) in the NEXT call.
//   6. repeat 3-5 per row (the prefill is the selection made in step 0,
//      captured once at window-open time).
//   7. fresh call: the window's own dialog .acceptDialog() — OK; the
//      writes (prefs + pulse) land AFTER the modal loop exits: read them
//      in the NEXT call.
//   8. fresh call: cancelDialog — Cancel writes nothing; verify the prefs
//      byte-identical in the next call.
// state: reads fixture; writes win4 {pulseBefore}.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const globalPref = prefix + 'readAloud.replacements';
  const docPref = prefix + 'documentReplacements.user/' + fx.key;
  // 1. reset to the baseline (no user value for either), then read the pulse
  Services.prefs.clearUserPref(globalPref);
  Services.prefs.clearUserPref(docPref);
  const pulseBefore = Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0);
  out.pulseBefore = pulseBefore;
  await sleep(900);
  // 2. a selection in the fixture's last sentence ('closes'), as the
  //    selection-start kit does: toDisplayedRange + a range + the reader's
  //    own _openSelectionPopup; the options object needs Cu.cloneInto.
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const rw = view?._iframeWindow;
  const vdoc = view?._iframeDocument;
  const vw = Components.utils.waiveXrays(view);
  try {
    const seg = ir._readAloudSegments.segments[8];
    const position = seg.sourcePosition || seg.position;
    const base = position ? vw.toDisplayedRange(position) : null;
    if (!base) throw new Error('sentence 9 did not resolve to a DOM range');
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
    const full = String(base.toString());
    const at = full.indexOf('closes');
    if (at < 0) throw new Error('the word "closes" is not in sentence 9');
    selRange.setStart(...pointAt(at));
    selRange.setEnd(...pointAt(at + 6));
    const sel = rw.getSelection();
    sel.removeAllRanges();
    sel.addRange(selRange);
    const opts = Components.utils.cloneInto({ bubbles: true }, rw);
    vdoc.dispatchEvent(new rw.Event('selectionchange', opts));
    vw._openSelectionPopup(sel);
    out.selection = String(sel.toString());
  } catch (e) {
    out.selection = { error: String(e) };
  }
  state.win4 = { pulseBefore };
  return JSON.stringify(out, null, 1);
})()
