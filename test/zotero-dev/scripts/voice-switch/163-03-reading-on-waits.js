(async () => {
  // Issue #163, item 14 row "Reading on": pick B while A reads on; A asks for
  // nothing new (store.requests flat, no new A fetch); at the first sentence A
  // lacks, the reading waits (stage waiting, waitedAt); B's audio lands and B
  // reads that sentence from offset 0 (last.kind sentence, notice selected).
  // The hold delays ONLY the pick target's requests, and its mode is read at
  // FIRE time so a flip to 'fail' (163-07) hits in-flight requests too.
  const session = Zotero.__ztts163;
  if (!session) throw new Error('163 session state is missing');
  // swapFixture replaces the fixture mid-script: helpers re-read the CURRENT
  // fixture item id instead of a capture taken before the swap.
  const itemID = () => session.fixtureItemID;
  const S = Zotero.ZoteroTTS.diagnostics;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readerOf = () => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID()) return list[i]; } catch (_) {}
    }
    return null;
  };
  const eng = async () => {
    const all = JSON.parse(await S.engine());
    return { all, tab: all.readers.find(row => Number(row.itemID) === Number(itemID())) || null };
  };
  const vs = async () => {
    const all = JSON.parse(await S.voiceSwitch());
    const readers = Zotero.Reader?._readers || [];
    let index = -1;
    for (let i = 0; i < readers.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(readers[i]) && readers[i]?.itemID === itemID()) { index = i; break; } } catch (_) {}
    }
    return { all, index, tab: index >= 0 ? (all.readers[index] ?? null) : null };
  };
  const installHold = () => {
    const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
    const original = sandbox.fetch;
    const log = [];
    // The provider body names the voice WITHOUT its 'local::' prefix; match either form.
    const voiceMatches = voice => {
      if (!voice || !session.holdVoice) return false;
      const short = String(session.holdVoice).includes('::') ? String(session.holdVoice).split('::').pop() : String(session.holdVoice);
      return voice === session.holdVoice || voice === short;
    };
    const wrapped = function (input, init) {
      let url = ''; let voice = null;
      try { url = String(input && input.url !== undefined ? input.url : input); } catch (_) {}
      try { const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; voice = body?.voice ?? null; } catch (_) {}
      const matches = voiceMatches(voice);
      const entry = { at: Date.now(), url: String(url).slice(0, 80), voice, heldMs: matches ? session.hold.ms : 0, mode: matches ? session.hold.mode : 'pass' };
      log.push(entry);
      const result = Reflect.apply(original, sandbox, [input, init]);
      if (!matches) return result;
      const PromiseCtor = sandbox.Promise || Promise;
      return new PromiseCtor((resolve, reject) => {
        // Mode read at fire time: a flip while the request is in flight still applies.
        setTimeout(() => {
          if (session.hold.mode === 'fail') { try { reject(new Error('fixture 163: the pick target request was made to fail')); } catch (_) {} return; }
          try { result.then(resolve, reject); } catch (e) { try { reject(e); } catch (_) {} }
        }, session.hold.ms);
      });
    };
    sandbox.fetch = wrapped;
    return { log, restore: () => { try { sandbox.fetch = original; } catch (_) {} } };
  };
  const pressKey = (rw, key, code, keyCode, shift) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = shift
      ? [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]
      : [tip.keydown(ev(key, code, keyCode)), tip.keyup(ev(key, code, keyCode))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
  const restoreHost = () => { try { if (host && host.windowState === 2) { host.restore(); host.focus(); } } catch (_) {} };
  const minimizeHost = async () => { try { if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED; } catch (_) {} await sleep(300); };

  // The plugin's in-memory audio cache keeps every sentence both pair voices have
  // touched, process-lifetime and unclearable, and held lookups answer from it —
  // so a row that needs a genuinely-held request or a dry sentence imports a
  // fixture with fresh prose first (params.fixture163), closing the old reader.
  const swapFixture = async () => {
    const file = Zotero.ZoteroTTSRun.params.fixture163;
    if (!file) throw new Error('params.fixture163 missing');
    const main = Zotero.getMainWindow?.();
    for (const row of (session.fixtures || [])) {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) {
        try {
          if (Components.utils.isDeadWrapper?.(list[i]) || list[i]?.itemID !== row.itemID) continue;
          try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
          const closing = list[i].close?.(); if (closing && typeof closing.then === 'function') await closing;
        } catch (_) {}
      }
      try { const old = Zotero.Items.get(row.itemID); if (old) await old.eraseTx(); } catch (_) {}
    }
    await waitFor(() => !(Zotero.Reader?._readers || []).some(r => (session.fixtures || []).some(row => row.itemID === r?.itemID)), 8000, 100);
    if (main?.Zotero_Tabs?.select && session.hostBefore?.selectedTab) { /* keep selection stable */ }
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS issue 163 pdf ${Date.now()}` });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    session.fixtures = [{ kind: 'pdf', itemID: item.id, key: item.key, title: item.getField?.('title') ?? null, file }];
    Zotero.ZoteroTTSRun.state.fixtures163 = session.fixtures;
    session.fixtureItemID = item.id;
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    if (main?.Zotero_Tabs?.select && session.hostBefore?.selectedTab) { /* selection restored at cleanup */ }
    const reader = await waitFor(() => {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) {
        try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === item.id && list[i]?._internalReader?._readAloudManager) return list[i]; } catch (_) {}
      }
      return null;
    }, 24000, 200);
    if (!reader) throw new Error('fresh fixture reader did not initialize');
    if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    reader.focus?.();
    await sleep(400);
    // The segment store is lazy for a fresh reader: open the popup once (it plays
    // at once on the remembered voice) and pause in the same script. On a fresh
    // reader the remembered voice may not resolve on its own (selectedVoiceID
    // stays null and the manager never auto-activates, reader.js 83876), so pick
    // the seed voice explicitly, which sets _voice for activate().
    const manager0 = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    reader._internalReader.toggleReadAloudPopup(true);
    const active0 = await waitFor(() => { try { return !!manager0.active; } catch (_) { return false; } }, 10000, 120);
    if (!active0) {
      let want = session.memoryVoicePick || 'local::af_bella';
      try {
        const rows0 = manager0.allVoices || [];
        const ids = [];
        for (let i = 0; i < rows0.length; i++) ids.push(Components.utils.waiveXrays(rows0[i])?.id ?? null);
        want = ids.includes(want) ? want : (ids.find(id => String(id || '').startsWith('local::af_')) ?? want);
      } catch (_) {}
      session.memoryVoicePick = want;
      try { manager0.selectVoice(want); } catch (e) { out.errors.push('fresh selectVoice: ' + String(e)); }
      await waitFor(() => { try { return !!manager0.active; } catch (_) { return false; } }, 12000, 120);
    }
    try { if (manager0.active && !manager0.paused) manager0.pause(); } catch (_) {}
    await waitFor(() => { try { return !!manager0.active && manager0.paused; } catch (_) { return false; } }, 8000, 100);
    const rows = await waitFor(() => {
      const segs = reader._internalReader._readAloudManager._segments || reader._internalReader._readAloudSegments?.segments;
      return segs?.length ? segs : null;
    }, 36000, 250);
    if (!rows) throw new Error('fresh fixture segments never appeared');
    await sleep(200);
    return { reader, segmentCount: rows.length };
  };

  const out = { status: 'FAIL', errors: [], checks: {}, trace: [] };
  let hold = null;
  try {
    restoreHost();
    const swapped = await swapFixture();
    const reader = swapped.reader;
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    const rw = reader._iframeWindow;
    out.checks.freshFixture = { itemID: session.fixtureItemID, segments: swapped.segmentCount };

    // Seed: start playback, then try one reposition for runway; wherever playback
    // settles, require pin+12 ≤ last index so a dry sentence exists ahead. The
    // fresh fixture's first clip is a real request: give it time to land.
    const PIN = 13;
    const t0 = Date.now();
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { out.errors.push('seed play: ' + String(e)); }
    const started = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 30000, 300);
    if (started === null) throw new Error('session never started playing');
    // A fresh reader may have activated on the NATIVE per-language map's voice
    // (here a Fish voice from the owner's history). Fix it while paused: the
    // paused pick goes Zotero's native way and never creates a switch.
    let vx0 = ((await eng())?.tab?.session?.voice) ?? null;
    if (!String(vx0 || '').startsWith('local::af_')) {
      try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
      await sleep(300);
      try { manager.selectVoice('local::af_bella'); } catch (e) { out.errors.push('voice fix selectVoice: ' + String(e)); }
      await sleep(700);
      try { rw.document.notifyUserGestureActivation(); } catch (_) {}
      try { manager.play(); } catch (_) {}
      const up = await waitFor(async () => {
        const t = await eng();
        return t.tab?.session?.playing === true && String(t.tab.session.voice || '').startsWith('local::af_') ? t.tab.session.position : null;
      }, 25000, 300);
      if (up === null) throw new Error(`session never played on a local voice (was ${vx0})`);
    }
    let pin = started;
    try {
      manager.repositionTo(PIN);
      await sleep(900);
      const t1 = await eng();
      const now = t1?.tab?.session?.position ?? null;
      if (now !== null && Math.abs(now - PIN) <= 1) pin = now;
    } catch (_) {}
    const seeded = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 15000, 300);
    out.checks.seededPosition = seeded;
    out.checks.pin = pin;
    const segCount = swapped.segmentCount;
    if (seeded === null) throw new Error('session not playing after seed');
    if (pin + 12 > segCount - 1) throw new Error(`no runway: pin ${pin} of ${segCount}`);

    const before = await eng();
    const voiceX = before.tab.session.voice;
    if (!String(voiceX || '').startsWith('local::af_')) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    const requestsBefore = before.tab.session.store?.requests ?? null;
    const lookupsBefore = before.tab.session.store?.lookups ?? null;
    out.checks.baseline = { voiceX, voiceB, position: before.tab.session.position, requests: requestsBefore, lookups: lookupsBefore, carriedOn: carriedBefore, started: startedBefore, prefetchCount: 8 };

    // Hold the pick target's requests (20 s < the 60 s preparation timeout) and pick.
    session.hold = { armed: true, ms: 20000, mode: 'hold', voice: voiceB };
    session.holdVoice = voiceB;
    hold = installHold();
    const pickAt = Date.now();
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
    }, 5000, 80);
    if (!pending) throw new Error('switch to B never reported pending/preparing');
    const atPick = await eng();
    out.checks.atPick = {
      pending: pending.pending, stage: pending.stage, oldRequests: pending.oldRequests ?? null,
      waitedAt: pending.waitedAt ?? null, prepared: pending.prepared ?? null,
      requests: atPick.tab.session.store?.requests ?? null, lookups: atPick.tab.session.store?.lookups ?? null,
      voice: atPick.tab.session.voice, playing: atPick.tab.session.playing,
      msAfterPick: Date.now() - pickAt,
    };
    out.trace.push({ at: 'pick', pending: pending.pending, stage: pending.stage, oldRequests: pending.oldRequests ?? null });

    // Requests flat while pending (first ~4 s), then watch for the wait.
    await sleep(4000);
    const flat = await eng();
    out.checks.requestsFlatWhilePending = {
      requests: flat.tab.session.store?.requests ?? null, lookups: flat.tab.session.store?.lookups ?? null,
      position: flat.tab.session.position, voice: flat.tab.session.voice, playing: flat.tab.session.playing,
      stillOldVoice: flat.tab.session.voice === voiceX,
    };

    // Watch until the reading waits for the new voice.
    const waitObserved = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h?.stage === 'waiting') return h;
      if (h && h.stage !== 'preparing' && h.stage !== 'sentence' && h.stage !== 'waiting') return { __stage: h.stage, handoff: h };
      return null;
    }, 90000, 500);
    if (!waitObserved || waitObserved.__stage) {
      out.checks.noWait = { observed: waitObserved ?? null };
      throw new Error('reading never waited for the new voice: ' + JSON.stringify(waitObserved ?? null));
    }
    const waitedAt = waitObserved.waitedAt;
    session.hold.armed = false; // the next B request passes at once
    const atWait = await eng();
    out.checks.atWait = {
      stage: waitObserved.stage, waitedAt, prepared: waitObserved.prepared ?? null, oldRequests: waitObserved.oldRequests ?? null,
      position: atWait.tab.session.position, playing: atWait.tab.session.playing, voice: atWait.tab.session.voice,
      currentIndex: atWait.tab.session.currentIndex, buffering: atWait.tab.session.buffering,
      requests: atWait.tab.session.store?.requests ?? null, lookups: atWait.tab.session.store?.lookups ?? null,
      lookupsRose: (atWait.tab.session.store?.lookups ?? 0) > (lookupsBefore ?? 0),
      notices: atWait.tab.session.notices ?? null,
      msAfterPick: Date.now() - pickAt,
    };
    out.trace.push({ at: 'waiting', stage: 'waiting', waitedAt, position: atWait.tab.session.position, requests: out.checks.atWait.requests, lookups: out.checks.atWait.lookups });

    // The reading holds: position stays, playing false.
    await sleep(2500);
    const holding = await eng();
    out.checks.holding = {
      position: holding.tab.session.position, playing: holding.tab.session.playing, voice: holding.tab.session.voice,
      requests: holding.tab.session.store?.requests ?? null,
      stuck: holding.tab.session.position === waitedAt && holding.tab.session.playing === false,
    };

    // B's audio for the waited sentence lands; B takes it from offset 0.
    const commit = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h?.last && h.last.kind === 'sentence') return h;
      if (h && h.stage === 'failed') return { __failed: true, handoff: h };
      if (h && h.stage === 'cancelled') return { __cancelled: true, handoff: h };
      return null;
    }, 60000, 300);
    if (!commit || commit.__failed || commit.__cancelled) {
      out.checks.noCommit = { observed: commit ?? null };
      throw new Error('handoff never committed the waited sentence: ' + JSON.stringify(commit ?? null));
    }
    await sleep(700);
    const after = await eng();
    const afterVs = await vs();
    session.hold.armed = false;
    session.hold.mode = 'pass';
    const sel = afterVs.tab?.handoff;
    out.checks.commit = {
      last: commit.last ?? null, stage: commit.stage ?? null, notice: sel?.notice ?? null, pendingNow: sel?.pending ?? null,
      waitedAt, voiceNow: after.tab.session.voice, position: after.tab.session.position,
      playing: after.tab.session.playing, playbackTime: after.tab.session.playbackTime,
      requests: after.tab.session.store?.requests ?? null, lookups: after.tab.session.store?.lookups ?? null,
      oldRequests: sel?.oldRequests ?? null,
      carriedOn: after.tab.stats.carriedOn, started: after.tab.stats.started,
      msAfterPick: Date.now() - pickAt,
    };
    // New A fetches after the pick: none (the wrapper log since pickAt; the
    // provider body names the voice without the 'local::' prefix).
    const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
    out.checks.aFetchesAfterPick = hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceX)).map(e => ({ at: e.at - pickAt, url: e.url, heldMs: e.heldMs }));
    out.checks.bFetchesAfterPick = hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceB)).length;

    const c = out.checks;
    c.pass =
      c.atPick.pending === voiceB && c.atPick.stage === 'preparing' && (c.atPick.oldRequests ?? 0) === 0
      && c.requestsFlatWhilePending.stillOldVoice && c.requestsFlatWhilePending.requests === c.atPick.requests
      && c.atWait.stage === 'waiting' && c.atWait.waitedAt === waitedAt && c.atWait.voice === voiceX
      && c.atWait.playing === false && c.atWait.lookupsRose && c.holding.stuck
      && c.holding.requests === c.atWait.requests
      && c.commit.last?.kind === 'sentence' && c.commit.last?.index === waitedAt && c.commit.last?.offset === 0
      && c.commit.last?.from === voiceX && c.commit.last?.to === voiceB
      && c.commit.notice === 'selected' && (c.commit.oldRequests ?? 0) === 0
      && c.aFetchesAfterPick.length === 0
      && c.commit.voiceNow === voiceB;
    out.status = c.pass ? 'PASS' : 'FAIL';
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
  } catch (e) {
    out.errors.push(String(e));
    try {
      if (hold) out.wrapperLog = hold.log.slice(-40).map(row => ({ at: row.at, voice: row.voice, heldMs: row.heldMs, mode: row.mode }));
    } catch (_) {}
    try { session.hold.armed = false; session.hold.mode = 'pass'; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
