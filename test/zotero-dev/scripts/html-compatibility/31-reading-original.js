// Check 3 on the authored bodyless fixture — highlight-position proof.
// Self-contained: imports its own fixture, opens its own tab. The drawn
// highlight for HTML views is the view's own spotlight:
//   view._spotlights.get('ReadAloudActiveSegment') -> selector
//   rendered through view.toDisplayedRange(selector) (reader.js 54065)
// with color view._getSpotlightColor('ReadAloudActiveSegment').
// Assertions, no substring search and no whitespace hiding:
//   sentence: range.toString() === segment text (exact; a
//     whitespace-insensitive equality is reported only as supplementary
//     output with both strings verbatim),
//   word: the drawn spotlight's range.toString() === the active
//     timestamp's slice of the segment text (real azure word timing).
// Bounded: one session, heading (segment 0) + first paragraph (segment 1),
// paused as soon as both captures are in or the second sentence ends.
// params: originalFile. state: writes fx2.original, align.original.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'alignment-original' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  state.fx2 = state.fx2 || {};
  if (!state.fx2.original) {
    const imported = await Zotero.Attachments.importFromFile({ file: p.originalFile, libraryID: Zotero.Libraries.userLibraryID, title: 'ztts228b original' });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    state.fx2.original = { id: item.id, key: item.key, linkMode: item.attachmentLinkMode, contentType: item.attachmentContentType };
  }

  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  win.focus();
  const T = win.Zotero_Tabs;

  const itemID = state.fx2.original.id;
  out.itemID = itemID;

  const findReader = () => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  let reader = findReader();
  if (!reader) {
    const opened = Zotero.Reader.open(itemID);
    if (opened && typeof opened.then === 'function') await opened;
    const t = Date.now();
    while (Date.now() - t < 24000 && !(reader = findReader())?.['_internalReader']) await sleep(250);
  }
  if (!reader?._internalReader) throw new Error('original tab could not be opened');
  if (T.selectedID !== reader.tabID) T.select(reader.tabID);
  await sleep(1000);
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  if (manager.active) throw new Error('a session is already active');

  // Azure enabled from its snapshot state (restored at cleanup).
  const azurePref = 'extensions.zotero.zotero-tts.azure.enabled';
  Services.prefs.setBoolPref(azurePref, true);

  // Open the player, hold the session at once, then the deliberate pick
  // (paused pick; Play afterwards restarts the current sentence - bounded).
  reader._iframeWindow.document.notifyUserGestureActivation?.();
  internal.toggleReadAloudPopup(true);
  let active = false;
  for (let i = 0; i < 80 && !active; i++) {
    await sleep(250);
    active = !!manager.active;
    if (active && !manager.paused) { try { manager.togglePaused(); } catch (e) { /* held */ } }
  }
  if (!active) throw new Error('manager never became active after popup open');
  await sleep(400);
  try { manager.selectTier('azure'); } catch (e) { out.tierError = String(e); }
  await sleep(400);
  try { manager.selectVoice('azure::en-US-AIGenerate1Neural'); } catch (e) { out.voiceError = String(e); }
  await sleep(600);
  out.voice = manager.selectedVoiceID ?? null;

  const segments = [];
  {
    const list = waive(internal._readAloudSegments?.segments);
    for (let i = 0; i < (Number(list?.length) || 0); i++) segments.push(String(waive(list[i])?.text ?? ''));
  }
  out.segments = segments.map((t, i) => ({ i, text: t.slice(0, 40) }));
  const view = internal._activePrimaryView ? waive(internal._activePrimaryView) : null;
  if (!view || typeof view.toDisplayedRange !== 'function') throw new Error('active primary view with toDisplayedRange not reachable');
  out.color = typeof view._getSpotlightColor === 'function' ? view._getSpotlightColor('ReadAloudActiveSegment') : null;

  const captures = [];
  const wordSamples = [];
  try {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    try { manager.repositionTo(0); } catch (e) { out.repositionError = String(e); }
    await sleep(400);
    try { if (manager.paused) manager.togglePaused(); } catch (e) { out.playError = String(e); }

    const t0 = Date.now();
    while (Date.now() - t0 < 16000) {
      await sleep(180);
      const pos = typeof manager._controller?.position === 'number' ? manager._controller.position : null;
      const segText = pos !== null && segments[pos] !== undefined ? segments[pos] : null;
      const ts = manager.activeTimestamp;
      const hasWord = ts && typeof ts.charStart === 'number';

      // The selector the view is actually drawing this tick.
      let spotSel = null;
      try { spotSel = waive(view._spotlights).get('ReadAloudActiveSegment') ?? null; } catch (e) { out.spotErr = String(e); }
      let spotText = null, spotRange = null;
      if (spotSel) {
        try {
          spotRange = view.toDisplayedRange(spotSel);
          spotText = spotRange ? waive(spotRange).toString() : null;
        } catch (e) { out.spotRangeErr = String(e); }
      }

      // Word capture: the drawn text vs the real timestamp slice.
      if (hasWord && segText && spotText !== null && spotText !== '') {
        const expected = segText.slice(ts.charStart, ts.charEnd);
        const exact = spotText === expected;
        if (exact || !wordSamples.some((s) => s.spotText === spotText)) {
          wordSamples.push({
            at: Date.now() - t0, pos, charStart: ts.charStart, charEnd: ts.charEnd,
            expectedWord: expected, spotText, exact,
            selectorIsStateWord: (function () { try { return spotSel === waive(waive(internal._state).readAloudState).activeWordSourcePosition; } catch (e) { return 'ERR'; } })(),
          });
        }
      }

      // Sentence capture per segment: the materialized sourcePosition
      // resolved the same way the highlight resolves it.
      if (pos !== null && segText && !captures.some((c) => c.pos === pos)) {
        let sentSel = null, rangeText = null, rects = 0, rect = null, selFromState = null;
        try {
          const segObj = waive(waive(internal._readAloudSegments?.segments)[pos]);
          sentSel = segObj?.sourcePosition ?? null;
          selFromState = (function () { try { const s = waive(waive(internal._state).readAloudState).activeSegment; return s ? s.position ?? null : null; } catch (e) { return 'ERR'; } })();
        } catch (e) { out.segErr = String(e); }
        if (sentSel) {
          try {
            const r = view.toDisplayedRange(sentSel);
            rangeText = r ? waive(r).toString() : null;
            if (r) {
              const rl = waive(r).getClientRects();
              rects = Number(rl?.length) || 0;
              if (rects > 0) {
                const first = waive(rl)[0];
                const iw = view._iframeWindow.innerWidth, ih = view._iframeWindow.innerHeight;
                rect = { top: Math.round(first.top), bottom: Math.round(first.bottom), left: Math.round(first.left), right: Math.round(first.right), viewport: { w: iw, h: ih }, inViewport: first.bottom > 0 && first.top < ih };
              }
            }
          } catch (e) { out.rangeErr = String(e); }
        }
        captures.push({
          pos, segmentText: segText, rangeText,
          exact: rangeText !== null && rangeText === segText,
          whitespaceInsensitive: rangeText !== null && rangeText.replace(/\s+/g, '') === segText.replace(/\s+/g, ''),
          rects, rect, sentSelFromSegment: !!sentSel, stateActivePosition: selFromState,
        });
      }

      const posN = typeof manager._controller?.position === 'number' ? manager._controller.position : null;
      const done = captures.length >= 2 && wordSamples.some((s) => s.exact && s.pos !== null && s.pos >= 1);
      if ((posN !== null && posN >= 2) || manager.paused === true && manager.active === false || done && posN !== null && posN >= 1) {
        try { if (!manager.paused) manager.togglePaused(); } catch (e) { out.boundPauseError = String(e); }
        out.bound = { pos: posN, at: Date.now() - t0 };
        break;
      }
    }
  } finally {
    try { if (!manager.paused) manager.togglePaused(); } catch (e) { out.finalPauseError = String(e); }
  }
  out.captures = captures;
  out.wordSamples = wordSamples;
  await sleep(500);

  const sentOk = captures.length >= 2 && captures.every((c) => c.exact);
  const sentOkWs = captures.length >= 2 && captures.every((c) => c.whitespaceInsensitive);
  const wordOk = wordSamples.some((s) => s.exact);
  out.alignment = {
    sentence: sentOk ? 'exact' : sentOkWs ? 'whitespace-insensitive-only (both strings reported above)' : 'FAIL',
    word: wordOk ? 'exact' : 'FAIL',
    color: out.color,
  };

  const rows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments());
  out.observation = rows.find((r) => r.itemID === itemID) ?? null;

  try { waive(internal).toggleReadAloudPopup(false); } catch (e) { out.closeError = String(e); }
  await sleep(500);
  out.sessionClosed = !manager.active;

  state.align = state.align || {};
  state.align.original = { captures, wordSamples, alignment: out.alignment };
  out.ok = sentOk && wordOk && out.observation?.status === 'compatibility' && out.sessionClosed;
  return JSON.stringify(out, null, 1);
})()
