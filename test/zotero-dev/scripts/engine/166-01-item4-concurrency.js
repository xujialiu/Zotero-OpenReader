// Engine case item 4 (issue #166): prefetch and the provider-observed
// concurrency. For any voice (a local/Kokoro voice here, uncached text — a
// third local voice so the fixture text was never synthesized on it in this
// process): at 7 ahead / 3 at once, across several starts the prefetch keeps
// at most `requests` open (session.prefetch.peak <= requests; no voice is
// being prepared, so the preparation's +1 does not apply); the last start's
// order holds exactly `sentences` indices from `from`; store.requests grows
// by at most the segments read plus `sentences`; and the plugin's warm chain
// is gone — no `prefetch: <provider>: ...` debug line anywhere in the run's
// delta. Trusted Shift+Space after the popup opens (workflow section 6, this
// Zotero keeps a script-started session suspended).
// params: root. state: reads the 166 baseline session (Zotero.__ztts166);
// writes item4 (runner state) + fixtures (both states).
(async () => {
  const out = { step: 'item4-provider-observed-concurrency' };
  const S = Zotero.ZoteroTTSRun.state;
  const root = Zotero.ZoteroTTSRun.params.root;
  const p = Services.prefs;
  const B = 'extensions.zotero.zotero-tts.';
  const session166 = Zotero.__ztts166;
  if (!session166?.baseline) throw new Error('the 166 baseline session is missing — 00-baseline-and-isolate must run first');
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
  try {
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('readAloud.defaultVoice'); remember('local.enabled');
    p.setBoolPref(B + 'readAloud.prefetchCustom', true);
    p.setIntPref(B + 'readAloud.prefetchSentences', 7);
    p.setIntPref(B + 'readAloud.prefetchRequests', 3);
    p.setBoolPref(B + 'local.enabled', true);
    // A third local voice: never spoken in this process, so fixture-a's text
    // is uncached on it (af_bella: earlier items; af_heart: late-audio item 2).
    let voice = 'af_heart';
    try {
      const base = p.getStringPref(B + 'local.baseURL').replace(/\/+$/, '');
      const resp = await fetch(base + '/v1/audio/voices', { method: 'GET' });
      if (resp.ok) {
        const body = await resp.json();
        const ids = (Array.isArray(body?.voices) ? body.voices : [])
          .map(v => (typeof v === 'string' ? v : v?.id)).filter(v => typeof v === 'string');
        const fresh = ids.filter(id => id !== 'af_bella' && id !== 'af_heart');
        if (fresh.length) voice = fresh[0];
        out.serverVoiceList = ids.slice(0, 12);
      }
    } catch (e) { out.serverListError = String(e); }
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::' + voice, lang: 'en' }));
    out.prefsSet = { sentences: 7, requests: 3, voice };

    const title = 'ztts 166 engine A4 ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', 'fixture-a.pdf'),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'a-e4', itemID: item.id, title });
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: 'a-e4', itemID: item.id, title });

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
    if (!reader || !reader._internalReader || !reader._internalReader._readAloudManager) throw new Error('reader/manager never appeared within 24 s');
    const ir = reader._internalReader;
    const m = ir._readAloudManager;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const engineOfMine = async () => {
      const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const list = diag.readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) return list[i];
      return null;
    };
    await ir.toggleReadAloudPopup(true);
    try { if (host.Zotero_Tabs && host.Zotero_Tabs.selectedID !== reader.tabID) host.Zotero_Tabs.select(reader.tabID); } catch (_) {}
    await sleep(400);
    const openT = Date.now();
    while (Date.now() - openT < 15000) {
      const mine = await engineOfMine();
      if (mine && mine.session) break;
      await sleep(120);
    }
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    const pressShiftSpace = () => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const ev = (k, c, n) => new host.KeyboardEvent('', { key: k, code: c, keyCode: n });
      tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    };
    let presses = 0;
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      pressShiftSpace(); presses++;
      await sleep(350);
      if (m.active && m.paused) { pressShiftSpace(); presses++; await sleep(350); }
    }
    out.trustedPressesToStart = presses;

    const debugLen0 = (await Zotero.Debug.get()).length;
    const starts = [];
    const samples = [];
    let maxPeak = 0; let maxOpen = 0;
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 60000) {
      const mine = await engineOfMine();
      const s = mine?.session;
      if (s && s.prefetch) {
        if (s.prefetch.open > maxOpen) maxOpen = s.prefetch.open;
        if (s.prefetch.peak > maxPeak) maxPeak = s.prefetch.peak;
        samples.push({ t: Date.now() - tRead, open: s.prefetch.open, peak: s.prefetch.peak });
        if (s.position !== lastPos) {
          lastPos = s.position;
          starts.push({
            position: s.position, from: s.prefetch.from, sentences: s.prefetch.sentences, requests: s.prefetch.requests,
            orderLen: s.prefetch.order.length, orderSorted: s.prefetch.order.slice().sort((a, b) => a - b),
            open: s.prefetch.open, peak: s.prefetch.peak,
            storeRequests: s.store ? s.store.requests : null,
          });
        }
      }
      if (starts.length >= 5) break;
      await sleep(120);
    }
    out.startCount = starts.length;
    out.starts = starts;
    out.sampleCount = samples.length;
    out.maxPeak = maxPeak; out.maxOpen = maxOpen;
    const last = starts[starts.length - 1] || null;
    const first = starts[0] || null;
    const segmentsRead = last && first ? Math.abs(last.position - first.position) + 1 : 0;
    const requestsGrowth = last && first && last.storeRequests != null && first.storeRequests != null
      ? last.storeRequests - first.storeRequests : null;
    const bound = segmentsRead + 7;
    const delta = (await Zotero.Debug.get()).slice(debugLen0);
    const warmChainLines = delta.split('\n').filter(l => /prefetch:\s*\S+/.test(l));
    const liveLines = delta.split('\n').filter(l => l.includes('word timestamps for') && !l.includes('(cached)'));
    out.storeRequests = { first: first?.storeRequests ?? null, last: last?.storeRequests ?? null, growth: requestsGrowth, segmentsRead, bound };
    out.liveSynthesisLines = liveLines.length;
    out.warmChainLines = warmChainLines.map(l => l.slice(0, 130));
    const fallbacks = (await engineOfMine())?.stats?.fallbacks ?? null;
    out.statsTail = { fallbacks };
    out.checks = {
      startsSeen: starts.length,
      peakWithinRequests: maxPeak <= 3 && starts.every(s => s.peak <= s.requests && s.open <= s.requests),
      sentencesSevenRequestsThree: starts.every(s => s.sentences === 7 && s.requests === 3),
      lastOrderExact: last ? last.orderLen === 7 && last.orderSorted.every((v, i) => v === last.from + i) : null,
      requestsGrowthWithinBound: requestsGrowth == null ? null : requestsGrowth <= bound,
      noWarmChainLines: warmChainLines.length === 0,
      liveSynthesisSeen: liveLines.length > 0,
      fallbacksZero: fallbacks === 0,
    };

    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(400);
    try { const pc = reader.close(); if (pc && pc.then) await pc; } catch (_) {}
    out.managerLeft = 'tab closed';
    S.item4 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item4 = out;
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
