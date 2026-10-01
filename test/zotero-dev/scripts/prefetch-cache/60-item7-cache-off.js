// Case item 7: the cache stands on its own. Half 1: Custom prefetch OFF
// (defaults 5/2) with Cache synthesized audio on — a replayed segment still
// logs (cached), so the cache works whatever Custom prefetch is. Half 2:
// Cache synthesized audio turned OFF — reading uncached text still fills
// order at each start (5/2), and on Kokoro the reading does not wait at the
// sentences prefetched: notices.shown flat after the first sentence. The
// half-2 voice is a second local (Kokoro) voice so the text is not already
// cached on it (this process read fixture-a/c on af_bella earlier today).
// params: root. state: reads baseline; writes fixtures + item7.
(async () => {
  const out = { step: 'item7-cache-off' };
  const S = Zotero.ZoteroTTSRun.state;
  const root = Zotero.ZoteroTTSRun.params.root;
  const p = Services.prefs;
  const B = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snapshot = [];
  const remember = key => {
    const type = p.getPrefType(B + key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(B + key);
    else if (type === p.PREF_INT) value = p.getIntPref(B + key);
    else if (type === p.PREF_STRING) value = p.getStringPref(B + key);
    snapshot.push({ key, type, user: p.prefHasUserValue(B + key), value });
  };
  const restoreAll = () => {
    for (let i = snapshot.length - 1; i >= 0; i--) {
      const rec = snapshot[i];
      try {
        if (!rec.user) { if (p.prefHasUserValue(B + rec.key)) p.clearUserPref(B + rec.key); }
        else if (rec.type === p.PREF_BOOL) p.setBoolPref(B + rec.key, !!rec.value);
        else if (rec.type === p.PREF_INT) p.setIntPref(B + rec.key, Number(rec.value));
        else if (rec.type === p.PREF_STRING) p.setStringPref(B + rec.key, String(rec.value ?? ''));
      } catch (e) { out['restoreError_' + rec.key] = String(e); }
    }
  };
  const openFixture = async (file, title) => {
    const it = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', file),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: file, itemID: it.id, title });
    const session166 = Zotero.__ztts166;
    if (!session166?.baseline) throw new Error('the 166 baseline session is missing');
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: file, itemID: it.id, title });
    await Zotero.Reader.open(it.id);
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = null;
      const list = Zotero.Reader._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === it.id) reader = list[i];
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!reader || !reader._internalReader) throw new Error('reader never appeared for ' + file);
    return { item: it, reader };
  };
  const closeFixture = async (it) => {
    try {
      const list = Zotero.Reader._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === it?.id) {
        try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
        const pc = list[i].close(); if (pc && pc.then) await pc;
      }
    } catch (e) { out['closeError_' + it?.id] = String(e); }
  };
  const engineOf = async (itemID) => {
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const list = diag.readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) return list[i];
    return null;
  };
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const trustedShiftSpace = () => {
    const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
    tip.beginInputTransactionForTests(host);
    const ev = (k, c, n) => new host.KeyboardEvent('', { key: k, code: c, keyCode: n });
    tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
    tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
    tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
  };
  const startReading = async (itemID, ir) => {
    try {
      const list = Zotero.Reader._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) {
        if (host.Zotero_Tabs && host.Zotero_Tabs.selectedID !== list[i].tabID) host.Zotero_Tabs.select(list[i].tabID);
        break;
      }
    } catch (_) {}
    await ir.toggleReadAloudPopup(true);
    const m = ir._readAloudManager;
    await sleep(400);
    const openT = Date.now();
    while (Date.now() - openT < 15000) {
      const mine = await engineOf(itemID);
      if (mine && mine.session) break;
      await sleep(120);
    }
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    for (let i = 0; i < 4; i++) {
      const mine = await engineOf(itemID);
      if (mine && mine.audio && mine.audio.state === 'running') break;
      trustedShiftSpace();
      await sleep(400);
      if (m.active && m.paused) { trustedShiftSpace(); await sleep(400); }
    }
  };
  // Sample starts until n of them or the timeout; returns {starts, noticesShown}
  const sampleStarts = async (itemID, n, timeoutMs) => {
    const starts = [];
    const t = Date.now();
    let lastPos = -1;
    while (Date.now() - t < timeoutMs) {
      const mine = await engineOf(itemID);
      const s = mine?.session;
      if (s && s.prefetch && s.position !== lastPos) {
        lastPos = s.position;
        starts.push({
          position: s.position, from: s.prefetch.from, sentences: s.prefetch.sentences, requests: s.prefetch.requests,
          orderLen: s.prefetch.order.length, orderSorted: s.prefetch.order.slice().sort((a, b) => a - b),
          peak: s.prefetch.peak, open: s.prefetch.open,
          notices: s.notices ? { waits: s.notices.waits, shown: s.notices.shown, starts: s.notices.starts } : null,
          storeRequests: s.store ? s.store.requests : null,
        });
      }
      if (starts.length >= n) break;
      await sleep(150);
    }
    return starts;
  };
  const countLines = (delta, needle) => delta.split('\n').filter(l => l.includes(needle)).length;

  let half1 = null; let half2 = null; let f1 = null; let f2 = null;
  try {
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('cacheAudio'); remember('readAloud.defaultVoice'); remember('local.enabled');
    p.setBoolPref(B + 'local.enabled', true);
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
    // Half 1: custom OFF (defaults 5/2), cache on (baseline: true).
    p.setBoolPref(B + 'readAloud.prefetchCustom', false);
    out.half1Prefs = { custom: p.getBoolPref(B + 'readAloud.prefetchCustom'), cacheAudio: p.getBoolPref(B + 'cacheAudio') };

    const title1 = 'ztts 166 prefetch B7a ' + new Date().toISOString().slice(0, 16);
    f1 = await openFixture('fixture-b.pdf', title1);
    out.half1Item = f1.item.id;
    const debugLenA = (await Zotero.Debug.get()).length;
    await startReading(f1.item.id, f1.reader._internalReader);
    const starts1 = await sampleStarts(f1.item.id, 3, 30000);
    const pass1 = (await Zotero.Debug.get()).slice(debugLenA);
    // Close, reopen (new session) and replay the first sentence for (cached).
    const debugLenB = (await Zotero.Debug.get()).length;
    try { await f1.reader._internalReader.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(1000);
    await startReading(f1.item.id, f1.reader._internalReader);
    try { f1.reader._internalReader._readAloudManager.repositionTo(0); } catch (e) { out.repositionError = String(e); }
    let cached = 0; let sample = null;
    const tC = Date.now();
    while (Date.now() - tC < 15000) {
      const delta = (await Zotero.Debug.get()).slice(debugLenB);
      cached = countLines(delta, '(cached)');
      if (cached > 0) { const ls = delta.split('\n').filter(l => l.includes('(cached)')); sample = ls[0].slice(0, 140); break; }
      await sleep(200);
    }
    half1 = {
      starts: starts1.map(s => ({ position: s.position, from: s.from, sentences: s.sentences, requests: s.requests, orderLen: s.orderLen })),
      replayCachedLines: cached, sampleCachedLine: sample,
    };
    out.half1 = half1;
    await closeFixture(f1.item);

    // Half 2: cache OFF, custom still off, uncached text on a second local voice.
    p.setBoolPref(B + 'cacheAudio', false);
    let secondVoice = 'af_heart';
    try {
      const base = p.getStringPref(B + 'local.baseURL').replace(/\/+$/, '');
      const resp = await fetch(base + '/v1/audio/voices', { method: 'GET' });
      if (resp.ok) {
        const body = await resp.json();
        const ids = (Array.isArray(body?.voices) ? body.voices : [])
          .map(v => (typeof v === 'string' ? v : v?.id)).filter(v => typeof v === 'string');
        const others = ids.filter(id => id !== 'af_bella');
        if (others.length) secondVoice = others.includes('af_heart') ? 'af_heart' : others[0];
        out.serverVoiceList = ids.slice(0, 12);
      }
    } catch (e) { out.serverListError = String(e); }
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::' + secondVoice, lang: 'en' }));
    out.half2Prefs = { custom: p.getBoolPref(B + 'readAloud.prefetchCustom'), cacheAudio: p.getBoolPref(B + 'cacheAudio'), voice: secondVoice };

    const title2 = 'ztts 166 prefetch C7 ' + new Date().toISOString().slice(0, 16);
    f2 = await openFixture('fixture-c.pdf', title2);
    out.half2Item = f2.item.id;
    const debugLenC = (await Zotero.Debug.get()).length;
    await startReading(f2.item.id, f2.reader._internalReader);
    const starts2 = await sampleStarts(f2.item.id, 4, 45000);
    const pass2 = (await Zotero.Debug.get()).slice(debugLenC);
    const last2 = starts2[starts2.length - 1] || null;
    const shownAfterFirst = starts2.slice(1).map(s => s.notices?.shown ?? null);
    const firstShown = starts2.length ? starts2[0].notices?.shown ?? null : null;
    half2 = {
      voice: last2 ? (await engineOf(f2.item.id))?.session?.voice ?? null : null,
      starts: starts2.map(s => ({ position: s.position, from: s.from, sentences: s.sentences, requests: s.requests, orderLen: s.orderLen, peak: s.peak, shown: s.notices?.shown ?? null, storeRequests: s.storeRequests })),
      liveSynthesisLines: countLines(pass2, 'word timestamps for') - countLines(pass2, '(cached)'),
      cachedLines: countLines(pass2, '(cached)'),
    };
    half2.checks = {
      orderFilledEachStart: starts2.length >= 2 && starts2.every(s => s.orderLen >= 1 && s.sentences === 5 && s.requests === 2),
      noticesFlatAfterFirst: starts2.length >= 2 && shownAfterFirst.every(v => v === firstShown),
      liveSynthesis: half2.liveSynthesisLines > 0,
    };
    out.half2 = half2;

    for (const f of [f1, f2]) { try { await f.reader._internalReader.toggleReadAloudPopup(false); } catch (_) {} }
    await sleep(400);
    await closeFixture(f2.item);
    out.managerLeft = 'fixture tabs closed';
    S.item7 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item7 = out;
    for (const f of [f1, f2]) {
      try {
        const list = Zotero.Reader._readers || [];
        for (let i = 0; i < list.length; i++) if (list[i].itemID === f?.item?.id) {
          try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
          const pc = list[i].close(); if (pc && pc.then) await pc;
        }
      } catch (_) {}
    }
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
