// Items 2-5 (issues #235, #236): read one Segment of an open fixture Player, PAUSE ON A CHOSEN WORD, and sample
// what the primary draws while it is paused there. One call holds a list of targets; each target is one pause.
//   target = { name, index, word?: [charStart, charEnd], mid?: share, expectKind?: 'real' | 'stand-in' }
//   - word: pause on the first word event whose timestamp covers exactly those characters (the word "A" of
//     Segment 6 is [0, 1], "small" [2, 7]). The word is lit for a fraction of a second, so the poll is a few ms
//     and starts at the repositionTo call itself; the pause is a togglePaused() in the tick that sees the word,
//     and the sample counts only if the manager still names the same word after the pause settles. A word that
//     went by (or was not held) is retried from a fresh repositionTo, up to `tries` times.
//   - mid: pause on the first word starting at or after that share of the sentence (breaks-and-images/30's rule,
//     with the finer poll).
//   - neither (a voice without word timing: the whole Segment is one stand-in word): pause 800 ms after the
//     Segment is active.
// Per sample: the primary's colour (view._getSpotlightColor('ReadAloudActiveSegment')) against the plugin's word /
// sentence colour from diagnostics.highlight().style; the primary's selector (type, conformsTo, value,
// refinedBy) from view._spotlights; the text it draws (view.toDisplayedRange(selector).toString()) and its client
// rects (the window must be restored for layout); ZOTERO'S OWN selector for the same word
// (internal._computeActiveWordSourcePosition on a stand-in manager built in the reader's realm, as the #235/#236
// research did) with the text it draws, and whether the primary is that very selector; the Segment's own
// sourcePosition and the text IT draws (null = it resolves to nothing); diagnostics.highlight()'s primaryShown,
// granularity, sentencePieces; the two pieces' text uncut and whether head + word + tail is the Segment; the
// Engine's session. "ZTTS209-MARK begin|end <which>/<label>[-<name>]/segment N" goes into the debug store round
// each target (the format breaks-and-images/50-log-lines.js sorts the [zotero-tts] highlight: lines by).
// Refuses: a volume other than 0, a minimized window, a voice without '::' (Zotero's own, metered), a Fish voice
// while fish.model is not the free model.
// params: which, label, targets[], maxMs (per attempt, default 25000), tries (default 3), pollMs (default 4),
//   freeFishModel (default 's2.1-pro-free'). state: reads readers[which]; pushes to samples.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'read-and-sample', which: p.which, label: p.label, summary: [], samples: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const P = 'extensions.zotero.zotero-tts.';
  const WHOLE = 86400;
  const normText = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const mask = (s) => (s == null ? s : String(s).replace(/[0-9a-f]{32}/g, '<32hex>'));
  const toRGBA = (hex, pct) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
    if (!m) return null;
    return '#' + m[1].toLowerCase() + Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255).toString(16).padStart(2, '0');
  };
  if (Services.prefs.getIntPref(P + 'readAloud.volume', -1) !== 0) throw new Error('not muted');
  if (!Array.isArray(p.targets) || !p.targets.length) throw new Error('no targets');

  const rd = state.readers?.[p.which];
  if (!rd) throw new Error('no reader for ' + p.which);
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === rd.itemID);
  if (!reader) throw new Error('reader closed');
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) throw new Error('window is minimized; the primary has no layout (20-open-reader restores it)');
  if (win.Zotero_Tabs.selectedID !== reader.tabID) win.Zotero_Tabs.select(reader.tabID);
  if (!manager.active) throw new Error('no active session; run 20-open-reader first');
  const voiceId = manager.selectedVoiceID ? String(manager.selectedVoiceID) : '';
  if (!voiceId.includes('::')) throw new Error('the selected voice is one of Zotero\'s own (no ::); refusing to spend credits');
  out.voice = mask(voiceId);
  out.provider = voiceId.split('::')[0];
  if (out.provider === 'fish') {
    out.fishModel = Services.prefs.getStringPref(P + 'fish.model', '');
    if (out.fishModel !== (p.freeFishModel || 's2.1-pro-free')) throw new Error('fish.model is "' + out.fishModel + '", not the free model');
  }
  const view = waive(internal._activePrimaryView || internal._primaryView);
  const segList = waive(internal._readAloudSegments.segments);
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const RObject = waive(Object.getPrototypeOf(waive(segList[0]))).constructor; // the reader realm's Object
  const mk = (o) => { const r = new RObject(); for (const k of Object.keys(o)) r[k] = o[k]; return r; };
  out.windowState = win.windowState;

  const plainSel = (s0) => {
    if (!s0) return null;
    const s = waive(s0);
    const ref = s.refinedBy ? waive(s.refinedBy) : null;
    return {
      type: String(s.type), conformsTo: s.conformsTo === undefined ? undefined : String(s.conformsTo), value: s.value === undefined ? null : String(s.value),
      refinedBy: ref ? { type: String(ref.type), start: ref.start, end: ref.end } : null,
    };
  };
  const rangeText = (sel) => {
    try {
      if (!sel) return null;
      const r = view.toDisplayedRange(sel);
      return r ? String(waive(r).toString()) : null;
    } catch (e) { return 'ERR ' + String(e).slice(0, 80); }
  };
  const rectsOf = (sel) => {
    try {
      if (!sel) return null;
      const r = view.toDisplayedRange(sel);
      if (!r) return null;
      const list = waive(r).getClientRects();
      const rects = [];
      for (let i = 0; i < Math.min(list.length, 6); i++) rects.push({ w: Math.round(list[i].width * 100) / 100, h: Math.round(list[i].height * 100) / 100 });
      return { count: list.length, rects };
    } catch (e) { return { error: String(e).slice(0, 80) }; }
  };
  const colorOf = (key) => { try { return view._getSpotlightColor(key); } catch (e) { return 'ERR ' + String(e).slice(0, 80); } };
  const kindOf = (ts) => (!ts ? 'none' : (ts.start === 0 && ts.end === WHOLE ? 'stand-in' : 'real'));
  const activeSeg = () => (manager._activeSegment ? waive(manager._activeSegment) : null);
  const activeTs = () => { try { return manager.activeTimestamp ? waive(manager.activeTimestamp) : null; } catch (e) { return null; } };

  const sampleNow = async (target, idx, segText, ts, kind, extra) => {
    const spot = waive(view._spotlights);
    const sel = (k) => { try { return spot.get(k) ?? null; } catch (e) { return null; } };
    const hl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlight());
    const row = hl[readerIndex] ?? null;
    const dom = (row?.views || []).find((v) => v.kind === 'dom') ?? null;
    const style = row?.style ?? null;
    const expected = style ? { sentence: toRGBA(style.sentenceColor, style.sentenceAlpha), word: toRGBA(style.wordColor, style.wordAlpha) } : null;
    const seg = waive(segList[idx]);
    const primarySel = sel('ReadAloudActiveSegment');
    const primaryColor = colorOf('ReadAloudActiveSegment');
    const primary = plainSel(primarySel);
    const word = kind === 'real' ? segText.slice(ts.charStart, ts.charEnd) : null;

    // Zotero's own selector for this very word (or the whole Segment, for the stand-in).
    let own = null;
    if (ts) {
      try {
        const cs = Number.isInteger(ts.charStart) ? ts.charStart : 0;
        const ce = Number.isInteger(ts.charEnd) ? ts.charEnd : segText.length;
        const r = internal._computeActiveWordSourcePosition(mk({ activeSegment: seg, activeTimestamp: mk({ charStart: cs, charEnd: ce }) }));
        own = { selector: plainSel(r), draws: rangeText(r), rects: rectsOf(r) };
        own.isPrimary = JSON.stringify(own.selector) === JSON.stringify(primary);
      } catch (e) { own = { error: String(e).slice(0, 120) }; }
    }
    const segmentOwn = seg.sourcePosition ? { selector: plainSel(seg.sourcePosition), draws: rangeText(seg.sourcePosition) } : null;

    const eng = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine ? await Zotero.ZoteroTTS.diagnostics.engine() : '{}').readers?.[readerIndex] ?? null;
    const s = {
      index: idx, name: target.name ?? null, segment: segText, kind, kindExpected: target.expectKind ?? null, ...extra,
      word: kind === 'real' ? { text: word, charStart: ts.charStart, charEnd: ts.charEnd } : null,
      primary: { color: primaryColor, selector: primary, draws: rangeText(primarySel), rects: rectsOf(primarySel) },
      expected,
      switches: style ? { sentence: style.sentence ?? null, word: style.word ?? null } : null,
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
      zoteroOwnWord: own,
      zoteroOwnSegment: segmentOwn,
      drawn: {
        sentenceSlot: rangeText(sel('ReadAloudActiveSentence')),
        head: sel('ZoteroTTSSentenceHead') ? rangeText(sel('ZoteroTTSSentenceHead')) : null,
        tail: sel('ZoteroTTSSentenceTail') ? rangeText(sel('ZoteroTTSSentenceTail')) : null,
      },
      pieceColors: {
        head: sel('ZoteroTTSSentenceHead') ? colorOf('ZoteroTTSSentenceHead') : null,
        tail: sel('ZoteroTTSSentenceTail') ? colorOf('ZoteroTTSSentenceTail') : null,
        sentenceSlot: sel('ReadAloudActiveSentence') ? colorOf('ReadAloudActiveSentence') : null,
      },
      engine: eng ? { position: eng.session?.position ?? null, playing: eng.session?.playing ?? null, playbackTime: eng.session?.playbackTime ?? null, audio: eng.audio ? { state: eng.audio.state ?? null, currentTime: eng.audio.currentTime ?? null } : null } : null,
    };
    if (s.drawn.head !== null || s.drawn.tail !== null) {
      s.pieceJoin = (s.drawn.head ?? '') + (kind === 'real' ? (s.primary.draws ?? '') : '') + (s.drawn.tail ?? '');
      s.pieceJoinEqualsSegment = normText(s.pieceJoin) === normText(segText);
    }
    return s;
  };

  const maxMs = p.maxMs || 25000;
  const tries = p.tries || 3;
  const pollMs = p.pollMs || 4;
  const notes = [];
  for (const target of p.targets) {
    const idx = target.index;
    const segText = String(waive(segList[idx])?.text ?? '');
    const mode = Array.isArray(target.word) ? 'word' : (typeof target.mid === 'number' ? 'mid' : 'whole');
    const [wantStart, wantEnd] = mode === 'word' ? target.word : [null, null];
    const marker = `${p.which}/${p.label}${target.name ? '-' + target.name : ''}/segment ${idx}`;
    Zotero.debug(`ZTTS209-MARK begin ${marker}`);
    const attempts = [];
    let sampled = null;
    for (let attempt = 1; attempt <= tries && !sampled; attempt++) {
      const a = { attempt, mode, result: null };
      attempts.push(a);
      // Hold still, then start the Segment from its first word. repositionTo on a paused session resumes it.
      if (!manager.paused) { manager.togglePaused(); await sleep(300); }
      reader._iframeWindow.document.notifyUserGestureActivation?.();
      const t0 = Date.now();
      manager.repositionTo(idx);
      let active0 = null;
      let at = null; // the timestamp the loop stopped on
      let atKind = null;
      while (Date.now() - t0 < maxMs) {
        await sleep(pollMs);
        if (manager.paused && Date.now() - t0 > 300 && !a.resumedAfterMs) { // repositionTo did not resume it
          reader._iframeWindow.document.notifyUserGestureActivation?.();
          manager.togglePaused();
          a.resumedAfterMs = Date.now() - t0;
        }
        const seg = activeSeg();
        if (!seg || String(seg.text) !== segText) continue;
        if (active0 === null) active0 = Date.now();
        const ts = activeTs();
        const kind = kindOf(ts);
        const since = Date.now() - active0;
        if (kind === 'real' && !a.firstWord) a.firstWord = { charStart: ts.charStart, charEnd: ts.charEnd, text: segText.slice(ts.charStart, ts.charEnd), afterMs: Date.now() - t0 };
        if (mode === 'word') {
          if (kind === 'stand-in') { a.result = 'stand-in'; break; } // no word timing: the target cannot be reached
          if (kind === 'real' && ts.charStart === wantStart && ts.charEnd === wantEnd) { if (!manager.paused) manager.togglePaused(); at = ts; atKind = kind; a.result = 'caught'; a.pausedAfterMs = Date.now() - t0; break; }
          if (kind === 'real' && ts.charStart > wantStart) { if (!manager.paused) manager.togglePaused(); a.result = 'missed'; a.passedTo = { charStart: ts.charStart, charEnd: ts.charEnd }; break; }
        } else {
          let ready = false;
          if (kind === 'real') ready = ts.charStart >= Math.floor(segText.length * (mode === 'mid' ? target.mid : 0.3)) && ts.charEnd <= segText.length - 4;
          else if (kind === 'stand-in') ready = since >= 800;
          else ready = since >= 1500;
          if (!ready && Date.now() - t0 > maxMs - 3000 && since >= 500) ready = true; // late: take what is there
          if (ready) { if (!manager.paused) manager.togglePaused(); at = ts; atKind = kind; a.result = 'caught'; a.pausedAfterMs = Date.now() - t0; break; }
        }
      }
      if (a.result === null) a.result = 'timeout';
      try { if (!manager.paused) manager.togglePaused(); } catch (e) { notes.push('pause ' + idx + ': ' + String(e)); }
      await sleep(350);
      if (a.result === 'stand-in') break;
      if (a.result !== 'caught') continue;
      // The pause must hold the word: re-read it once the session has settled.
      const ts2 = activeTs();
      const kind2 = kindOf(ts2);
      a.afterPause = { paused: !!manager.paused, kind: kind2, charStart: ts2?.charStart ?? null, charEnd: ts2?.charEnd ?? null };
      if (!manager.paused) { a.result = 'not-paused'; continue; }
      if (mode === 'word' && !(kind2 === 'real' && ts2.charStart === wantStart && ts2.charEnd === wantEnd)) { a.result = 'not-held'; continue; }
      a.wordHeld = true;
      sampled = await sampleNow(target, idx, segText, ts2 ?? at, kind2 === 'none' ? atKind : kind2, { mode, msToReady: a.pausedAfterMs, attempt });
      sampled.kindMatches = target.expectKind ? sampled.kind === target.expectKind : null;
    }
    if (!sampled) sampled = { index: idx, name: target.name ?? null, segment: segText, timedOut: true };
    sampled.attempts = attempts;
    sampled.pausedAfter = !!manager.paused;
    out.samples.push(sampled);
    Zotero.debug(`ZTTS209-MARK end ${marker}`);
  }
  out.notes = notes;

  // The compact verdict per sample, first in the file.
  for (const s of out.samples) {
    out.summary.push(s.timedOut ? { index: s.index, name: s.name, timedOut: true, attempts: s.attempts.map((x) => x.result) } : {
      index: s.index, name: s.name, kind: s.kind, word: s.word?.text ?? null, color: s.primary.color, selector: s.primary.selector,
      draws: s.primary.draws, rects: s.primary.rects?.rects?.[0] ?? null, primaryShown: s.primaryShown, granularity: s.granularity,
      ownIsPrimary: s.zoteroOwnWord?.isPrimary ?? null, ownDraws: s.zoteroOwnWord?.draws ?? null, segmentOwnDraws: s.zoteroOwnSegment?.draws ?? null,
      pieces: s.sentencePieces, head: s.drawn.head, tail: s.drawn.tail, joinEqualsSegment: s.pieceJoinEqualsSegment ?? null,
      attempts: s.attempts.map((x) => x.result), paused: s.pausedAfter,
    });
  }

  // The debug store's lines for this call: highlight lines and markers, in order.
  const log = String(await Zotero.Debug.get());
  const lines = log.split('\n');
  const firstMarker = `ZTTS209-MARK begin ${p.which}/${p.label}${p.targets[0].name ? '-' + p.targets[0].name : ''}/segment ${p.targets[0].index}`;
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].includes(firstMarker)) { start = i; break; }
  out.logLines = (start < 0 ? [] : lines.slice(start)).filter((l) => /ZTTS209-MARK|highlight:|\[zotero-tts\].*(error|failed|dead object)/i.test(l)).map((l) => l.replace(/[0-9a-f]{32}/g, '<32hex>').slice(0, 260));

  state.samples = state.samples || [];
  state.samples.push({ which: p.which, label: p.label, samples: out.samples, logLines: out.logLines });
  out.ok = out.samples.length === p.targets.length && out.samples.every((s) => !s.timedOut && (s.kindMatches !== false));
  return JSON.stringify(out, null, 1);
})()
