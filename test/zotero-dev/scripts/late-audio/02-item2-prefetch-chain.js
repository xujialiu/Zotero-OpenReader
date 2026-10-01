// Case item 2, issue #166 shape (REWRITTEN 2026-10-01; the previous version
// hunted the plugin's old warm chain — "ready ahead of playback" / "stopped,
// the reader is gone" lines a #166 build no longer has). The only prefetch is
// the Engine's now: Custom prefetch at 10 sentences ahead and 1 request at
// once on a fixture whose audio is not cached yet (fixture-a fresh, on a
// second local/Kokoro voice — this process read fixture-a on af_bella
// earlier today, and the cache is text+voice keyed). play(), then poll
// diagnostics.engine() every ~80 ms until session.prefetch.open >= 1 with
// position <= 2 (the prefetch is going, most of the order's 10 indices still
// unasked), then close the tab the × way at once. Expected: no provider
// request after the close beyond the one open at it (exactly one new
// synthesis line in the debug delta), and the Engine's "late audio dropped:
// its reader window was gone" line up by that one when it lands
// (patches().lateResults.dropped is the window-wrapper's counter and may
// stay flat — the Engine drops its own result before the wrapper; reported
// either way). If open >= 1 was never caught before the reading ran past the
// order, NOT TESTABLE with the timeline, per the case. No paid provider:
// Kokoro's serial 1-at-once queue of ten is the catch window (~3 s at the
// measured <300 ms per answer), not the single-request window that was too
// fast in 2026-09.
// params: root. state: reads the 166 baseline session (Zotero.__ztts166);
// writes item2 (runner state) + fixtures (both states).
(async () => {
  const out = { step: 'item2-prefetch-stops-with-reader' };
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
  let item = null; let reader = null;
  const registerFixture = it => {
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'a-la2', itemID: it.id, title: it.getField('title') });
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: 'a-la2', itemID: it.id, title: it.getField('title') });
  };
  try {
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('readAloud.defaultVoice'); remember('local.enabled');
    p.setBoolPref(B + 'readAloud.prefetchCustom', true);
    p.setIntPref(B + 'readAloud.prefetchSentences', 10);
    p.setIntPref(B + 'readAloud.prefetchRequests', 1);
    p.setBoolPref(B + 'local.enabled', true);
    // A voice whose text is not cached: the second local voice the server lists.
    let voice = 'af_heart';
    try {
      const base = p.getStringPref(B + 'local.baseURL').replace(/\/+$/, '');
      const resp = await fetch(base + '/v1/audio/voices', { method: 'GET' });
      if (resp.ok) {
        const body = await resp.json();
        const ids = (Array.isArray(body?.voices) ? body.voices : [])
          .map(v => (typeof v === 'string' ? v : v?.id)).filter(v => typeof v === 'string');
        const others = ids.filter(id => id !== 'af_bella');
        if (others.length) voice = others.includes('af_heart') ? 'af_heart' : others[0];
        out.serverVoiceList = ids.slice(0, 12);
      }
    } catch (e) { out.serverListError = String(e); }
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::' + voice, lang: 'en' }));
    out.prefsSet = { sentences: 10, requests: 1, voice };

    const title = 'ztts 166 late-audio A2 ' + new Date().toISOString().slice(0, 16);
    item = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', 'fixture-a.pdf'),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    registerFixture(item);

    await Zotero.Reader.open(item.id);
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
    out.playAt = Date.now();

    // Poll for the prefetch in flight, then close the tab at once.
    const droppedBefore = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults?.dropped ?? null;
    const debugLenBeforeClose = (await Zotero.Debug.get()).length;
    let caught = null;
    const timeline = [];
    const tPoll = Date.now();
    while (Date.now() - tPoll < 12000) {
      const mine = await engineOfMine();
      const s = mine?.session;
      if (s && s.prefetch) {
        if (timeline.length === 0 || timeline[timeline.length - 1].open !== s.prefetch.open || timeline[timeline.length - 1].position !== s.position) {
          timeline.push({ t: Date.now() - out.playAt, position: s.position, open: s.prefetch.open, peak: s.prefetch.peak, orderLen: s.prefetch.order.length, storeRequests: s.store ? s.store.requests : null });
        }
        if (s.prefetch.open >= 1 && s.position <= 2 && s.prefetch.order.length >= 5) { caught = { atMs: Date.now() - out.playAt, position: s.position, open: s.prefetch.open, orderLen: s.prefetch.order.length }; break; }
        if (s.position > 4) break; // ran past the order; no point waiting
      }
      await sleep(80);
    }
    out.caught = caught;
    out.timeline = timeline;
    if (!caught) {
      out.notTestable = 'the prefetch never showed open >= 1 with indices still unasked before the reading ran past it (timeline above); per the case this is NOT TESTABLE with the retry left to a slower moment — the cache is now warm for this text+voice, so a retry needs a fresh voice';
      try { await ir.toggleReadAloudPopup(false); } catch (_) {}
      await sleep(400);
      try { const pc = reader.close(); if (pc && pc.then) await pc; } catch (_) {}
      restoreAll();
      S.item2 = out;
      return JSON.stringify(out, null, 1);
    }

    // The × close, immediately.
    const closeAt = Date.now();
    try { reader._window.Zotero_Tabs.close(reader.tabID); } catch (e) { out.closeError = String(e); }
    const tGone = Date.now();
    while (Date.now() - tGone < 8000) {
      const list = Zotero.Reader._readers || [];
      let found = false;
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) found = true;
      if (!found) break;
      await sleep(150);
    }
    out.readerGone = true;
    await sleep(6000);

    const after = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults ?? null;
    const delta = (await Zotero.Debug.get()).slice(debugLenBeforeClose);
    const lines = delta.split('\n');
    out.afterClose = {
      droppedBefore, droppedAfter: after?.dropped ?? null, droppedRise: (after?.dropped ?? 0) - (droppedBefore ?? 0),
      byMethod: after?.byMethod ?? null, lastDrop: after?.last?.[after.last.length - 1] ?? null,
      synthesisLinesAfterClose: lines.filter(l => l.includes('word timestamps for')).map(l => l.slice(0, 130)),
      lateAudioDroppedLines: lines.filter(l => l.includes('late audio dropped')).length,
      lateResultDroppedLines: lines.filter(l => l.includes('late result dropped')).length,
    };
    let deadObjects = 0;
    try {
      const msgs = Services.console.getMessageArray().filter(msg => /can't access dead object/i.test(msg.message || ''));
      for (const msg of msgs) if ((msg.timeStamp ?? 0) >= closeAt - 1000) deadObjects++;
    } catch (_) {}
    out.deadObjectLinesAfterClose = deadObjects;
    out.checks = {
      readerGoneMs: Date.now() - closeAt,
      exactlyOneSynthesisAfterClose: out.afterClose.synthesisLinesAfterClose.length === 1,
      engineLateLineUpOne: out.afterClose.lateAudioDroppedLines === 1 || out.afterClose.lateResultDroppedLines >= 1,
      noDeadObjects: deadObjects === 0,
    };
    out.managerLeft = 'tab closed (× way)';
    S.item2 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item2 = out;
    try { if (reader) { try { reader._internalReader?.toggleReadAloudPopup(false); } catch (_) {} const pc = reader.close(); if (pc && pc.then) await pc; } } catch (_) {}
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
