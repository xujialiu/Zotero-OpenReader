(async () => {
  // Issue #226, item 17 pick: fresh fixture, read with the seed voice, and half a
  // second into a sentence pick the other favorite with a trusted Shift+. while
  // polling voiceSwitch() + engine() every 25 ms until the reading is three
  // sentences past the takeover. SPEC below is the only per-pick difference.
  // Reads params.fixture226.<key> and state from Zotero.__ztts226 (voices A/B).
  const SPEC = { key: 'p1a', readVoice: 'A' /* 'A' row reads first */, pickVoice: 'B', expectAtOnce: 2, label: 'pass1-atonce2-pick1-A2B', pin: 2, pollMs: 25, timeoutMs: 180000 };
  const S = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL', label: SPEC.label, spec: { ...SPEC, key: SPEC.key }, steps: {}, checks: {}, trace: [], errors: [] };
  const step = (name, fn) => { try { out.steps[name] = fn(); } catch (e) { out.errors.push(name + ': ' + String(e)); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, timeout = 20000, stepMs = 120) => {
    const end = Date.now() + timeout;
    while ( Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(stepMs);
    }
    return test();
  };
  const base = Zotero.__ztts226;
  if (!base?.voiceA || !base?.voiceB) throw new Error('the seed script has not run (no voice pair in state)');
  const voiceA = base.voiceA, voiceB = base.voiceB;
  if (voiceA === voiceB) throw new Error('the favorite pair collapsed to one voice');
  const readVoiceId = SPEC.readVoice === 'A' ? voiceA : voiceB;
  const pickVoiceId = SPEC.readVoice === 'A' ? voiceB : voiceA;
  const fixtureFile = Zotero.ZoteroTTSRun.params.fixture226?.[SPEC.key];
  if (!fixtureFile) throw new Error(`params.fixture226.${SPEC.key} is missing`);

  // Reader of the CURRENT fixture item, re-read every time (a swap invalidates captures).
  const readerOf = () => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === base.fixtureItemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const tabOf = async () => {
    const all = JSON.parse(await S.engine());
    return { all, tab: all.readers.find(r => Number(r.itemID) === Number(base.fixtureItemID)) ?? null };
  };
  const vsOf = async () => {
    const all = JSON.parse(await S.voiceSwitch());
    const readers = Zotero.Reader?._readers || [];
    let index = -1;
    for (let i = 0; i < readers.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(readers[i]) && readers[i]?.itemID === base.fixtureItemID) { index = i; break; } } catch (_) {}
    }
    return { all, index, tab: index >= 0 ? (all.readers[index] ?? null) : null };
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

  // ---- 1. Swap in this pick's fresh fixture (unique prose: no cache answers).
  try {
    const main = Zotero.getMainWindow();
    for (const row of (base.fixtures || [])) {
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
    await waitFor(() => !(Zotero.Reader?._readers || []).some(r => (base.fixtures || []).some(row => row.itemID === r?.itemID)), 8000, 100);
    const imported = await Zotero.Attachments.importFromFile({ file: fixtureFile, libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS 226 ${SPEC.key} ${Date.now()}` });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    base.fixtures = [{ itemID: item.id, key: item.key, file: fixtureFile }];
    base.fixtureItemID = item.id;
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    const reader = await waitFor(() => {
      const r = readerOf();
      return r?._internalReader?._readAloudManager ? r : null;
    }, 24000, 200);
    if (!reader) throw new Error('fresh fixture reader did not initialize');
    if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    reader.focus?.();
    await sleep(400);
    out.steps.fixture = { itemID: item.id };
    // Popup open (plays at once on the memory voice A); pause in the same script.
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    internal.toggleReadAloudPopup(true);
    await waitFor(() => { try { return !!manager.active; } catch (_) { return false; } }, 12000, 120);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
    await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000, 100);
    // Seed the reading voice when the memory voice is not it (paused, native).
    const selectedNow = String(manager.selectedVoiceID ?? '');
    if (selectedNow !== readVoiceId) {
      try { manager.selectVoice(readVoiceId); } catch (e) { out.errors.push('seed selectVoice: ' + String(e)); }
      await waitFor(() => { try { return String(manager.selectedVoiceID ?? '') === readVoiceId; } catch (_) { return false; } }, 12000, 150);
    }
    out.steps.seed = { selected: manager.selectedVoiceID ?? null, want: readVoiceId };
  } catch (e) { out.errors.push('fixture/seed: ' + String(e)); return JSON.stringify(out, null, 1); }

  // ---- 2. Play, land on the pin sentence, pick half a second in.
  let pickAt = null;
  try {
    const reader = readerOf();
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    const rw = reader._iframeWindow;
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { out.errors.push('play: ' + String(e)); }
    const playing = await waitFor(async () => (await tabOf())?.tab?.session?.playing === true, 30000, 250);
    if (!playing) throw new Error('the session never started playing');
    try { manager.repositionTo(SPEC.pin); } catch (e) { out.errors.push('reposition: ' + String(e)); }
    // The pin sentence's clip starts when position flips to the pin: that moment is t0.
    let t0 = null;
    const endAt = Date.now() + 30000;
    while (Date.now() < endAt && t0 === null) {
      const t = await tabOf();
      if (t?.tab?.session?.playing === true && Number(t?.tab?.session?.position) === SPEC.pin) t0 = Date.now();
      else await sleep(25);
    }
    if (t0 === null) throw new Error('the reading never reached the pin sentence');
    out.steps.pin = { at: t0, position: SPEC.pin };
    const waitTo = t0 + 500 - Date.now();
    if (waitTo > 0) await sleep(waitTo);

    // ---- 3. The pick, then 25 ms polling until three sentences past the takeover.
    pickAt = Date.now();
    out.checks.pickKey = pressKey(rw, '.', 'Period', 190, true);
    let sigPrev = null;
    let readySeen = 0;
    let pendingAt = null;
    let lastInfo = null;
    let shownAtLast = null;
    let voiceAtLast = null;
    let clipAfterCommit = null;
    let endReason = null;
    let preparedAtLast = null;
    let noticeAtLast = null;
    let lastSetAt = null;
    let slowestMax = 0, atOnceMax = 0, oldRequestsMax = 0, openMaxPost = 0, fromMinPost = null;
    let shownGrewAfterLast = false;
    let mechanism = null;
    const endBy = pickAt + SPEC.timeoutMs;
    while (Date.now() < endBy) {
      let vs = null, en = null;
      try { vs = await vsOf(); } catch (e) { out.errors.push('poll vs: ' + String(e)); break; }
      try { en = await tabOf(); } catch (e) { out.errors.push('poll engine: ' + String(e)); break; }
      mechanism = mechanism ?? vs.all?.mechanism ?? null;
      const h = vs.tab?.handoff ?? null;
      const s = en.tab?.session ?? null;
      if (!h || !s) { await sleep(SPEC.pollMs); continue; }
      atOnceMax = Math.max(atOnceMax, Number(h.atOnce ?? 0));
      slowestMax = Math.max(slowestMax, Number(h.slowestMs ?? 0));
      oldRequestsMax = Math.max(oldRequestsMax, Number(h.oldRequests ?? 0));
      const readyNow = (h.audioReady || []).length;
      if (h.pending && pendingAt === null) pendingAt = Date.now();
      if (readyNow > readySeen) {
        for (let i = readySeen; i < readyNow; i++) out.trace.push({ t: Date.now() - pickAt, ev: 'audioReady', entry: h.audioReady[i] });
        readySeen = readyNow;
      }
      const last = h.last ?? null;
      if (last && !lastInfo) {
        lastInfo = last;
        lastSetAt = Date.now();
        preparedAtLast = [...(h.prepared || [])];
        noticeAtLast = h.notice ?? null;
        shownAtLast = Number(s.notices?.shown ?? 0);
        voiceAtLast = s.voice ?? null;
        out.trace.push({ t: Date.now() - pickAt, ev: 'last', last: { kind: last.kind, index: last.index, offset: last.offset, charStart: last.charStart ?? null }, notice: noticeAtLast, prepared: preparedAtLast, voice: voiceAtLast, position: s.position });
      }
      if (lastInfo) {
        openMaxPost = Math.max(openMaxPost, Number(s.prefetch?.open ?? 0));
        const from = s.prefetch?.from;
        if (typeof from === 'number') fromMinPost = fromMinPost === null ? from : Math.min(fromMinPost, from);
        if (s.voice === pickVoiceId && clipAfterCommit === null) clipAfterCommit = { clipDuration: s.clipDuration ?? null, position: s.position, at: Date.now() - pickAt };
        if (Number(s.notices?.shown ?? 0) > shownAtLast) shownGrewAfterLast = true;
      }
      const sig = JSON.stringify([h.pending, h.stage, h.atOnce, h.slowestMs, (h.prepared || []).join(','), h.wordDecision, h.notice, last ? `${last.kind}:${last.index}:${last.offset}` : null, s.voice, s.position, s.notices?.shown, s.prefetch?.from, s.prefetch?.open, s.error ?? null, s.ended ?? null]);
      if (sig !== sigPrev) {
        sigPrev = sig;
        out.trace.push({ t: Date.now() - pickAt, ev: 'sig', pending: h.pending, stage: h.stage, atOnce: h.atOnce, slowestMs: h.slowestMs, prepared: h.prepared, wordDecision: h.wordDecision, notice: h.notice, last: last ? { kind: last.kind, index: last.index, offset: last.offset } : null, voice: s.voice, position: s.position, shown: s.notices?.shown, prefetch: s.prefetch ? { from: s.prefetch.from, open: s.prefetch.open } : null, error: s.error ?? null, ended: s.ended ?? null });
      }
      if (s.ended || s.error) { endReason = s.error ? 'session-error' : 'session-ended'; break; }
      if (h.stage === 'failed' || h.stage === 'cancelled') { endReason = 'stage-' + h.stage; break; }
      if (lastInfo && Number(s.position) >= Number(lastInfo.index) + 3) { endReason = 'three-past'; break; }
      await sleep(SPEC.pollMs);
    }
    out.checks.endReason = endReason ?? 'timeout';
    out.checks.timing = { pickToPendingMs: pendingAt !== null ? pendingAt - pickAt : null, pickToLastMs: lastInfo ? lastSetAt - pickAt : null };
    out.checks.mechanism = mechanism;
    out.checks.atOnceMax = atOnceMax;
    out.checks.slowestMsMax = slowestMax;
    out.checks.oldRequestsMax = oldRequestsMax;
    out.checks.readyEntries = readySeen;
    // First two audioReady entries of THIS pick (the report resets per pick).
    const vsEnd = await vsOf();
    const ready = vsEnd.tab?.handoff?.audioReady || [];
    const firstTwo = ready.slice(0, 2).map(e => e.index);
    out.checks.firstTwoReady = firstTwo;
    out.checks.last = lastInfo;
    out.checks.noticeAtLast = noticeAtLast;
    out.checks.preparedAtLast = preparedAtLast;
    out.checks.clipAfterCommit = clipAfterCommit;
    out.checks.shownGrewAfterLast = shownGrewAfterLast;
    const finalEn = await tabOf();
    out.checks.final = { position: finalEn.tab?.session?.position ?? null, voice: finalEn.tab?.session?.voice ?? null, prefetch: finalEn.tab?.session?.prefetch ?? null, shown: finalEn.tab?.session?.notices?.shown ?? null };
    out.checks.prefetchPostTakeover = { openMax: openMaxPost, fromMin: fromMinPost };
    // Verdicts
    const c = out.checks;
    c.okMechanism = mechanism === 'engine-handoff-v4';
    c.okAtOnce = atOnceMax === SPEC.expectAtOnce;
    c.okSlowest = slowestMax > 0;
    c.okFirstTwoReady = firstTwo.length === 2 && [...firstTwo].sort((a, b) => a - b).join(',') === [SPEC.pin, SPEC.pin + 1].sort((a, b) => a - b).join(',');
    c.okLast = !!lastInfo && (lastInfo.kind === 'word' || lastInfo.kind === 'sentence');
    c.okNoticeSelected = noticeAtLast === 'selected';
    let wordGate = null;
    if (lastInfo?.kind === 'word') {
      const preparedHas = (preparedAtLast || []).includes(Number(lastInfo.index) + 1);
      let clipLeftMs = null;
      if (clipAfterCommit && typeof clipAfterCommit.clipDuration === 'number' && typeof lastInfo.offset === 'number') {
        clipLeftMs = clipAfterCommit.clipDuration - lastInfo.offset;
      }
      const needMs = 1.25 * slowestMax + 250;
      wordGate = { preparedHasNext: preparedHas, clipLeftMs, needMs };
      if (preparedHas) c.okWordGate = true;
      else if (clipLeftMs === null) { c.okWordGate = false; wordGate.notMeasurable = 'session.clipDuration is null for this voice; prepared lacked index+1'; }
      else c.okWordGate = clipLeftMs >= needMs;
      c.wordGate = wordGate;
    } else if (lastInfo?.kind === 'sentence') {
      c.okWordGate = true; // sentence takeover is an accepted kind
    } else {
      c.okWordGate = false;
    }
    c.okNoPreparingUntilThreePast = lastInfo ? !shownGrewAfterLast : false;
    c.okPrefetchPastLast = lastInfo ? (typeof fromMinPost === 'number' ? fromMinPost > Number(lastInfo.index) : false) : false;
    c.okPrefetchOpenLe2 = openMaxPost <= 2;
    const oks = ['okMechanism', 'okAtOnce', 'okSlowest', 'okFirstTwoReady', 'okLast', 'okNoticeSelected', 'okWordGate', 'okNoPreparingUntilThreePast', 'okPrefetchPastLast', 'okPrefetchOpenLe2'];
    out.status = endReason === 'three-past' && oks.every(k => c[k] === true) ? 'PASS' : 'FAIL';
    if (out.status !== 'PASS' && !out.errors.length) out.errors.push('see checks; endReason ' + (endReason ?? 'timeout'));
  } catch (e) {
    out.errors.push('pick/poll: ' + String(e));
    try { const reader = readerOf(); const m = reader?._internalReader?._readAloudManager; if (m?.active && !m.paused) m.pause(); } catch (_) {}
  }
  return JSON.stringify(out, null, 1);
})()
