(async () => {
  // Issue #154: prepared audio reused. While PLAYING with two word-timed Kokoro
  // voices the handoff arms a word cut and never fills prepared ahead, so the
  // reuse row runs PAUSED, where handoff.prepared does hold the next sentence:
  // pause, pick B, wait for prepared position+1, press ArrowRight (commit at
  // once), then Play: the prepared sentence plays with no second request.
  const session = Zotero.__ztts154;
  const itemID = session?.fixtureItemID;
  if (!session || !itemID) throw new Error('154 session state is missing (run 154-01 first)');
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
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const eng = async () => {
    const all = JSON.parse(await S.engine());
    return { all, tab: all.readers.find(row => Number(row.itemID) === Number(itemID)) || null };
  };
  const vs = async () => {
    const all = JSON.parse(await S.voiceSwitch());
    const readers = Zotero.Reader._readers || [];
    let index = -1;
    for (let i = 0; i < readers.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(readers[i]) && readers[i]?.itemID === itemID) { index = i; break; } } catch (_) {}
    }
    return { all, index, tab: index >= 0 ? (all.readers[index] ?? null) : null };
  };
  const resetSession = async () => {
    const reader = readerOf();
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
    await sleep(250);
    internal.toggleReadAloudPopup(false);
    await waitFor(() => { try { return !manager.active; } catch (_) { return false; } }, 8000);
    await sleep(400);
    // A script-started play needs the reader iframe's user activation (autoplay gate).
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    internal.toggleReadAloudPopup(true);
    const up = await waitFor(() => { try { return !!manager.active && !manager.paused; } catch (_) { return false; } }, 12000);
    if (!up) throw new Error('reopened player did not start');
    // The persisted reading position resumes wherever the last run left it: pin
    // sentence 1 (pause, reposition, play) until the session reads there.
    let lastKick = 0;
    const atOne = await waitFor(async () => {
      let ss = null;
      try {
        const t = await eng();
        ss = t?.tab?.session ?? null;
      } catch (_) { return false; }
      if (!ss || ss.ended) return false;
      if (ss.position !== 1 || !ss.playing) {
        if (Date.now() - lastKick > 1200) {
          lastKick = Date.now();
          try { manager.pause(); } catch (_) {}
          await sleep(150);
          try { manager.repositionTo(1); } catch (_) {}
          await sleep(150);
          try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
          try { manager.play(); } catch (_) {}
        }
        return false;
      }
      return true;
    }, 30000, 300);
    if (!atOne) throw new Error('session never read at sentence 1');
    return { reader, internal, manager };
  };
  const installHold = () => {
    const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
    const original = sandbox.fetch;
    const log = [];
    const wrapped = function (input, init) {
      let url = ''; let voice = null;
      try { url = String(input && input.url !== undefined ? input.url : input); } catch (_) {}
      let reqText = '';
      try { const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; voice = body?.voice ?? null; reqText = String(body?.text ?? '').slice(0, 60); } catch (_) {}
      const hold = session.hold.armed ? session.hold.ms : 0;
      const entry = { at: Date.now(), url: String(url).slice(0, 90), voice, text: reqText, heldMs: hold };
      log.push(entry);
      const result = Reflect.apply(original, sandbox, [input, init]);
      if (!hold) return result;
      const PromiseCtor = sandbox.Promise || Promise;
      return new PromiseCtor((resolve, reject) => {
        setTimeout(() => { try { result.then(resolve, reject); } catch (e) { reject(e); } }, hold);
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

  const out = { status: 'FAIL', errors: [], checks: {} };
  let hold = null;
  try {
    restoreHost();
    const fresh = await resetSession();
    const reader = fresh.reader;
    const m = fresh.manager;
    const rw = reader._iframeWindow;
    hold = installHold();

    const before = await eng();
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    const voiceX = before.tab.session.voice;
    if (voiceX !== session.voiceA && voiceX !== session.voiceB) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === session.voiceA ? session.voiceB : session.voiceA;
    out.checks.baseline = { carriedOn: carriedBefore, started: startedBefore, position: before.tab.session.position, voice: voiceX };

    // Pause, then pick B with the hold armed: the first preparation request is held.
    try { m.pause(); } catch (_) {}
    const pausedAt = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.paused === true ? { position: t.tab.session.position, voice: t.tab.session.voice } : null;
    }, 8000);
    if (!pausedAt) throw new Error('session did not pause');
    const posAtPick = pausedAt.position;
    const landing = posAtPick + 1;
    session.hold.armed = true;
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
    }, 3500, 80);
    if (!pending) throw new Error('switch to B never reported pending/preparing');
    // Release the hold: requests that start now pass through, so the ahead
    // preparation fills quickly once the held first response lands.
    session.hold.armed = false;

    // Paused, armWord() stands down (handoff.ts), so the poll prepares ahead:
    // wait until the skipped-to sentence is in handoff.prepared.
    const prepared = await waitFor(async () => {
      const t = await vs();
      const rows = t.tab?.handoff?.prepared ?? [];
      return rows.includes(landing) ? rows : null;
    }, 20000, 150);
    out.checks.posAtPick = posAtPick;
    out.checks.expectedLanding = landing;
    out.checks.prepared = prepared || null;
    if (!prepared) throw new Error('paused handoff never prepared the next sentence');

    // The skipped-to sentence's text, to identify any refetch in the wrapper log.
    let landingText = '';
    try {
      const rows = reader._internalReader._readAloudSegments?.segments;
      landingText = String(Components.utils.waiveXrays(rows)[landing]?.text ?? '').slice(0, 60);
    } catch (_) {}
    out.checks.landingText = landingText;

    // Skip ahead onto the prepared sentence.
    const keyAt = Date.now();
    out.skipKey = pressKey(rw, 'ArrowRight', 'ArrowRight', 39, false);
    await sleep(140);
    const immEng = await eng();
    const immVs = await vs();
    const s = immEng.tab.session;
    const h = immVs.tab.handoff;
    out.checks.immediate = {
      voice: s.voice, handoff: s.handoff, playing: s.playing, skipPending: s.skipPending, paused: s.paused,
      position: s.position,
      carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
      selected: immVs.tab.selected, last: h?.last ?? null, notice: h?.notice ?? null,
      requestsAfterKey: s.store ? s.store.requests : null, clips: s.store ? s.store.clips : null,
    };
    const imm = out.checks.immediate;
    out.checks.immediateOK = imm.voice === voiceB && imm.handoff === null && imm.playing === false
      && imm.paused === true && imm.skipPending === true
      && imm.carriedOn === carriedBefore + 1 && imm.started === startedBefore
      && imm.selected === voiceB && imm.last?.kind === 'skip' && imm.last?.from === voiceX && imm.last?.to === voiceB
      && imm.notice === 'selected';
    // The debounced speak must not request anything while paused.
    await sleep(1100);
    const quiet = await eng();
    out.checks.requestsAfterDebounce = quiet.tab.session.store ? quiet.tab.session.store.requests : null;
    out.checks.noRequestWhilePaused = out.checks.requestsAfterDebounce === imm.requestsAfterKey;

    // Play: the prepared clip plays with no second request.
    const requestsBeforePlay = out.checks.requestsAfterDebounce;
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    try { m.play(); } catch (e) { out.errors.push('play: ' + String(e)); }
    const played = await waitFor(async () => {
      const t = await eng();
      const ss = t.tab.session;
      return ss.playing === true && ss.voice === voiceB && ss.position === landing ? { ss } : null;
    }, 12000, 100);
    if (!played) throw new Error('Play never read the prepared skipped-to sentence');
    out.checks.atPlay = {
      position: played.ss.position, currentIndex: played.ss.currentIndex,
      requestsAtPlay: played.ss.store.requests, requestsBeforePlay,
      playbackTime: played.ss.playbackTime,
    };
    // A refetch of the skipped-to sentence would fetch its text again; the
    // requests counter may still grow from read-ahead past it.
    const refetches = hold.log.filter(e => e.at >= keyAt && landingText && e.text === landingText);
    out.checks.refetchesAfterKey = refetches.length;
    out.checks.fetchesAfterKey = hold.log.filter(e => e.at >= keyAt).map(e => ({ text: e.text.slice(0, 24), heldMs: e.heldMs }));
    out.checks.noSecondRequest = refetches.length === 0;
    out.checks.startedNearOffset0 = (played.ss.playbackTime ?? 99) < 1.0;
    await waitFor(async () => { const t = await eng(); return t.tab?.session?.store?.inflight === 0; }, 8000, 200);
    try { if (m.active && !m.paused) m.pause(); } catch (_) {}
    out.status = out.checks.immediateOK && out.checks.noRequestWhilePaused && out.checks.noSecondRequest && out.checks.startedNearOffset0 ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
    try { session.hold.armed = false; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
