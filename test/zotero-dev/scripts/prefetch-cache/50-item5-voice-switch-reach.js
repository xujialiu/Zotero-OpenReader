// Case item 5 (issue #162 reach kept across a voice switch): reading at 6
// ahead / 2 at once, switch the voice with the Next voice key (Shift+.) —
// trusted (workflow section 6). Once diagnostics.voiceSwitch() reads
// stage: committed, session.store.signal is false, session.voice is the new
// id, and the next start's order has 6 indices asked for in the new voice
// (live, non-(cached) synthesis lines after the commit; the target voice has
// never spoken this fixture's text in this process).
// The target is the voice the key actually lands on: the adjacent entry of
// the player list (voice-pick.ts step(): playerVoices(manager.voicesForLanguage)
// sorted by creditsPerMinute, adjacentVoice +1). The script asserts the
// adjacent voice is a second local:: (Kokoro) voice before pressing.
// Reuses the kit pattern from 10-item3-8-first-read.js (trusted Shift+Space
// after the popup opens; defaultVoice, not memory, for a new document).
// params: root. state: reads baseline; writes fixtures + item5.
(async () => {
  const out = { step: 'item5-voice-switch-reach' };
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
  try {
    // Prefs for this item: 6 ahead, 2 at once, custom on; Kokoro enabled and
    // the default voice pointed at af_bella (a new document reads defaultVoice).
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('readAloud.defaultVoice'); remember('local.enabled');
    p.setBoolPref(B + 'readAloud.prefetchCustom', true);
    p.setIntPref(B + 'readAloud.prefetchSentences', 6);
    p.setIntPref(B + 'readAloud.prefetchRequests', 2);
    p.setBoolPref(B + 'local.enabled', true);
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
    out.prefsSet = { sentences: 6, requests: 2 };

    const title = 'ztts 166 prefetch A5 ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', 'fixture-a.pdf'),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'a-5', itemID: item.id, title });
    const session166 = Zotero.__ztts166;
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: 'a-5', itemID: item.id, title });

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
    const pressNextVoice = () => trusted('.', 'Period', 46, 'Shift');
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
    out.sessionVoiceAtStart = started.session.voice;
    out.managerAfterOpen = { active: m.active, paused: m.paused };
    let presses = 0;
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      pressShiftSpace(); presses++;
      await sleep(400);
      if (m.active && m.paused) { pressShiftSpace(); presses++; await sleep(400); }
    }
    out.trustedPressesToStart = presses;

    // The player list, the way step() sees it, and the voice the key will land on.
    const wm = Components.utils.waiveXrays(m);
    const raw = wm.voicesForLanguage;
    const listed = [];
    for (let i = 0; i < (raw?.length ?? 0); i++) {
      const v = Components.utils.waiveXrays(raw[i]);
      if (v && v.id) listed.push({ id: String(v.id), credits: v.creditsPerMinute === undefined ? null : Number(v.creditsPerMinute) });
    }
    listed.sort((a, b) => (a.credits ?? -1) - (b.credits ?? -1));
    out.playerList = listed.map(v => v.id);
    const idx = listed.findIndex(v => v.id === 'local::af_bella');
    const target = idx >= 0 && idx + 1 < listed.length ? listed[idx + 1] : null;
    out.adjacentTarget = target;
    if (!target || !String(target.id).startsWith('local::')) {
      throw new Error('the voice after local::af_bella in the player list is not a second Kokoro voice: ' + JSON.stringify(target));
    }
    const targetId = target.id;

    // Two starts on af_bella first (the reach before the switch).
    const debugLen0 = (await Zotero.Debug.get()).length;
    let lastFrom = -1;
    const tRead = Date.now();
    while (Date.now() - tRead < 25000) {
      const mine = await engineOfMine();
      const pf = mine?.session?.prefetch;
      if (pf && pf.from > lastFrom) {
        lastFrom = pf.from;
        if (pf.order.length === 6) break;
      }
      await sleep(150);
    }
    const beforeSwitch = (await engineOfMine())?.session?.prefetch ?? null;
    out.beforeSwitch = beforeSwitch ? { from: beforeSwitch.from, sentences: beforeSwitch.sentences, requests: beforeSwitch.requests, orderLen: beforeSwitch.order.length, peak: beforeSwitch.peak } : null;

    // The Next voice key, trusted, while the reading plays.
    if (!m.active || m.paused) throw new Error('reading is not playing at the switch (active=' + m.active + ' paused=' + m.paused + ')');
    out.consumedByPress = pressNextVoice();
    const pressAt = Date.now();

    // Poll voiceSwitch() for stage: committed.
    let committed = null;
    const stages = [];
    const tSw = Date.now();
    while (Date.now() - tSw < 45000) {
      const rep = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
      const mine = (rep.readers || []).find(r => r && r.selected !== undefined && rep.readers.indexOf(r) >= 0);
      const list = Zotero.Reader._readers || [];
      let entry = null;
      for (let i = 0; i < (rep.readers || []).length; i++) {
        const rd = list[i];
        if (rd && rd.itemID === item.id) entry = rep.readers[i];
      }
      const stage = entry?.handoff?.stage ?? null;
      if (stage && (stages.length === 0 || stages[stages.length - 1] !== stage)) stages.push(stage);
      if (stage === 'committed') { committed = { stage, selected: entry.selected, targetId, atMs: Date.now() - pressAt }; break; }
      if (stage === 'failed') { committed = { stage, selected: entry.selected, targetId }; break; }
      await sleep(150);
    }
    out.stagesSeen = stages;
    out.committed = committed;
    if (!committed || committed.stage !== 'committed') throw new Error('voice switch never committed: ' + JSON.stringify(committed));
    if (committed.selected !== targetId) throw new Error('selected voice after commit is ' + committed.selected + ', expected ' + targetId);

    // After the commit: signal false, session.voice the new id, and the next
    // start (after the commit) reads 6 indices asked for in the new voice.
    const afterT = Date.now();
    let after = null;
    while (Date.now() - afterT < 30000) {
      const mine = await engineOfMine();
      if (mine?.session?.prefetch && mine.session.prefetch.from !== beforeSwitch?.from && Date.now() > committed.atMs + pressAt) { after = mine; break; }
      await sleep(150);
    }
    out.afterCommit = after ? {
      voice: after.session.voice,
      signal: after.session.store?.signal,
      prefetch: after.session.prefetch ? { from: after.session.prefetch.from, sentences: after.session.prefetch.sentences, requests: after.session.prefetch.requests, order: after.session.prefetch.order.slice().sort((a, b) => a - b), orderLen: after.session.prefetch.order.length, peak: after.session.prefetch.peak } : null,
    } : null;
    const sortedAfter = after?.session?.prefetch ? after.session.prefetch.order.slice().sort((a, b) => a - b) : null;
    out.checks = {
      signalFalse: after?.session?.store ? after.session.store.signal === false : null,
      voiceIsTarget: after?.session?.voice === targetId,
      orderSix: sortedAfter ? sortedAfter.length === 6 && sortedAfter.every((v, i) => v === after.session.prefetch.from + i) : null,
    };
    // "Asked for in the new voice": live synthesis (no (cached)) after the commit.
    const delta = (await Zotero.Debug.get()).slice(debugLen0);
    const lines = delta.split('\n').filter(l => l.includes('word timestamps for') || l.includes('no word timestamps for'));
    const liveAfterCommit = lines.filter(l => !l.includes('(cached)'));
    out.synthesisLinesAfterCommit = { total: lines.length, live: liveAfterCommit.length, sample: liveAfterCommit.length ? liveAfterCommit[0].slice(0, 140) : null };
    out.checks.newVoiceAsked = liveAfterCommit.length > 0;

    // Stop the reading and close the fixture; cleanup erases the item.
    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(500);
    try { const pc = reader.close(); if (pc && pc.then) await pc; } catch (_) {}
    out.managerLeft = 'tab closed';
    S.item5 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item5 = out;
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
