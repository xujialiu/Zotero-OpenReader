// Case item 4: one request at once. At 6 ahead and 1 at once on a fixture not
// cached (numbers.pdf: never synthesized in this process, so every request is
// live): peak stays 1 through several sentences, and the provider never has
// two prefetch requests open. The sentence playback waits for is outside the
// ceiling (no skip in this item, so it is not exercised). Both prefs are
// cleared at the end (baseline holds no user value).
// params: none. state: reads fixtures; writes item4.
(async () => {
  const out = { step: 'item4-one-at-once' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = k => 'extensions.zotero.zotero-tts.' + k;
  try {
    const title = 'ztts 166 numbers ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/orca/workspaces/Zotero-TTS/issue_162/test/fixtures/numbers/numbers.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures.push({ key: 'numbers-4', itemID: item.id, title });

    Services.prefs.setIntPref(P('readAloud.prefetchSentences'), 6);
    Services.prefs.setIntPref(P('readAloud.prefetchRequests'), 1);

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

    const starts = [];
    const openTrace = [];
    let maxPeak = 0; let maxOpen = 0;
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 60000) {
      const mine = await engineOfMine();
      if (mine && mine.session) {
        const pf = mine.session.prefetch;
        if (pf) {
          if (pf.open > maxOpen) maxOpen = pf.open;
          if (pf.peak > maxPeak) maxPeak = pf.peak;
          if (openTrace.length < 4000) openTrace.push(pf.open);
        }
        if (mine.session.position !== lastPos) {
          lastPos = mine.session.position;
          starts.push({
            position: mine.session.position,
            from: pf ? pf.from : null,
            sentences: pf ? pf.sentences : null,
            requests: pf ? pf.requests : null,
            orderLen: pf ? pf.order.length : null,
          });
        }
      }
      if (starts.length >= 4) break;
      await sleep(100);
    }
    out.starts = starts;
    out.maxPeak = maxPeak;
    out.maxOpenObserved = maxOpen;
    out.samples = openTrace.length;
    out.peakStayedOne = maxPeak <= 1;

    const delta = (await Zotero.Debug.get()).slice(debugLenBefore);
    const live = delta.split('\n').filter(l => l.includes('zotero-tts]') && /for \d+ chars/.test(l) && !l.includes('(cached)'));
    out.liveSynthesisLines = live.length;
    out.liveLineSamples = live.slice(0, 3).map(l => l.slice(0, 110));

    Services.prefs.clearUserPref(P('readAloud.prefetchSentences'));
    Services.prefs.clearUserPref(P('readAloud.prefetchRequests'));
    out.prefsCleared = !Services.prefs.prefHasUserValue(P('readAloud.prefetchSentences')) && !Services.prefs.prefHasUserValue(P('readAloud.prefetchRequests'));

    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(500);
    try { const p = reader.close(); if (p && p.then) await p; } catch (_) {}
    const tG = Date.now();
    while (Date.now() - tG < 8000) {
      const list = Zotero.Reader._readers || [];
      let found = false;
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) found = true;
      if (!found) break;
      await sleep(200);
    }
    out.managerLeft = 'tab closed';

    S.item4 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
