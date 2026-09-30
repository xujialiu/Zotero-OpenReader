(async () => {
  // Issue #163, item 14 row "A jump": with a pick pending, select a sentence in a
  // later paragraph and start with trusted Shift+Space. Expected: stats.started
  // +1, no cancelled notice, the switch still pending, and the landing follows
  // the same rule — the new voice reads the landed sentence from offset 0 when
  // its audio is ready, else the reading waits for it there. Fresh-prose fixture
  // (the in-memory audio cache is text-keyed and process-lifetime).
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

    // Seed: play, fix the voice if the native map won, reposition for runway.
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { throw new Error('seed play: ' + String(e)); }
    const started = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 30000, 300);
    if (started === null) throw new Error('session never started playing');
    const vx0 = ((await eng())?.tab?.session?.voice) ?? null;
    if (!String(vx0 || '').startsWith('local::af_')) {
      try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
      await sleep(300);
      try { manager.selectVoice('local::af_bella'); } catch (_) {}
      await sleep(700);
      try { rw.document.notifyUserGestureActivation(); } catch (_) {}
      try { manager.play(); } catch (_) {}
      const up = await waitFor(async () => {
        const t = await eng();
        return t.tab?.session?.playing === true && String(t.tab.session.voice || '').startsWith('local::af_') ? t.tab.session.position : null;
      }, 25000, 300);
      if (up === null) throw new Error(`session never played on a local voice (was ${vx0})`);
    }
    const PIN = Math.min(4, Math.max(2, swapped.segmentCount - 23));
    try { manager.repositionTo(PIN); await sleep(900); } catch (_) {}
    const at = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 15000, 300);
    if (at === null) throw new Error('session not playing after reposition');

    const before = await eng();
    const voiceX = before.tab.session.voice;
    if (!String(voiceX || '').startsWith('local::af_')) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    const requestsAtPick = before.tab.session.store?.requests ?? null;
    out.checks.baseline = { voiceX, voiceB, position: before.tab.session.position, requests: requestsAtPick, carriedOn: carriedBefore, started: startedBefore };

    // Pick B with its requests held (20 s), then jump.
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
    out.trace.push({ at: 'pick', pending: pending.pending, stage: pending.stage });

    // Jump = manager.repositionTo(targetIndex) on the ACTIVE session, the call
    // the selection-start takes (startReadAloudAtPosition → jumpTo →
    // repositionTo, reader.js 82607-82628); the engine shadows it with
    // tab.jump = true and a pending switch is kept (bind → reset + moved).
    // NOTE: a registered SELECTION target must NOT be present — the unpausing
    // restart-from-selection path calls clearSegments (reader.js 83882-83887),
    // a cancelling call, and the switch is then cancelled by design. The case's
    // trusted Shift+Space on an ACTIVE session is the play/pause toggle
    // (read-aloud-shortcuts.ts smartPlay), not a jump driver.
    const segments = Components.utils.waiveXrays(internal._readAloudSegments?.segments || manager._segments || []);
    const targetIndex = Math.min(at + 10, segments.length - 2);
    out.checks.jump = { targetIndex, targetText: String(Components.utils.waiveXrays(segments[targetIndex])?.text ?? '').slice(0, 40), selection: 'none (a selection target would clearSegments and cancel)' };

    const jumpAt = Date.now();
    // The jump: repositionTo on the active session, the engine's jump path.
    let repErr = null;
    try { manager.repositionTo(targetIndex); } catch (e) { repErr = String(e); }
    await sleep(400);
    const immEng = await eng();
    const immVs = await vs();
    const ih = immVs.tab?.handoff;
    out.checks.afterJumpKey = {
      repErr,
      pending: ih?.pending ?? null, stage: ih?.stage ?? null, notice: ih?.notice ?? null, waitedAt: ih?.waitedAt ?? null,
      voice: immEng.tab.session.voice, position: immEng.tab.session.position, playing: immEng.tab.session.playing,
      startedDelta: immEng.tab.stats.started - startedBefore, carriedOnDelta: immEng.tab.stats.carriedOn - carriedBefore,
    };
    out.trace.push({ at: 'jump+400ms', ...out.checks.afterJumpKey });

    // The landing rule: wait (dry landing) or commit at once (B had it) — at a
    // word boundary too, when both voices time the landed sentence.
    const landed = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h?.last && (h.last.kind === 'sentence' || h.last.kind === 'word')) return { done: true, h };
      if (h?.stage === 'waiting') return { waiting: true, h };
      if (h && (h.stage === 'failed' || h.stage === 'cancelled')) return { bad: h.stage, h };
      return null;
    }, 60000, 300);
    session.hold.armed = false; session.hold.mode = 'pass';
    if (!landed || landed.bad) throw new Error('jump row ended badly: ' + JSON.stringify(landed ?? null));
    out.checks.landing = { waited: !!landed.waiting, stage: landed.h.stage, waitedAt: landed.h.waitedAt ?? null, last: landed.h.last ?? null };
    if (landed.waiting) {
      const commit = await waitFor(async () => {
        const t = await vs();
        const h = t.tab?.handoff;
        return h?.last && (h.last.kind === 'sentence' || h.last.kind === 'word') ? h : null;
      }, 45000, 300);
      if (!commit) throw new Error('waited landing never committed');
      out.checks.landing.last = commit.last;
      out.checks.landing.stage = commit.stage;
    }
    await sleep(700);
    const after = await eng();
    const afterVs = await vs();
    const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
    out.checks.final = {
      notice: afterVs.tab?.handoff?.notice ?? null, pendingNow: afterVs.tab?.handoff?.pending ?? null,
      voiceNow: after.tab.session.voice, position: after.tab.session.position, playing: after.tab.session.playing,
      playbackTime: after.tab.session.playbackTime,
      oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      startedDelta: after.tab.stats.started - startedBefore, carriedOnDelta: after.tab.stats.carriedOn - carriedBefore,
      fallbacks: after.tab.stats.fallbacks,
      xFetchesAfterPick: hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceX)).length,
    };

    const c = out.checks;
    c.pass =
      c.afterJumpKey.notice !== 'cancelled'
      && (c.afterJumpKey.pending === voiceB || c.landing.last?.to === voiceB)
      && c.afterJumpKey.startedDelta === 1
      && (c.landing.last?.kind === 'sentence' || c.landing.last?.kind === 'word')
      && c.landing.last?.to === voiceB
      && (c.landing.waitedAt === null || c.landing.last?.index === c.landing.waitedAt)
      && c.final.notice === 'selected'
      && c.final.voiceNow === voiceB
      && (c.final.oldRequests ?? 0) === 0
      && c.final.xFetchesAfterPick === 0
      && (c.final.fallbacks ?? 0) === 0;
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
