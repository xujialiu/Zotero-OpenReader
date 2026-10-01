// Case item 1: the reach is the number. Custom prefetch at 8 ahead, 3 at
// once: play a few sentences; at each start order has 8 indices from `from`,
// peak <= 3, and no provider request reaches past position + 8 (each
// non-cached provider synthesis line in the debug store must match only
// segments within the bound). Fixture-a (17 segments; its first ~6 are
// already cached on this voice from the 3.8 run, the tail is live, so real
// requests happen). The two prefs are set by hand here and cleared again at
// the end (the baseline snapshot holds the no-user-value state).
// params: none. state: reads fixtures; writes item1.
(async () => {
  const out = { step: 'item1-reach-8-3' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = k => 'extensions.zotero.zotero-tts.' + k;
  try {
    // Fresh import: a new item key keeps the item list clean; the audio cache
    // is text+voice keyed, so the old sentences stay cached (by design here).
    const title = 'ztts 166 reach A ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/orca/workspaces/Zotero-TTS/issue_162/test/fixtures/fixture-a.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures.push({ key: 'a-1', itemID: item.id, title });

    Services.prefs.setIntPref(P('readAloud.prefetchSentences'), 8);
    Services.prefs.setIntPref(P('readAloud.prefetchRequests'), 3);
    out.prefsSet = {
      sentences: Services.prefs.getIntPref(P('readAloud.prefetchSentences')),
      requests: Services.prefs.getIntPref(P('readAloud.prefetchRequests')),
      custom: Services.prefs.getBoolPref(P('readAloud.prefetchCustom'), true),
    };

    await Zotero.Reader.open(item.id);
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = null;
      const list = Zotero.Reader._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) reader = list[i];
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!reader) throw new Error('reader never appeared');
    const ir = reader._internalReader;
    const m = ir._readAloudManager;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const engineOfMine = async () => {
      const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const list = diag.readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) return list[i];
      return null;
    };

    const trustedShiftSpace = async () => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const ev = (key, code, kc) => new host.KeyboardEvent('', { key, code, keyCode: kc });
      tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    };

    const debugLenBefore = (await Zotero.Debug.get()).length;
    await ir.toggleReadAloudPopup(true);
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      await trustedShiftSpace();
      await sleep(400);
      if (m.active && m.paused) { await trustedShiftSpace(); await sleep(400); }
    }

    // Segment lengths for the provider-side reach check: the list exists only
    // once the manager has prepared (it is null before the first popup open),
    // so read it here, after the popup and the trusted start.
    let segLengths = [];
    try {
      const segs = ir._readAloudSegments.segments;
      for (let i = 0; i < segs.length; i++) segLengths.push(String(segs[i].text ?? '').length);
    } catch (e) { out.segReadError = String(e); }
    out.segmentCount = segLengths.length;

    const starts = [];
    let maxPeak = 0; let maxOpen = 0;
    let maxPositionSeen = 0;
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 60000) {
      const mine = await engineOfMine();
      if (mine && mine.session) {
        const s = mine.session;
        if (s.position > maxPositionSeen) maxPositionSeen = s.position;
        const pf = s.prefetch;
        if (pf) {
          if (pf.open > maxOpen) maxOpen = pf.open;
          if (pf.peak > maxPeak) maxPeak = pf.peak;
        }
        if (s.position !== lastPos) {
          lastPos = s.position;
          starts.push({
            position: s.position,
            prefetch: pf ? { from: pf.from, sentences: pf.sentences, requests: pf.requests, order: pf.order.slice().sort((a, b) => a - b), orderLen: pf.order.length, open: pf.open, peak: pf.peak } : null,
          });
        }
      }
      if (starts.length >= 5) break;
      await sleep(150);
    }
    out.starts = starts;
    out.maxPeak = maxPeak; out.maxOpen = maxOpen; out.maxPositionSeen = maxPositionSeen;
    // The claim: at each sampled start the report names exactly `sentences`
    // indices beginning at its own `from` (the sample can catch the previous
    // start's report while the position has already moved, so `from` is not
    // required to equal position + 1 in every sample).
    out.everyStartOrderSpanExact = starts.length > 0 && starts.every(st =>
      st.prefetch && st.prefetch.sentences === 8 && st.prefetch.requests === 3
      && st.prefetch.orderLen === 8
      && st.prefetch.order.every((v, i) => v === st.prefetch.from + i));
    out.peakWithinThree = maxPeak <= 3;

    // Provider-side reach: every non-cached synthesis line's char count must
    // match only segments with index <= maxPositionSeen + 8.
    const delta = (await Zotero.Debug.get()).slice(debugLenBefore);
    const lines = delta.split('\n').filter(l => l.includes('zotero-tts]') && /for \d+ chars/.test(l) && !l.includes('(cached)'));
    const liveLines = [];
    let reachViolation = null;
    const bound = maxPositionSeen + 8;
    for (const line of lines) {
      const mm = line.match(/for (\d+) chars/);
      if (!mm) continue;
      const n = Number(mm[1]);
      const candidates = [];
      for (let i = 0; i < segLengths.length; i++) if (segLengths[i] === n) candidates.push(i);
      liveLines.push({ n, candidates, line: line.slice(0, 110) });
      if (candidates.length && candidates.every(idx => idx > bound)) {
        reachViolation = { n, candidates, bound, line: line.slice(0, 140) };
        break;
      }
    }
    out.liveSynthesisLines = liveLines.length;
    out.liveLineSamples = liveLines.slice(0, 4).map(l => l.line);
    out.reachBound = bound;
    out.reachViolation = reachViolation;

    // Leave defaults for item 2: clear the two prefs back to no user value.
    Services.prefs.clearUserPref(P('readAloud.prefetchSentences'));
    Services.prefs.clearUserPref(P('readAloud.prefetchRequests'));
    out.prefsCleared = !Services.prefs.prefHasUserValue(P('readAloud.prefetchSentences')) && !Services.prefs.prefHasUserValue(P('readAloud.prefetchRequests'));

    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(500);
    try { const p = reader.close(); if (p && p.then) await p; } catch (_) {}
    const tGone = Date.now();
    while (Date.now() - tGone < 8000) {
      const list = Zotero.Reader._readers || [];
      let found = false;
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) found = true;
      if (!found) break;
      await sleep(200);
    }
    out.managerLeft = 'tab closed';

    S.item1 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
