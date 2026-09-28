(async () => {
  // Issue #154 core case: a trusted Shift+. while B's audio request is held, then
  // trusted ArrowLeft: the skip must commit the switch at once (last.kind "skip").
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

  const out = { status: 'FAIL', errors: [], checks: {}, trace: [], voiceSamples: [] };
  let hold = null;
  try {
    restoreHost();
    const fresh = await resetSession();
    const reader = fresh.reader;
    const m = fresh.manager;
    const rw = reader._iframeWindow;
    try { reader.focus?.(); } catch (_) {}
    try { rw.focus?.(); } catch (_) {}
    hold = installHold();
    out.starting = { voiceA: session.voiceA, voiceB: session.voiceB };

    // Playing, past the first sentence.
    const reached = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true && t.tab.session.position >= 1 ? t.tab.session.position : false;
    }, 30000, 200);
    out.checks.reachedPosition = reached || null;
    if (!reached) throw new Error('session never reached position >= 1 while playing');

    // Baseline before the pick.
    const before = await eng();
    const carriedBefore = before.tab.stats.carriedOn;
    const startedBefore = before.tab.stats.started;
    out.checks.baseline = { carriedOn: carriedBefore, started: startedBefore, position: before.tab.session.position, voice: before.tab.session.voice };

    // Hold new requests, pick B with trusted Shift+.
    session.hold.armed = true;
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === session.voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
    }, 3500, 80);
    if (!pending) throw new Error('switch to B never reported pending/preparing');
    out.trace.push({ at: 'pick', pending: pending.pending, stage: pending.stage, prepared: pending.prepared, notice: pending.notice ?? null });

    // Skip back with trusted ArrowLeft while the target request is still held.
    const preKey = await eng();
    const posAtKey = preKey.tab.session.position;
    const landing = Math.max(0, posAtKey - 1);
    const keyAt = Date.now();
    out.skipKey = pressKey(rw, 'ArrowLeft', 'ArrowLeft', 37, false);
    out.checks.posAtKey = posAtKey;
    out.checks.expectedLanding = landing;

    await sleep(140);
    const immEng = await eng();
    const immVs = await vs();
    const s = immEng.tab.session;
    const h = immVs.tab.handoff;
    session.hold.armed = false;
    const voiceWatch = setInterval(() => {
      eng().then(t => { if (t.tab?.session) out.voiceSamples.push({ at: Date.now() - keyAt, voice: t.tab.session.voice, playing: t.tab.session.playing }); }).catch(() => {});
    }, 300);

    const imm = {
      voice: s.voice, handoff: s.handoff, playing: s.playing, skipPending: s.skipPending,
      paused: s.paused, position: s.position, store: s.store ? { requests: s.store.requests, inflight: s.store.inflight, clips: s.store.clips } : null,
      carriedOn: immEng.tab.stats.carriedOn, started: immEng.tab.stats.started,
      selected: immVs.tab.selected, last: h?.last ?? null, stage: h?.stage ?? null, pendingNow: h?.pending ?? null, notice: h?.notice ?? null,
    };
    out.checks.immediate = imm;
    const c = out.checks;
    c.immediateOK = imm.voice === session.voiceB && imm.handoff === null && imm.playing === false && imm.skipPending === true
      && imm.carriedOn === carriedBefore + 1 && imm.started === startedBefore
      && imm.selected === session.voiceB && imm.last?.kind === 'skip' && imm.last?.from === session.voiceA && imm.last?.to === session.voiceB;

    // After the 600 ms debounce the new voice asks for the previous sentence and reads it.
    const startedPlaying = await waitFor(async () => {
      const t = await eng();
      const ss = t.tab.session;
      return ss.playing === true && ss.voice === session.voiceB && ss.position === landing ? ss : null;
    }, 6000, 100);
    if (!startedPlaying) throw new Error('new voice never played the skipped-to sentence');
    out.checks.atPlay = { requests: startedPlaying.store.requests, position: startedPlaying.position, currentIndex: startedPlaying.currentIndex, playbackTime: startedPlaying.playbackTime };

    const selected = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff?.notice === 'selected' ? t.tab.handoff : null;
    }, 20000, 150);
    out.checks.notice = selected ? 'selected' : ((await vs()).tab?.handoff?.notice ?? null);

    // The held response lands late and must never play: voice stays B, position stays.
    await waitFor(async () => { const t = await eng(); return t.tab?.session?.store?.inflight === 0; }, 8000, 200);
    await sleep(600);
    const fin = await eng();
    const finVs = await vs();
    clearInterval(voiceWatch);
    out.checks.final = {
      voice: fin.tab.session.voice, position: fin.tab.session.position, playing: fin.tab.session.playing,
      requests: fin.tab.session.store.requests, inflight: fin.tab.session.store.inflight, clips: fin.tab.session.store.clips,
      carriedOn: fin.tab.stats.carriedOn, started: fin.tab.stats.started,
      last: finVs.tab.handoff?.last ?? null, notice: finVs.tab.handoff?.notice ?? null, stage: finVs.tab.handoff?.stage ?? null,
    };
    const voicesAfterKey = [...new Set(out.voiceSamples.map(row => row.voice))];
    out.checks.voicesAfterKey = voicesAfterKey;
    out.checks.oldVoiceNeverPlayedTarget = voicesAfterKey.length === 1 && voicesAfterKey[0] === session.voiceB;
    try { if (m.active && !m.paused) m.pause(); } catch (_) {}
    out.status = c.immediateOK && c.oldVoiceNeverPlayedTarget && c.notice === 'selected' ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
    try { session.hold.armed = false; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
