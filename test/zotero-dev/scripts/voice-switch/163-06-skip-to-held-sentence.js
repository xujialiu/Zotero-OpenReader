(async () => {
  // Issue #163, item 14 row "A skip to a sentence A has": with a pick pending
  // (held), trusted ArrowLeft lands on the previous sentence, which the old
  // voice has. Expected: the old voice reads it from offset 0, the player still
  // shows the old voice, the switch is neither taken nor cancelled, and the new
  // voice takes over within the sentence (last.kind word, both voices time
  // words) or at a later sentence; notice selected; no old-voice fetch.
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

    // Seed: play, fix the voice if the native map won, let it advance past one
    // sentence so the skip-left landing is a sentence the old voice HAS.
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
    // Advance one sentence so position-1 is a sentence A already read.
    const advanced = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true && t.tab.session.position >= 1 ? t.tab.session.position : null;
    }, 25000, 300);
    if (advanced === null) throw new Error('session never advanced past the first sentence');

    const before = await eng();
    const voiceX = before.tab.session.voice;
    if (!String(voiceX || '').startsWith('local::af_')) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    const requestsAtPick = before.tab.session.store?.requests ?? null;
    const posAtPick = before.tab.session.position;
    out.checks.baseline = { voiceX, voiceB, position: posAtPick, requests: requestsAtPick, carriedOn: carriedBefore, started: startedBefore };

    // Pick B with its first request briefly held (3.5 s, as #154), then skip left.
    session.hold = { armed: true, ms: 3500, mode: 'hold', voice: voiceB };
    session.holdVoice = voiceB;
    hold = installHold();
    const pickAt = Date.now();
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
    }, 5000, 80);
    if (!pending) throw new Error('switch to B never reported pending/preparing');

    const landing = Math.max(0, posAtPick - 1);
    out.skipKey = pressKey(rw, 'ArrowLeft', 'ArrowLeft', 37, false);
    // The skip's speak runs after the 600 ms debounce: sample after it, so the
    // old voice is observed actually reading the landing.
    await sleep(900);
    const immEng = await eng();
    const immVs = await vs();
    const ih = immVs.tab?.handoff;
    const mgrSel = (() => { try { return Components.utils.waiveXrays(reader._internalReader._readAloudManager).selectedVoiceID ?? null; } catch (_) { return null; } })();
    session.hold.armed = false;
    out.checks.afterKey = {
      landing, posAtPick,
      voice: immEng.tab.session.voice, playing: immEng.tab.session.playing, position: immEng.tab.session.position,
      playbackTime: immEng.tab.session.playbackTime,
      managerSelected: mgrSel, pending: ih?.pending ?? null, stage: ih?.stage ?? null, notice: ih?.notice ?? null,
      carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
      requests: immEng.tab.session.store?.requests ?? null, requestsAtPick,
    };
    out.trace.push({ at: 'key+900ms', ...out.checks.afterKey });
    out.checks.oldReadsLanding = out.checks.afterKey.voice === voiceX
      && out.checks.afterKey.playing === true
      && out.checks.afterKey.position === landing
      && (out.checks.afterKey.playbackTime ?? 99) < 2.5;
    out.checks.playerShowsX = mgrSel === voiceX;
    out.checks.switchKept = out.checks.afterKey.pending === voiceB && out.checks.afterKey.notice !== 'cancelled';

    // The new voice takes over within the landing sentence (word) or later.
    const takeover = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h?.last) return h;
      if (h && (h.stage === 'failed' || h.stage === 'cancelled')) return { bad: h.stage, handoff: h };
      return null;
    }, 30000, 200);
    session.hold.armed = false; session.hold.mode = 'pass';
    if (!takeover || takeover.bad) throw new Error('no takeover: ' + JSON.stringify(takeover ?? null));
    await sleep(600);
    const after = await eng();
    const afterVs = await vs();
    const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
    out.checks.takeover = {
      last: takeover.last ?? null, stage: takeover.stage ?? null,
      notice: afterVs.tab?.handoff?.notice ?? null,
      voiceNow: after.tab.session.voice, position: after.tab.session.position, playing: after.tab.session.playing,
      oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      xFetchesAfterPick: hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceX)).length,
    };

    const c = out.checks;
    c.pass =
      c.oldReadsLanding && c.playerShowsX && c.switchKept
      && (c.takeover.last?.kind === 'word'
        || (c.takeover.last?.kind === 'sentence' && (c.takeover.last?.index ?? -1) > c.afterKey.landing))
      && c.takeover.last?.to === voiceB
      && c.takeover.notice === 'selected'
      && (c.takeover.oldRequests ?? 0) === 0
      && c.takeover.xFetchesAfterPick === 0;
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
