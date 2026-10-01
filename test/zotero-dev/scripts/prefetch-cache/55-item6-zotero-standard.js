// Case item 6: a Zotero Standard voice follows the numbers. At 4 ahead /
// 1 at once on a Zotero Standard voice the next start reads sentences: 4,
// requests: 1, order 4 indices, peak 1. The Zotero tiers are switched off in
// this profile: zotero-standard.enabled is enabled for the item and restored
// byte-identical (a baseline-snapshot restore also happens in 90). The
// account's minutesRemaining is read before any Zotero synthesis; with no
// time to spare the item is NOT TESTABLE and nothing is played. Only a few
// sentences are read. Tier and voice are picked while PAUSED (native path;
// Play starts the sentence over with the new voice), so no Handoff
// preparation is driven beyond the paused word the switch needs.
// params: root. state: reads baseline; writes fixtures + item6.
(async () => {
  const out = { step: 'item6-zotero-standard' };
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
  const closeFixture = async () => {
    try { const list = Zotero.Reader._readers || []; for (let i = 0; i < list.length; i++) if (list[i].itemID === item?.id) { try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {} const pc = list[i].close(); if (pc && pc.then) await pc; } } catch (e) { out.closeError = String(e); }
  };
  let item = null;
  try {
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('readAloud.defaultVoice'); remember('local.enabled'); remember('zotero-standard.enabled');
    p.setIntPref(B + 'readAloud.prefetchSentences', 4);
    p.setIntPref(B + 'readAloud.prefetchRequests', 1);
    p.setBoolPref(B + 'readAloud.prefetchCustom', true);
    p.setBoolPref(B + 'local.enabled', true);
    p.setBoolPref(B + 'zotero-standard.enabled', true);
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
    out.prefsSet = { sentences: 4, requests: 1, standardEnabled: true };

    const title = 'ztts 166 prefetch B6 ' + new Date().toISOString().slice(0, 16);
    item = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', 'fixture-b.pdf'),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'b-6', itemID: item.id, title });
    const session166 = Zotero.__ztts166;
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: 'b-6', itemID: item.id, title });

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
    const trusted = (key, code, kc, mod) => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const ev = (k, c, n) => new host.KeyboardEvent('', { key: k, code: c, keyCode: n });
      let consumed = 0;
      if (mod === 'Shift') consumed += tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      consumed += tip.keydown(ev(key, code, kc));
      tip.keyup(ev(key, code, kc));
      if (mod === 'Shift') tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      return consumed;
    };
    const pressShiftSpace = () => trusted(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE, 'Shift');
    const selectFixtureTab = () => {
      try { if (host.Zotero_Tabs?.selectedID !== reader.tabID) host.Zotero_Tabs.select(reader.tabID); } catch (e) { out.tabSelectError = String(e); }
    };

    await ir.toggleReadAloudPopup(true);
    selectFixtureTab();
    await sleep(400);
    const openT = Date.now();
    let started = null;
    while (Date.now() - openT < 15000 && !started) {
      const mine = await engineOfMine();
      if (mine && mine.session) { started = mine; break; }
      await sleep(120);
    }
    if (!started) throw new Error('engine session never appeared after popup open');
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    let presses = 0;
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      pressShiftSpace(); presses++;
      await sleep(400);
      if (m.active && m.paused) { pressShiftSpace(); presses++; await sleep(400); }
    }
    out.trustedPressesToStart = presses;
    out.voiceAtStart = (await engineOfMine())?.session?.voice ?? null;

    // Pause, then pick the standard tier the native (paused) way — no
    // synthesis until Play. A credits QUERY (refreshCreditsRemaining) then
    // asks Zotero for the time left before anything is played; minutesRemaining
    // is null until a Zotero voice's controller exists, so it is read after
    // the pick, never before.
    pressShiftSpace();
    await sleep(400);
    out.pausedBeforePick = { active: m.active, paused: m.paused };
    const wm = Components.utils.waiveXrays(m);
    try { wm.selectTier('standard'); } catch (e) { out.selectTierError = String(e); }
    await sleep(1200);
    out.selectedAfterTierPick = wm.selectedVoiceID ?? null;
    let refreshed = false;
    try {
      const controller = Components.utils.waiveXrays(m)._controller;
      if (controller && typeof controller.refreshCreditsRemaining === 'function') {
        await controller.refreshCreditsRemaining();
        refreshed = true;
      }
    } catch (e) { out.refreshError = String(e); }
    await sleep(300);
    const minutes = (() => { try { const v = Components.utils.waiveXrays(m).minutesRemaining; return v === undefined ? null : v; } catch (e) { return 'unreadable: ' + String(e); } })();
    out.minutesRemaining = minutes;
    out.creditsRefreshed = refreshed;
    const minutesOk = typeof minutes === 'number' && minutes >= 2;
    if (!minutesOk) {
      out.notTestable = 'no time to spare on the Zotero Standard account (read after the paused tier pick, credits query only, nothing played): minutesRemaining=' + JSON.stringify(minutes);
      try { await ir.toggleReadAloudPopup(false); } catch (_) {}
      await sleep(400);
      await closeFixture();
      restoreAll();
      S.item6 = out;
      return JSON.stringify(out, null, 1);
    }
    const raw = wm.voicesForLanguage;
    const listed = [];
    for (let i = 0; i < (raw?.length ?? 0); i++) {
      const v = Components.utils.waiveXrays(raw[i]);
      if (v && v.id) listed.push(String(v.id));
    }
    out.standardVoicesListed = listed.slice(0, 10);
    if (!wm.selectedVoiceID && listed.length) {
      try { wm.selectVoice(listed[0]); } catch (e) { out.selectVoiceError = String(e); }
      await sleep(800);
    }
    out.pickedVoice = wm.selectedVoiceID ?? null;

    // Play: the sentence restarts on the Zotero voice.
    pressShiftSpace();
    await sleep(500);
    if (m.active && m.paused) { pressShiftSpace(); await sleep(500); }
    const starts = [];
    let maxPeak = 0;
    const signals = new Set();
    let firstStart = null;
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 45000) {
      const mine = await engineOfMine();
      if (mine && mine.session) {
        const s = mine.session;
        signals.add(s.store ? String(s.store.signal) : 'nostore');
        const pf = s.prefetch;
        if (pf && pf.open > maxPeak) maxPeak = pf.open;
        if (pf && pf.peak > maxPeak) maxPeak = pf.peak;
        if (pf && s.position !== lastPos) {
          lastPos = s.position;
          const rec = { position: s.position, voice: s.voice, from: pf.from, sentences: pf.sentences, requests: pf.requests, orderLen: pf.order.length, orderSorted: pf.order.slice().sort((a, b) => a - b), open: pf.open, peak: pf.peak };
          starts.push(rec);
          if (!firstStart) firstStart = rec;
        }
      }
      if (starts.length >= 3) break;
      await sleep(150);
    }
    out.starts = starts;
    out.maxPeakObserved = maxPeak;
    out.storeSignalsSeen = [...signals];
    out.startCount = starts.length;
    const last = starts[starts.length - 1] || null;
    out.checks = {
      voiceIsZotero: last ? typeof last.voice === 'string' && !last.voice.includes('::') : null,
      sentencesFour: last ? last.sentences === 4 : null,
      requestsOne: last ? last.requests === 1 : null,
      orderFourFromStart: last ? last.orderLen === 4 && last.orderSorted.every((v, i) => v === last.from + i) : null,
      peakOne: maxPeak <= 1,
    };

    // Stop the spend at once, close the fixture; 90 erases the item and
    // restores zotero-standard.enabled and readAloudVoices.
    try { if (m.active && !m.paused) pressShiftSpace(); } catch (_) {}
    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(500);
    await closeFixture();
    out.managerLeft = 'tab closed';
    S.item6 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item6 = out;
    try { await closeFixture(); } catch (_) {}
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
