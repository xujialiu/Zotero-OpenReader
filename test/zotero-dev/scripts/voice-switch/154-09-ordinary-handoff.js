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

  // Issue #154 control: no skip — the ordinary playing switch still hands over
  // through the Handoff (last.kind word or sentence, carriedOn +1, started flat).
  // Control: an ordinary playing switch with no skip still hands over through the
  // Handoff at a word or sentence boundary (carriedOn +1, started unchanged).
  const out = { status: 'FAIL', errors: [], checks: {} };
  try {
    restoreHost();
    const fresh = await resetSession();
    const reader = fresh.reader;
    const m = fresh.manager;
    const rw = reader._iframeWindow;
    const reached = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true && t.tab.session.position >= 1 ? t.tab.session.position : false;
    }, 30000, 200);
    out.checks.reachedPosition = reached || null;
    if (!reached) throw new Error('session never reached position >= 1 while playing');
    const before = await eng();
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    out.checks.baseline = { carriedOn: carriedBefore, started: startedBefore, position: before.tab.session.position, voice: before.tab.session.voice };
    const voiceX = before.tab.session.voice;
    if (voiceX !== session.voiceA && voiceX !== session.voiceB) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === session.voiceA ? session.voiceB : session.voiceA;
    

    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB ? t.tab.handoff : null;
    }, 3500, 80);
    out.checks.pendingSeen = pending ? { pending: pending.pending, stage: pending.stage } : null;

    const committed = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      return h && h.stage === 'committed' && h.last && (h.last.kind === 'word' || h.last.kind === 'sentence') ? h : null;
    }, 45000, 150);
    const mid = await eng();
    out.checks.commit = committed ? {
      last: committed.last, stage: committed.stage, wordDecision: committed.wordDecision,
      audioReady: committed.audioReady?.length ?? 0,
      voiceNow: mid.tab.session.voice, playingNow: mid.tab.session.playing,
      positionNow: mid.tab.session.position, currentIndexNow: mid.tab.session.currentIndex,
      carriedOn: mid.tab.stats.carriedOn, started: mid.tab.stats.started,
      prepared: committed.prepared ?? null,
    } : null;
    if (!committed) throw new Error('handoff never committed (no word/sentence boundary within 45 s)');
    const c = out.checks.commit;
    out.checks.commitOK = c.voiceNow === voiceB && c.carriedOn === carriedBefore + 1 && c.started === startedBefore;
    const selected = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff?.notice === 'selected' ? t.tab.handoff : null;
    }, 25000, 150);
    out.checks.notice = selected ? 'selected' : ((await vs()).tab?.handoff?.notice ?? null);
    await waitFor(async () => { const t = await eng(); return t.tab?.session?.store?.inflight === 0; }, 10000, 200);
    try { if (m.active && !m.paused) m.pause(); } catch (_) {}
    out.status = out.checks.commitOK && out.checks.notice === 'selected' ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  } finally {
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
