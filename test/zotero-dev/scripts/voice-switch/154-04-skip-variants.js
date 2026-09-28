(async () => {
  // Issue #154: the remaining skip keys — Shift+Left, Right, Shift+Right — each
  // while a switch to B is pending (held request): every skip commits at once.
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

  const out = { status: 'FAIL', errors: [], variants: {} };
  let hold = null;
  try {
    restoreHost();
    hold = installHold();
    // variants: [name, key, code, keyCode, shift, landing(position, count)]
    const plans = [
      ['shift-left', 'ArrowLeft', 'ArrowLeft', 37, true, (p, n) => Math.max(0, p - 5)],
      ['right', 'ArrowRight', 'ArrowRight', 39, false, (p, n) => Math.min(n - 1, p + 1)],
      ['shift-right', 'ArrowRight', 'ArrowRight', 39, true, (p, n) => Math.min(n - 1, p + 5)],
    ];
    for (const [name, key, code, keyCode, shift, landingOf] of plans) {
      const row = { status: 'FAIL', errors: [], checks: {} };
      out.variants[name] = row;
      try {
        const fresh = await resetSession();
        const reader = fresh.reader;
        const m = fresh.manager;
        const rw = reader._iframeWindow;
        try { reader.focus?.(); } catch (_) {}
        try { rw.focus?.(); } catch (_) {}
        const reached = await waitFor(async () => {
          const t = await eng();
          return t.tab?.session?.playing === true && t.tab.session.position >= 1 ? t.tab.session.position : false;
        }, 30000, 200);
        if (!reached) throw new Error('never reached position >= 1 while playing');
        const before = await eng();
        const carriedBefore = before.tab.stats.carriedOn;
        const startedBefore = before.tab.stats.started;
        const segs = before.all.readers.find(r2 => Number(r2.itemID) === Number(itemID));
        const count = segs?.session?.store ? null : null; // segment count via position clamp below
        row.checks.baseline = { carriedOn: carriedBefore, started: startedBefore, position: before.tab.session.position };
        const voiceX = before.tab.session.voice;
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

        const preKey = await eng();
        const posAtKey = preKey.tab.session.position;
        // Segment count from the reader's own list (engine() exposes no count).
        let n = 17;
        try {
          const rows = fresh.reader._internalReader._readAloudSegments?.segments;
          if (rows && rows.length) n = rows.length;
        } catch (_) {}
        const landing = landingOf(posAtKey, n);
        row.checks.posAtKey = posAtKey;
        row.checks.expectedLanding = landing;
        row.skipKey = pressKey(rw, key, code, keyCode, shift);
        await sleep(140);
        const immEng = await eng();
        const immVs = await vs();
        const s = immEng.tab.session;
        const h = immVs.tab.handoff;
        session.hold.armed = false;
        row.checks.immediate = {
          voice: s.voice, handoff: s.handoff, playing: s.playing, skipPending: s.skipPending,
          carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
          selected: immVs.tab.selected, last: h?.last ?? null, notice: h?.notice ?? null,
          requests: s.store ? s.store.requests : null,
        };
        const imm = row.checks.immediate;
        row.checks.immediateOK = imm.voice === voiceB && imm.handoff === null && imm.playing === false && imm.skipPending === true
          && imm.carriedOn === carriedBefore + 1 && imm.started === startedBefore
          && imm.selected === voiceB && imm.last?.kind === 'skip' && imm.last?.from === voiceX && imm.last?.to === voiceB;
        const startedPlaying = await waitFor(async () => {
          const t = await eng();
          const ss = t.tab.session;
          return ss.playing === true && ss.voice === voiceB && ss.position === landing ? ss : null;
        }, 8000, 100);
        if (!startedPlaying) throw new Error('new voice never played the skipped-to sentence');
        row.checks.atPlay = { position: startedPlaying.position, currentIndex: startedPlaying.currentIndex, requests: startedPlaying.store.requests };
        const selected = await waitFor(async () => {
          const t = await vs();
          return t.tab?.handoff?.notice === 'selected' ? t.tab.handoff : null;
        }, 20000, 150);
        row.checks.notice = selected ? 'selected' : ((await vs()).tab?.handoff?.notice ?? null);
        await waitFor(async () => { const t = await eng(); return t.tab?.session?.store?.inflight === 0; }, 8000, 200);
        try { if (m.active && !m.paused) m.pause(); } catch (_) {}
        row.status = row.checks.immediateOK && row.checks.notice === 'selected' ? 'PASS' : 'FAIL';
      } catch (e) {
        row.errors.push(String(e));
        try { session.hold.armed = false; } catch (_) {}
      }
    }
    out.status = Object.values(out.variants).every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
    try { session.hold.armed = false; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
