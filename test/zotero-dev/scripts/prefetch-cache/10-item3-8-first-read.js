// Case item 3.8 (checklist): at the defaults (Custom prefetch on, 5 ahead,
// 2 at once) on a fixture not cached yet, after a sentence starts
// session.prefetch reads sentences: 5, requests: 2, order holds exactly the
// five indices from..from+4 (fewer only at the document's end), peak <= 2.
// After the first pass a replayed segment logs (cached). Fixture-c (24
// segments, fresh import) so the text is new to the local voice's cache.
// REVISED after the first two runs of 2026-10-01: (a) a new document reads
// readAloud.defaultVoice, not readAloud.memory — the run that forgot that
// synthesized on fish; (b) on this Zotero today a script-started session's
// AudioContext stays suspended (the 2026-09-23 baseline note did not hold),
// so after the popup opens a trusted Shift+Space (workflow section 6) starts
// the output; the baseline audio probe then reads running with the clock
// moving. Also proves the live diagnostics carry session.prefetch and
// store.signal (the brief's build identity).
// params: none. state: reads baseline; writes fixtures + item3_8.
(async () => {
  const out = { step: 'item3-8-first-read' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pref = (k) => Zotero.Prefs.get('zotero-tts.' + k);
  try {
    out.prefDefaults = {
      prefetchCustom: pref('readAloud.prefetchCustom'),
      prefetchSentences: pref('readAloud.prefetchSentences'),
      prefetchRequests: pref('readAloud.prefetchRequests'),
      cacheAudio: pref('cacheAudio'),
    };
    out.volume = pref('readAloud.volume');
    out.defaultVoice = String(pref('readAloud.defaultVoice') || '').slice(0, 40);
    if (!String(pref('readAloud.defaultVoice') || '').includes('local::')) throw new Error('default voice is not the local Kokoro voice');

    const title = 'ztts 166 prefetch C ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/orca/workspaces/Zotero-TTS/issue_162/test/fixtures/fixture-c.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'c-38', itemID: item.id, title });

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
    if (!reader || !reader._internalReader || !reader._internalReader._readAloudManager) {
      throw new Error('reader or read-aloud manager never appeared within 24 s');
    }
    out.readerReadyMs = Date.now() - t0;
    const ir = reader._internalReader;
    const m = ir._readAloudManager;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const engineOfMine = async () => {
      const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const list = diag.readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) return list[i];
      return null;
    };
    // Trusted Shift+Space: pauses when playing, resumes when paused — read the
    // manager after the press and press again if it landed paused.
    const trustedShiftSpace = async () => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const press = async (down) => {
        const ev = (key, code, kc) => new host.KeyboardEvent('', { key, code, keyCode: kc });
        if (down) {
          tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
          tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
          tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
          tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
        }
      };
      await press(true);
    };

    await ir.toggleReadAloudPopup(true);
    const openMs = Date.now();
    let sessionSeen = null;
    while (Date.now() - openMs < 15000 && !sessionSeen) {
      const mine = await engineOfMine();
      if (mine && mine.session) { sessionSeen = mine; break; }
      await sleep(120);
    }
    if (!sessionSeen) throw new Error('engine session never appeared after popup open');
    // Wait for the manager to activate, then a trusted press if the output is not running.
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    out.managerAfterOpen = { active: m.active, paused: m.paused };
    out.sessionVoice = sessionSeen.session.voice;
    let pressCount = 0;
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      await trustedShiftSpace();
      pressCount++;
      await sleep(400);
      if (m.active && m.paused) { await trustedShiftSpace(); pressCount++; await sleep(400); }
    }
    out.trustedPresses = pressCount;

    // The audio probe (baseline): output running and the clock moving.
    const mineA = await engineOfMine();
    const probe1 = { state: mineA?.audio?.state ?? null, playbackTime: mineA?.session?.playbackTime };
    await sleep(500);
    const mineB = await engineOfMine();
    const probe2 = { state: mineB?.audio?.state ?? null, playbackTime: mineB?.session?.playbackTime };
    out.audioProbe = { first: probe1, secondAfter500ms: probe2, running: probe1.state === 'running' && probe2.state === 'running', timeMoved: probe2.playbackTime > probe1.playbackTime };

    // Sample through a few sentence starts.
    const starts = [];
    let maxPeak = 0; let maxOpen = 0; const signals = new Set();
    let firstStart = null;
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 40000) {
      const mine = await engineOfMine();
      if (mine && mine.session) {
        const s = mine.session;
        signals.add(s.store ? String(s.store.signal) : 'nostore');
        const pf = s.prefetch;
        if (pf) {
          if (pf.open > maxOpen) maxOpen = pf.open;
          if (pf.peak > maxPeak) maxPeak = pf.peak;
          if (!firstStart) firstStart = { position: s.position, from: pf.from, sentences: pf.sentences, requests: pf.requests, order: pf.order.slice(), peak: pf.peak, open: pf.open };
        }
        if (s.position !== lastPos) {
          lastPos = s.position;
          starts.push({
            position: s.position, currentIndex: s.currentIndex,
            prefetch: pf ? { from: pf.from, sentences: pf.sentences, requests: pf.requests, order: pf.order.slice().sort((a, b) => a - b), open: pf.open, peak: pf.peak } : null,
            store: s.store ? { signal: s.store.signal, requests: s.store.requests, clips: s.store.clips, inflight: s.store.inflight } : null,
          });
        }
      }
      if (starts.length >= 4) break;
      await sleep(150);
    }
    out.firstStart = firstStart;
    out.startCount = starts.length;
    out.starts = starts;
    out.maxPeak = maxPeak; out.maxOpen = maxOpen;
    out.storeSignalsSeen = [...signals];
    out.firstOrderExactFromSpan = firstStart
      ? (firstStart.order.length === 5 && firstStart.order.slice().sort((a, b) => a - b).every((v, i) => v === firstStart.from + i))
      : null;

    // First pass done for the sentences covered: close, reopen (a new
    // session) and replay the first sentence for the (cached) line.
    const statsBefore = (await engineOfMine())?.stats ?? null;
    const debugLenAtClose = (await Zotero.Debug.get()).length;
    await ir.toggleReadAloudPopup(false);
    await sleep(1000);
    await ir.toggleReadAloudPopup(true);
    let reopened = null;
    const tRe = Date.now();
    while (Date.now() - tRe < 15000 && !reopened) {
      const mine = await engineOfMine();
      if (mine && mine.session) { reopened = mine; break; }
      await sleep(120);
    }
    if (!reopened) throw new Error('engine session never appeared on reopen');
    out.reopenedStats = { started: reopened.stats?.started, startedBefore: statsBefore?.started, startedRose: (reopened.stats?.started ?? 0) > (statsBefore?.started ?? 0) };
    try { m.repositionTo(0); } catch (e) { out.repositionError = String(e); }

    let cachedLineCount = 0; let sampleCachedLine = null;
    const tCa = Date.now();
    while (Date.now() - tCa < 15000) {
      const delta = (await Zotero.Debug.get()).slice(debugLenAtClose);
      const matches = delta.match(/\(cached\)/g);
      cachedLineCount = matches ? matches.length : 0;
      if (cachedLineCount > 0) {
        const line = delta.split('\n').filter(l => l.includes('(cached)'));
        sampleCachedLine = line.length ? line[0].slice(0, 160) : null;
        break;
      }
      await sleep(200);
    }
    out.cachedLineCount = cachedLineCount;
    out.sampleCachedLine = sampleCachedLine;
    const mineEnd = await engineOfMine();
    out.endState = mineEnd && mineEnd.session ? { position: mineEnd.session.position, prefetch: mineEnd.session.prefetch, playing: mineEnd.session.playing, paused: mineEnd.session.paused } : null;

    // Leave the fixture closed; cleanup erases the item.
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

    S.item3_8 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
