(async () => {
  // Issue #163, item 14 row "Both have it" (paused prepared reuse): pause, pick
  // B (the paused pick prepares ahead), wait until handoff.prepared holds the
  // next sentence, skip onto it with ArrowRight, then Play. Expected: the skip
  // does NOT commit (the player still shows the old voice), the notice is
  // "ready" once B holds the landed sentence, and Play reads it in B from
  // offset 0 with no second request. Warm fixture is fine here.
  const session = Zotero.__ztts163;
  if (!session) throw new Error('163 session state is missing');
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
  const eng = async () => {
    const all = JSON.parse(await S.engine());
    return { all, tab: all.readers.find(row => Number(row.itemID) === Number(session.fixtureItemID)) || null };
  };
  const vs = async () => {
    const all = JSON.parse(await S.voiceSwitch());
    const readers = Zotero.Reader?._readers || [];
    let index = -1;
    for (let i = 0; i < readers.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(readers[i]) && readers[i]?.itemID === session.fixtureItemID) { index = i; break; } } catch (_) {}
    }
    return { all, index, tab: index >= 0 ? (all.readers[index] ?? null) : null };
  };
  const installHold = () => {
    const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
    const original = sandbox.fetch;
    const log = [];
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

  const swapFixture = async file => {
    if (!file) throw new Error('fixture path param missing');
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
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS issue 163 pdf ${Date.now()}` });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    session.fixtures = [{ kind: 'pdf', itemID: item.id, key: item.key, title: item.getField?.('title') ?? null, file }];
    session.fixtureItemID = item.id;
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
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
    const swapped = await swapFixture(Zotero.ZoteroTTSRun.params.fixture163);
    const reader = swapped.reader;
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    const rw = reader._iframeWindow;
    const view = internal._primaryView;
    if (!view) throw new Error('primary view missing');

    // Pause; pick B; the paused handoff prepares ahead (armWord stands down).
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
    const pausedAt = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.paused === true ? { position: t.tab.session.position, voice: t.tab.session.voice } : null;
    }, 15000, 200);
    if (!pausedAt) throw new Error('session did not pause');
    const PIN = Math.min(5, swapped.segmentCount - 3);
    const voiceX = pausedAt.voice;
    if (!String(voiceX || '').startsWith('local::af_')) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    const posAtPick = PIN;
    const landing = Math.min(posAtPick + 1, swapped.segmentCount - 1);
    const carriedBefore = (await eng()).tab.stats.carriedOn;
    const startedBefore = (await eng()).tab.stats.started;
    out.checks.baseline = { voiceX, voiceB, posAtPick: PIN, landing, carriedOn: carriedBefore, started: startedBefore };

    // Move to PIN (the reposition unpauses the session), then pause again: the
    // pick must happen PAUSED, where armWord stands down and prepared fills.
    try { manager.repositionTo(PIN); } catch (_) {}
    await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.position === PIN && t.tab.session.currentIndex === PIN ? true : false;
    }, 15000, 200);
    // Pause only once the landed sentence has STARTED (currentIndex === position):
    // a handoff paused before that never clears awaitingTransition and never
    // prepares ahead.
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
    await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000, 100);
    const posNow = ((await eng()).tab?.session?.position) ?? PIN;
    session.hold = { armed: false, ms: 0, mode: 'pass', voice: voiceB };
    session.holdVoice = voiceB;
    hold = installHold();
    const pickAt = Date.now();
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB ? t.tab.handoff : null;
    }, 5000, 80);
    if (!pending) throw new Error('switch to B never reported pending');
    // The paused poll prepares ahead until the skipped-to sentence is in hand.
    const prepared = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h && (h.stage === 'failed' || h.stage === 'cancelled')) { out.checks.handoffDied = { stage: h.stage, notice: h.notice ?? null }; throw new Error('handoff died preparing: ' + h.stage); }
      const rows = h?.prepared ?? [];
      if (rows.length && !out.checks.preparedProbe) out.checks.preparedProbe = { rows, at: Date.now() - pickAt };
      return rows.includes(landing) ? rows : null;
    }, 30000, 200);
    if (!prepared) throw new Error('paused handoff never prepared the landing: ' + JSON.stringify(out.checks.handoffDied ?? ((await vs()).tab?.handoff ?? null)));
    const readyAt = ((await vs()).tab?.handoff?.notice) ?? null;
    out.checks.prepared = { prepared, notice: readyAt, landing };

    // Skip onto the prepared sentence: the switch must NOT commit at the key.
    out.skipKey = pressKey(rw, 'ArrowRight', 'ArrowRight', 39, false);
    await sleep(900); // the skip debounce
    const immEng = await eng();
    const immVs = await vs();
    const ih = immVs.tab?.handoff;
    const mgrSel = (() => { try { return Components.utils.waiveXrays(reader._internalReader._readAloudManager).selectedVoiceID ?? null; } catch (_) { return null; } })();
    out.checks.afterKey = {
      landing, posAtPick, managerSelected: mgrSel,
      pending: ih?.pending ?? null, stage: ih?.stage ?? null, notice: ih?.notice ?? null,
      paused: immEng.tab.session.paused, playing: immEng.tab.session.playing, position: immEng.tab.session.position,
      carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
    };
    out.checks.notCommittedAtKey = mgrSel === voiceX && ih?.pending === voiceB;
    out.checks.readyNotice = ih?.notice === 'ready' || readyAt === 'ready';

    // Play: the prepared sentence plays in B from offset 0 with no second fetch.
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    const playAt = Date.now();
    let playErr = null;
    try { manager.play(); } catch (e) { playErr = String(e); }
    const played = await waitFor(async () => {
      const t = await eng();
      const ss = t.tab?.session;
      return ss && ss.playing === true && ss.voice === voiceB && ss.position === landing ? ss : null;
    }, 20000, 200);
    await sleep(500);
    const after = await eng();
    const afterVs = await vs();
    out.checks.play = {
      playErr, played: !!played,
      voiceNow: after.tab.session.voice, position: after.tab.session.position,
      playing: after.tab.session.playing, playbackTime: after.tab.session.playbackTime,
      last: afterVs.tab?.handoff?.last ?? null, notice: afterVs.tab?.handoff?.notice ?? null,
      oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      msAfterKey: playAt - pickAt,
    };

    const c = out.checks;
    c.pass =
      c.notCommittedAtKey && c.readyNotice
      && c.play.played && c.play.voiceNow === voiceB
      && (c.play.playbackTime ?? 99) < 2.0
      && c.play.last?.kind === 'sentence' && c.play.last?.index === landing && c.play.last?.offset === 0
      && c.play.last?.to === voiceB
      && c.play.notice === 'selected'
      && (c.play.oldRequests ?? 0) === 0;
    out.status = c.pass ? 'PASS' : 'FAIL';
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
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
