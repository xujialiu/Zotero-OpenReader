(async () => {
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
    const readers = Zotero.Reader?._readers || [];
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
      try { const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; voice = body?.voice ?? null; } catch (_) {}
      const hold = session.hold.armed ? session.hold.ms : 0;
      const entry = { at: Date.now(), url: String(url).slice(0, 90), voice, heldMs: hold };
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

  // Issue #154 paused: pick while paused (held request), ArrowLeft commits with
  // notice "selected" at once and no request; Play reads the target at offset 0.
  // Paused: pick with the request held, ArrowLeft, then Play in the new voice.
  // Variant A: skip back from sentence 1. Variant B: pause mid-sentence 0, the
  // skip lands on the sentence paused in, Play reads it from offset 0.
  const out = { status: 'FAIL', errors: [], variants: {} };
  let hold = null;
  try {
    restoreHost();
    hold = installHold();
    for (const variant of ['back-from-1', 'lands-on-paused-in']) {
      const row = { status: 'FAIL', errors: [], checks: {} };
      out.variants[variant] = row;
      try {
        const fresh = await resetSession();
        const reader = fresh.reader;
        const m = fresh.manager;
        const rw = reader._iframeWindow;
        if (variant === 'back-from-1') {
          const reached = await waitFor(async () => {
            const t = await eng();
            return t.tab?.session?.playing === true && t.tab.session.position >= 1 ? t.tab.session.position : false;
          }, 30000, 200);
          if (!reached) throw new Error('never reached position >= 1 while playing');
          try { m.pause(); } catch (_) {}
        } else {
          // Pause mid-way through sentence 0: pin sentence 0 first (the reset
          // resumes at the persisted position).
          let lastKick = 0;
          const atZero = await waitFor(async () => {
            let ss = null;
            try { ss = (await eng()).tab?.session ?? null; } catch (_) { return false; }
            if (!ss || ss.ended) return false;
            if (ss.position !== 0 || !ss.playing || (ss.playbackTime ?? 0) < 0.8) {
              if (Date.now() - lastKick > 1200) {
                lastKick = Date.now();
                try { m.pause(); } catch (_) {}
                await sleep(150);
                try { m.repositionTo(0); } catch (_) {}
                await sleep(150);
                try { rw.document.notifyUserGestureActivation(); } catch (_) {}
                try { m.play(); } catch (_) {}
              }
              return false;
            }
            return true;
          }, 30000, 200);
          if (!atZero) throw new Error('never reached mid-sentence 0 while playing');
          try { m.pause(); } catch (_) {}
        }
        const pausedAt = await waitFor(async () => {
          const t = await eng();
          return t.tab?.session?.paused === true ? { position: t.tab.session.position, playbackTime: t.tab.session.playbackTime, voice: t.tab.session.voice } : null;
        }, 8000, 100);
        if (!pausedAt) throw new Error('session did not pause');
        row.checks.pausedAt = pausedAt;
        const before = await eng();
        const carriedBefore = before.tab.stats.carriedOn;
        const startedBefore = before.tab.stats.started;
        row.checks.baseline = { carriedOn: carriedBefore, started: startedBefore };
        const voiceX = pausedAt.voice;
        if (voiceX !== session.voiceA && voiceX !== session.voiceB) throw new Error('unexpected session voice ' + voiceX);
        const voiceB = voiceX === session.voiceA ? session.voiceB : session.voiceA;
        row.checks.baseline.voice = voiceX;

        session.hold.armed = true;
        row.pickKey = pressKey(rw, '.', 'Period', 190, true);
        const pending = await waitFor(async () => {
          const t = await vs();
          return t.tab?.handoff && t.tab.handoff.pending === voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
        }, 3500, 80);
        if (!pending) throw new Error('switch to B never reported pending/preparing');
        row.checks.pendingAtPause = { pending: pending.pending, stage: pending.stage, prepared: pending.prepared };

        const preKey = await eng();
        const posAtKey = preKey.tab.session.position;
        const landing = Math.max(0, posAtKey - 1);
        row.checks.posAtKey = posAtKey;
        row.checks.expectedLanding = landing;
        row.skipKey = pressKey(rw, 'ArrowLeft', 'ArrowLeft', 37, false);
        await sleep(140);
        const immEng = await eng();
        const immVs = await vs();
        const s = immEng.tab.session;
        const h = immVs.tab.handoff;
        const requestsAfterKey = s.store ? s.store.requests : null;
        row.checks.immediate = {
          voice: s.voice, handoff: s.handoff, playing: s.playing, skipPending: s.skipPending, paused: s.paused,
          carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
          selected: immVs.tab.selected, last: h?.last ?? null, notice: h?.notice ?? null,
          requestsAfterKey, prepared: h?.prepared ?? null,
        };
        const imm = row.checks.immediate;
        row.checks.immediateOK = imm.voice === voiceB && imm.handoff === null && imm.playing === false
          && imm.paused === true && imm.selected === voiceB && imm.notice === 'selected'
          && imm.carriedOn === carriedBefore + 1 && imm.started === startedBefore
          && imm.last?.kind === 'skip' && imm.last?.from === voiceX && imm.last?.to === voiceB;
        // The debounced speak must not request anything while paused.
        await sleep(1100);
        const quiet = await eng();
        row.checks.requestsAfterDebounce = quiet.tab.session.store ? quiet.tab.session.store.requests : null;
        row.checks.noRequestWhilePaused = row.checks.requestsAfterDebounce === requestsAfterKey;

        session.hold.armed = false;
        const requestsBeforePlay = row.checks.requestsAfterDebounce;
        try { rw.document.notifyUserGestureActivation(); } catch (_) {}
        try { m.play(); } catch (e) { row.errors.push('play: ' + String(e)); }
        const played = await waitFor(async () => {
          const t = await eng();
          const ss = t.tab.session;
          return ss.playing === true && ss.voice === voiceB && ss.position === landing ? { ss } : null;
        }, 12000, 100);
        if (!played) throw new Error('Play never read the skipped-to sentence in the new voice');
        row.checks.atPlay = {
          position: played.ss.position, currentIndex: played.ss.currentIndex,
          requestsAtPlay: played.ss.store.requests, requestsBeforePlay,
          playbackTime: played.ss.playbackTime,
        };
        row.checks.newRequestOnPlay = played.ss.store.requests >= requestsBeforePlay + 1;
        row.checks.startedNearOffset0 = (played.ss.playbackTime ?? 99) < 1.0;
        try { if (m.active && !m.paused) m.pause(); } catch (_) {}
        if (variant === 'lands-on-paused-in') {
          // Reported only: whether the paused-in sentence had been prepared (it
          // need not be; the case requires no request BEFORE Play and offset 0).
          row.checks.playUsesPreparedClip = played.ss.store.requests === requestsBeforePlay;
          row.checks.ok = row.checks.immediateOK && row.checks.noRequestWhilePaused && row.checks.startedNearOffset0;
        } else {
          row.checks.ok = row.checks.immediateOK && row.checks.noRequestWhilePaused && row.checks.newRequestOnPlay && row.checks.startedNearOffset0;
        }
        row.status = row.checks.ok ? 'PASS' : 'FAIL';
      } catch (e) {
        row.errors.push(String(e));
        try { session.hold.armed = false; } catch (_) {}
      }
    }
    out.status = Object.values(out.variants).every(r => r.status === 'PASS') ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
    try { session.hold.armed = false; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
