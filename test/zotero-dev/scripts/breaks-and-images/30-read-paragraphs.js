// Read chosen paragraphs of a fixture and sample the highlight once per paragraph,
// mid-sentence, then pause there (the paused sentence stays drawn, so a screenshot
// can follow). One paragraph = one Zotero Segment, addressed by index into the
// segment list 20 reported. Per sample:
//  - the primary's color through the reader's primary view,
//    view._getSpotlightColor('ReadAloudActiveSegment'), against the plugin's
//    sentence / word color from diagnostics.highlight().style as #rrggbbaa;
//  - diagnostics.highlight() for this reader: primaryShown, sentencePieces
//    (head/tail text, as the diagnostic cuts it at 40 characters), sentenceSlot,
//    granularity, activeWordTimestamp, state;
//  - the text each slot draws, uncut: the primary's, the sentence slot's, the
//    two pieces' (view.toDisplayedRange of the spotlight selector);
//  - the OLD check, computed here: whether range.toString() of the sentence's
//    own selector equals the Segment text once white space is normalized (what
//    the highlight patch accepted before #209). It is false for a sentence that
//    holds an unspaced <br/> or an image with alt text, which is what makes the
//    sample worth anything;
//  - the Engine's session (position, playing, playbackTime) and audio state.
// A "begin"/"end" marker goes into the debug store around each paragraph so the
// [zotero-tts] highlight: lines can be attributed.
// params: which, label (voice kind for the output), indices (segment indexes),
//   maxMs (per paragraph, default 25000), midFraction (a word-timed voice is sampled
//   at the first word starting at or after this share of the sentence, default 0.3;
//   0.45 clears the alt text of a paragraph's inline image, which is no word on the
//   page). state: reads readers[which]; writes samples[...].
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'read-paragraphs', which: p.which, label: p.label, samples: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const WHOLE = 86400;
  const normText = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const toRGBA = (hex, pct) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
    if (!m) return null;
    return '#' + m[1].toLowerCase() + Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255).toString(16).padStart(2, '0');
  };
  if (Services.prefs.getIntPref('extensions.zotero.zotero-tts.readAloud.volume', -1) !== 0) throw new Error('not muted');

  const rd = state.readers?.[p.which];
  if (!rd) throw new Error('no reader for ' + p.which);
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === rd.itemID);
  if (!reader) throw new Error('reader closed');
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  const win = Zotero.getMainWindow();
  if (win.Zotero_Tabs.selectedID !== reader.tabID) win.Zotero_Tabs.select(reader.tabID);
  if (!manager.active) throw new Error('no active session; run 20-open-reader first');
  const view = waive(internal._activePrimaryView || internal._primaryView);
  const segList = waive(internal._readAloudSegments.segments);
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  out.voice = manager.selectedVoiceID ? String(manager.selectedVoiceID).replace(/[0-9a-f]{32}/g, '<32hex>') : null;

  const rangeText = (sel) => {
    try {
      if (!sel) return null;
      const r = view.toDisplayedRange(sel);
      return r ? String(waive(r).toString()) : null;
    } catch (e) { return 'ERR ' + String(e).slice(0, 80); }
  };
  const colorOf = (key) => { try { return view._getSpotlightColor(key); } catch (e) { return 'ERR ' + String(e).slice(0, 80); } };
  const kindOf = (ts) => (!ts ? 'none' : (ts.start === 0 && ts.end === WHOLE ? 'stand-in' : 'real'));

  const sampleNow = async (idx, segText, ts, kind, msToReady) => {
    const spot = waive(view._spotlights);
    const sel = (k) => { try { return spot.get(k) ?? null; } catch (e) { return null; } };
    const hl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlight());
    const row = hl[readerIndex] ?? null;
    const dom = (row?.views || []).find((v) => v.kind === 'dom') ?? null;
    const style = row?.style ?? null;
    const expected = style ? { sentence: toRGBA(style.sentenceColor, style.sentenceAlpha), word: toRGBA(style.wordColor, style.wordAlpha) } : null;
    const primaryColor = colorOf('ReadAloudActiveSegment');
    const sentenceSel = segList[idx] ? waive(segList[idx]).sourcePosition : null;
    const sentencePageText = rangeText(sentenceSel);
    const eng = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine ? await Zotero.ZoteroTTS.diagnostics.engine() : '{}').readers?.[readerIndex] ?? null;
    const audio = eng?.audio ?? null;
    const word = kind === 'real' ? segText.slice(ts.charStart, ts.charEnd) : null;
    const s = {
      index: idx, segment: segText, kind, msToReady,
      word: kind === 'real' ? { text: word, charStart: ts.charStart, charEnd: ts.charEnd } : null,
      primaryColor, expected,
      primaryIsTransparent: primaryColor === '#00000000',
      primaryIsSentenceColor: primaryColor === expected?.sentence,
      primaryIsWordColor: primaryColor === expected?.word,
      primaryShown: dom?.primaryShown ?? null,
      granularity: dom?.granularity ?? null,
      activeWordTimestamp: dom?.activeWordTimestamp ?? null,
      patched: dom?.patched ?? null,
      domState: dom?.state ?? null,
      sentenceSlot: dom?.sentenceSlot ?? null,
      sentencePieces: dom?.sentencePieces ?? null,
      drawn: {
        primary: rangeText(sel('ReadAloudActiveSegment')),
        sentenceSlot: rangeText(sel('ReadAloudActiveSentence')),
        head: sel('ZoteroTTSSentenceHead') ? rangeText(sel('ZoteroTTSSentenceHead')) : null,
        tail: sel('ZoteroTTSSentenceTail') ? rangeText(sel('ZoteroTTSSentenceTail')) : null,
      },
      pieceColors: {
        head: sel('ZoteroTTSSentenceHead') ? colorOf('ZoteroTTSSentenceHead') : null,
        tail: sel('ZoteroTTSSentenceTail') ? colorOf('ZoteroTTSSentenceTail') : null,
        sentenceSlot: sel('ReadAloudActiveSentence') ? colorOf('ReadAloudActiveSentence') : null,
      },
      sentencePageText,
      oldCheckPasses: sentencePageText !== null && normText(sentencePageText) === normText(segText),
      engine: eng ? { position: eng.session?.position ?? null, playing: eng.session?.playing ?? null, playbackTime: eng.session?.playbackTime ?? null, audio: audio ? { state: audio.state ?? null, currentTime: audio.currentTime ?? null, gain: audio.gain ?? audio.volume ?? null } : null } : null,
    };
    // The pieces together hold the sentence around the word: head + word + tail, uncut, on the page.
    if (s.drawn.head !== null || s.drawn.tail !== null) {
      s.pieceJoin = (s.drawn.head ?? '') + (kind === 'real' ? (rangeText(sel('ReadAloudActiveSegment')) ?? '') : '') + (s.drawn.tail ?? '');
      s.pieceJoinEqualsPage = sentencePageText !== null && normText(s.pieceJoin) === normText(sentencePageText);
    }
    return s;
  };

  const maxMs = p.maxMs || 25000;
  const notes = [];
  for (const idx of p.indices) {
    const segText = String(waive(segList[idx])?.text ?? '');
    Zotero.debug(`ZTTS209-MARK begin ${p.which}/${p.label}/segment ${idx}`);
    // Position while paused, then play.
    if (!manager.paused) { manager.togglePaused(); await sleep(250); }
    manager.repositionTo(idx);
    await sleep(400);
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    if (manager.paused) manager.togglePaused();
    const t0 = Date.now();
    let active0 = null;
    let sampled = null;
    while (Date.now() - t0 < maxMs) {
      await sleep(110);
      const seg = manager._activeSegment ? waive(manager._activeSegment) : null;
      if (!seg || String(seg.text) !== segText) continue;
      if (active0 === null) active0 = Date.now();
      const ts = manager.activeTimestamp ? waive(manager.activeTimestamp) : null;
      const kind = kindOf(ts);
      const since = Date.now() - active0;
      let ready = false;
      if (kind === 'real') ready = ts.charStart >= Math.floor(segText.length * (p.midFraction ?? 0.3)) && ts.charEnd <= segText.length - 4;
      else if (kind === 'stand-in') ready = since >= 800;
      else ready = since >= 1500;
      if (!ready && Date.now() - t0 > maxMs - 3000 && since >= 500) ready = true; // late: take what is there
      if (ready) {
        sampled = await sampleNow(idx, segText, ts, kind, Date.now() - t0);
        break;
      }
    }
    // Pause right here: the paused sentence stays drawn.
    try { if (!manager.paused) manager.togglePaused(); } catch (e) { notes.push('pause ' + idx + ': ' + String(e)); }
    await sleep(350);
    if (!sampled) { sampled = { index: idx, segment: segText, timedOut: true }; }
    sampled.pausedAfter = !!manager.paused;
    out.samples.push(sampled);
    Zotero.debug(`ZTTS209-MARK end ${p.which}/${p.label}/segment ${idx}`);
  }
  out.notes = notes;

  // The debug store's lines for this call: highlight lines and markers, in order.
  const log = String(await Zotero.Debug.get());
  const lines = log.split('\n');
  let start = -1;
  const firstMarker = `ZTTS209-MARK begin ${p.which}/${p.label}/segment ${p.indices[0]}`;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].includes(firstMarker)) { start = i; break; }
  out.logLines = (start < 0 ? [] : lines.slice(start)).filter((l) => /ZTTS209-MARK|highlight:|\[zotero-tts\]/.test(l)).map((l) => l.replace(/[0-9a-f]{32}/g, '<32hex>').slice(0, 260));

  state.samples = state.samples || [];
  state.samples.push({ which: p.which, label: p.label, samples: out.samples, logLines: out.logLines });
  out.ok = out.samples.length === p.indices.length && out.samples.every((s) => !s.timedOut);
  return JSON.stringify(out, null, 1);
})()
