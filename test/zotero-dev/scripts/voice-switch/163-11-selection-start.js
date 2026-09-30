(async () => {
  // Issue #163, item 14 row "A jump", FIRST path (beta7): start from a selection.
  // Session open and reading A; pause (trusted Shift+Space); pick B with trusted
  // Shift+. while B's audio is held; select text in a later paragraph; trusted
  // Shift+Space again. Zotero unpauses INTO a restart from the selection
  // (reader.js 83880-83885: clearSegments + _requestReadAloudSegments; 84048-84073:
  // setSegments(segments, selectionIndex, null) a microtask later): the session
  // ends (stats.ended +1) and starts at the selection (stats.started +1). beta7
  // (session.ts `park`) keeps the pending switch over the teardown and the rebuild
  // of the same sentences takes it back as a jump (bind -> keptSwitch + moved()).
  // Variant 'dry' (default): the selection is a sentence A has NOT read (past the
  // read-ahead) -> stage waiting, waitedAt = the selection, no A request; released,
  // B reads it from offset 0 (last.kind sentence, notice selected, oldRequests 0).
  // Variant 'warm': the selection is inside A's stock -> A reads it from 0, the
  // switch stays pending, B takes over within it or later.
  // The selection is driven as real input in the view: a synthesized double-click
  // on the sentence's marker digits (the only digits in the fixture text), i.e.
  // Zotero's own word-selection path populates _selectionRanges; the plugin's
  // smartKey diagnostic proves the target is registered before the key is pressed.
  const session = Zotero.__ztts163;
  if (!session) throw new Error('163 session state is missing');
  const S = Zotero.ZoteroTTS.diagnostics;
  const variant = Zotero.ZoteroTTSRun.params.selection163Variant === 'warm' ? 'warm' : 'dry';
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
      // Released before this request fired: pass through at once (the delay is
      // only the pick's keep-busy hold; in-flight requests still honor a mode
      // flip, their timer was armed while `armed` was true).
      if (!session.hold.armed) return result;
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

  const out = { status: 'FAIL', variant, errors: [], checks: {}, trace: [] };
  let hold = null;
  try {
    restoreHost();
    const swapped = await swapFixture(Zotero.ZoteroTTSRun.params.fixture163);
    const reader = swapped.reader;
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    const rw = reader._iframeWindow;
    const win = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
    out.checks.freshFixture = { itemID: session.fixtureItemID, segments: swapped.segmentCount, hostRestored: !!win && win.windowState !== 2 };

    // Seed: play on the old voice (voice fixed to a local one if the native map
    // won), one reposition for runway, then let the read-ahead stock while A reads.
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
    const PIN = Math.min(5, Math.max(3, swapped.segmentCount - 20));
    try { manager.repositionTo(PIN); await sleep(900); } catch (_) {}
    const at = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 15000, 300);
    if (at === null) throw new Error('session not playing after reposition');
    // A reads on, but BRIEFLY: the reposition also restarts the prefetch chain's
    // base, so the stock at the pick stays near PIN+2..4 ('warm' just needs the
    // target inside it; 'dry' needs the target past the chain head, which the
    // pause+pick stretch otherwise lets run to PIN+8).
    await sleep(variant === 'warm' ? 4500 : 1200);
    const atPause = ((await eng()).tab?.session?.position) ?? at;
    out.checks.seeded = { position: atPause, playing: true, voice: (await eng()).tab.session.voice };

    // ---- Pause with trusted Shift+Space (smartPlay -> togglePaused) ----
    out.pauseKey = pressKey(rw, ' ', 'Space', 32, true);
    const pausedOK = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.paused === true || (t.tab?.session?.playing === false && manager.active) ? t.tab.session.position : null;
    }, 8000, 150);
    if (!manager.active || manager.paused !== true) {
      const t = await eng();
      if (!(t.tab?.session?.paused === true || t.tab?.session?.playing === false)) throw new Error('trusted Shift+Space did not pause the session');
    }
    const posAtPause = pausedOK ?? ((await eng()).tab?.session?.position ?? atPause);
    out.checks.paused = { active: !!manager.active, paused: !!manager.paused, position: posAtPause };

    // ---- Pick B with trusted Shift+. while B's audio is held ----
    const before = await eng();
    const voiceX = before.tab.session.voice;
    if (!String(voiceX || '').startsWith('local::af_')) throw new Error('unexpected session voice ' + voiceX);
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    const stats0 = before.tab.stats;
    const requests0 = before.tab.session.store?.requests ?? null;
    const lookups0 = before.tab.session.store?.lookups ?? null;
    session.hold = { armed: true, ms: 22000, mode: 'hold', voice: voiceB };
    session.holdVoice = voiceB;
    hold = installHold();
    const pickAt = Date.now();
    out.pickKey = pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB ? t.tab.handoff : null;
    }, 6000, 80);
    if (!pending) throw new Error('switch to B never reported pending');
    out.checks.atPick = { pending: pending.pending, stage: pending.stage, oldRequests: pending.oldRequests ?? null, position: posAtPause, requests: requests0 };
    out.trace.push({ at: 'pick', pending: pending.pending, stage: pending.stage });

    // ---- Target sentence: dry = past the stock, warm = inside it ----
    const segRows = Components.utils.waiveXrays(internal._readAloudSegments?.segments || manager._segments || []);
    const segCount = segRows.length;
    const dryTarget = Math.min(posAtPause + 9, segCount - 2);
    const warmTarget = Math.min(posAtPause + 2, segCount - 2);
    const targetIndex = variant === 'warm' ? warmTarget : dryTarget;
    const segText = String(Components.utils.waiveXrays(segRows[targetIndex])?.text ?? '');
    const markerMatch = segText.match(/marked\s+(yek[a-z]+)\s+(\d+)/i);
    const markerTag = markerMatch ? markerMatch[1] : null;
    const markerNum = markerMatch ? Number(markerMatch[2]) : null;
    if (!markerTag || markerNum === null) throw new Error('target sentence carries no marker: ' + segText.slice(0, 80));
    out.checks.target = {
      variant, targetIndex, marker: `marked ${markerTag} ${markerNum}`,
      text: segText.slice(0, 70),
      segmentsNow: segCount, stock: { positionAtPause: posAtPause, prefetch: 8 },
    };

    // ---- Drive the real selection in the view: double-click the marker digits ----
    // The PDF text layer, viewerContainer and pointer handlers live in the primary
    // VIEW's own iframe window (reader.js 75477-75479), not the reader shell —
    // the gesture is dispatched there, at the span's viewport coords, as pointer
    // + mouse pairs ("mousedown event is necessary to get event.detail").
    const viewWin = Components.utils.waiveXrays(internal._primaryView)?._iframeWindow ?? rw;
    const scrollToSegment = async () => {
      const view = internal._primaryView;
      const src = Components.utils.waiveXrays(segRows[targetIndex])?.sourcePosition ?? null;
      if (view && src) {
        try {
          const posClone = Components.utils.cloneInto(JSON.parse(JSON.stringify({ pageIndex: src.pageIndex, rects: src.rects })), rw);
          const optClone = Components.utils.cloneInto({ ifNeeded: true, block: 'center', inline: 'nearest', behavior: 'instant' }, rw);
          Components.utils.waiveXrays(view).navigateToPosition(posClone, optClone);
          await sleep(700);
          return 'navigateToPosition';
        } catch (e) { out.errors.push('navigateToPosition: ' + String(e)); }
      }
      const container = Components.utils.waiveXrays(viewWin.document.getElementById('viewerContainer'));
      if (container) { container.scrollTop = Math.max(0, (Number(src?.pageIndex) || 0)) * (container.clientHeight || 700) * 0.95; await sleep(700); return 'scrollTop'; }
      return 'none';
    };
    const scrolled = await scrollToSegment();
    // Marker digits are the only digits in the fixture text, and the marker clause
    // is part of the target sentence, so any span carrying `yekx N` / `N.` is safe
    // to click: every selected char belongs to the target sentence. Polls while
    // the page renders (the host must be restored for PDF.js to paint).
    const findMarkerPoint = () => {
      const spans = viewWin.document.querySelectorAll('.textLayer span');
      const innerH = viewWin.innerHeight || 800;
      const needles = [`${markerTag} ${markerNum}`, `${markerNum}.`, `${markerNum}`, markerTag];
      // Needle priority is GLOBAL (pass per needle), not per span: the marker's
      // line wrap can put `yekx` in one span and `N.` in the next.
      for (const needle of needles) {
        for (let i = 0; i < spans.length; i++) {
          const span = Components.utils.waiveXrays(spans[i]);
          let t = '';
          try { t = String(span.textContent ?? ''); } catch (_) { continue; }
          if (t.trim().length < 2) continue;
          const idx = t.indexOf(needle);
          if (idx < 0) continue;
          const rect = span.getBoundingClientRect();
          // The bottom band is the Read Aloud popup's overlay; keep clear of it.
          if (!(rect.bottom > 40 && rect.top < innerH - 150 && rect.width > 4)) continue;
          const frac = (idx + Math.max(1, needle.length / 2)) / Math.max(1, t.length);
          const x = rect.left + rect.width * frac;
          const y = rect.top + rect.height / 2;
          return { x, y, needle, frac, spanText: t.slice(0, 60) };
        }
      }
      return null;
    };
    const findMarkerPointWait = async () => {
      const end = Date.now() + 6000;
      let point = findMarkerPoint();
      while (!point && Date.now() < end) {
        await sleep(300);
        point = findMarkerPoint();
      }
      return point;
    };
    const clearSelection = () => {
      try { Components.utils.waiveXrays(viewWin.getSelection()).removeAllRanges(); } catch (_) {}
      try { Components.utils.waiveXrays(internal._primaryView)._setSelectionRanges(); } catch (_) {}
    };
    const mouse = (type, x, y, detail) => {
      const up = type === 'up';
      const target = Components.utils.waiveXrays(viewWin.document.elementFromPoint(x, y)) || Components.utils.waiveXrays(viewWin.document.documentElement);
      // Event-init objects must live in the view realm: a chrome-built literal
      // reads as empty across the compartment (clientX undefined).
      const mOpts = Components.utils.cloneInto({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: up ? 0 : 1, detail: detail || 1 }, viewWin);
      // Desktop selection is driven by the MOUSEDOWN listener alone (reader.js
      // 75479, "mousedown event is necessary to get event.detail"); a synthetic
      // pointerdown trips other window-level handlers that clear the selection.
      // Only the drag's extension needs pointermove (the view's move listener).
      if (type === 'down') {
        target.dispatchEvent(new viewWin.MouseEvent('mousedown', mOpts));
      } else if (type === 'move') {
        const pOpts = Components.utils.cloneInto({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' }, viewWin);
        target.dispatchEvent(new viewWin.PointerEvent('pointermove', pOpts));
        target.dispatchEvent(new viewWin.MouseEvent('mousemove', mOpts));
      } else if (type === 'up') {
        target.dispatchEvent(new viewWin.MouseEvent('mouseup', mOpts));
        target.dispatchEvent(new viewWin.MouseEvent('click', mOpts));
      } else if (type === 'pointerupOnly') {
        // The gesture completer: fires _handlePointerUp (a pointerup listener),
        // which keeps the selection and raises the selection popup (the state the
        // InternalReader's own getSelectionPosition and smartKey read).
        const pOpts = Components.utils.cloneInto({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' }, viewWin);
        target.dispatchEvent(new viewWin.PointerEvent('pointerup', pOpts));
      }
    };
    // The VIEW holds the selection in _selectionRanges (view.getSelectionPosition);
    // the InternalReader's own getter reads the selection-POPUP state instead.
    const selectionRegistered = async () => {
      try { return !!Components.utils.waiveXrays(internal._primaryView).getSelectionPosition?.(); } catch (_) { return false; }
    };
    clearSelection();
    let point = await findMarkerPointWait();
    if (!point) { await scrollToSegment(); point = await findMarkerPointWait(); }
    if (!point) throw new Error('no text-layer span carries the target marker (pages not rendered or marker not found)');
    out.checks.markerPoint = { x: Math.round(point.x), y: Math.round(point.y), needle: point.needle, spanText: point.spanText, scrolled };
    let attempt = null;
    // Attempt 1: a double-click on the marker word (the view's word selection, detail 2).
    mouse('down', point.x, point.y, 2);
    mouse('up', point.x, point.y, 2);
    let registered = await waitFor(selectionRegistered, 1800, 120);
    if (registered) {
      mouse('pointerupOnly', point.x, point.y, 2);
      await waitFor(selectionRegistered, 1500, 100);
      attempt = 'double-click (mouse-only, iframe dispatch)';
    }
    // Attempt 2: a small drag across the marker text (the chars mode extension).
    if (!registered) {
      clearSelection();
      mouse('down', point.x - 14, point.y, 1);
      for (const dx of [-8, -2, 4, 10]) { mouse('move', point.x + dx, point.y, 1); await sleep(60); }
      mouse('up', point.x + 14, point.y, 1);
      registered = await waitFor(selectionRegistered, 1800, 120);
      if (registered) {
        mouse('pointerupOnly', point.x + 14, point.y, 1);
        await waitFor(selectionRegistered, 1500, 100);
        attempt = 'drag (mouse press + pointermove, iframe dispatch)';
      }
    }
    out.checks.selection = { registered: !!registered, attempt, position: registered ? (() => { try { const p = Components.utils.waiveXrays(internal._primaryView).getSelectionPosition(); return { pageIndex: p?.pageIndex ?? null, rects: (p?.rects?.length ?? null) }; } catch (_) { return null; } })() : null,
      popupState: (() => { try { return !!Components.utils.waiveXrays(internal).getSelectionPosition?.(); } catch (_) { return false; } })() };
    if (!registered) {
      out.checks.notTestableReason = 'the selection target could not be registered in the view (double-click and drag both left _selectionRanges empty)';
      out.status = 'NOT TESTABLE';
      try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
      session.hold.armed = false; session.hold.mode = 'pass';
      if (hold) hold.restore();
      await minimizeHost();
      return JSON.stringify(out, null, 1);
    }
    // The plugin's own view of the key: hasSelection true, wouldDo names the restart.
    const smartKey = JSON.parse(await S.smartKey());
    const skRow = (smartKey.readers || []).find(row => Number(row.itemID) === Number(session.fixtureItemID)) || null;
    out.checks.smartKeyBefore = skRow;
    if (!skRow?.hasSelection || !/restarts/.test(String(skRow.wouldDo ?? ''))) {
      out.checks.notTestableReason = 'plugin smartKey does not see the selection: ' + JSON.stringify(skRow);
      out.status = 'NOT TESTABLE';
      try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
      session.hold.armed = false; session.hold.mode = 'pass';
      if (hold) hold.restore();
      await minimizeHost();
      return JSON.stringify(out, null, 1);
    }
    // Scroll back to the top: the visible-block fallback can no longer explain a
    // start at the marker sentence, and savedPosition points at page one.
    try {
      const container = Components.utils.waiveXrays(viewWin.document.getElementById('viewerContainer'));
      if (container) container.scrollTop = 0;
    } catch (_) {}
    await sleep(600);
    const skAfterScroll = JSON.parse(await S.smartKey());
    const skRow2 = (skAfterScroll.readers || []).find(row => Number(row.itemID) === Number(session.fixtureItemID)) || null;
    out.checks.smartKeyAfterScroll = { hasSelection: skRow2?.hasSelection ?? null, wouldDo: skRow2?.wouldDo ?? null };
    if (!skRow2?.hasSelection) throw new Error('the scroll back cleared the selection target');

    // ---- Trusted Shift+Space: the unpause that restarts from the selection ----
    const keyAt = Date.now();
    out.playKey = pressKey(rw, ' ', 'Space', 32, true);
    let cancelledSeen = null; let settle = null;
    for (let i = 0; i < 60 && !settle; i++) {
      await sleep(200);
      const t = await eng();
      const w = await vs();
      const h = w.tab?.handoff ?? null;
      const ss = t.tab?.session ?? null;
      const row = {
        ms: Date.now() - keyAt, pending: h?.pending ?? null, stage: h?.stage ?? null, notice: h?.notice ?? null,
        waitedAt: h?.waitedAt ?? null, position: ss?.position ?? null, voice: ss?.voice ?? null, playing: ss?.playing ?? null,
        paused: ss?.paused ?? null, ended: ss?.ended ?? null,
        endedDelta: (t.tab?.stats?.ended ?? 0) - stats0.ended,
        startedDelta: (t.tab?.stats?.started ?? 0) - stats0.started,
        carriedDelta: (t.tab?.stats?.carriedOn ?? 0) - stats0.carriedOn,
        requests: ss?.store?.requests ?? null, lookups: ss?.store?.lookups ?? null,
      };
      if (row.notice === 'cancelled' && !cancelledSeen) cancelledSeen = row;
      if (i % 3 === 0 || cancelledSeen) out.trace.push(row);
      const markerLanded = row.position !== null && row.position >= 0
        && String(Components.utils.waiveXrays(internal._readAloudSegments?.segments || [])[row.position]?.text ?? '').includes(`${markerNum}.`);
      // A stocked the landing after all: the reading plays past the target without
      // waiting — break early with a clear stock-collision marker.
      if (variant === 'dry' && row.playing === true && row.position !== null && row.position > targetIndex && !settle) {
        settle = { at: row.ms, kind: 'stock-collision' };
        out.trace.push(row);
        break;
      }
      if (variant === 'dry') {
        if (h?.stage === 'waiting' && row.position === h.waitedAt) {
          if (settle === undefined || settle === null) settle = { at: row.ms, kind: 'waiting' };
        }
        if (h?.last && h.last.kind) settle = settle || { at: row.ms, kind: 'commit-early' };
      } else {
        if (row.playing === true && row.voice === voiceX && markerLanded) {
          if (!settle) settle = { at: row.ms, kind: 'old-voice-at-selection' };
        }
        if (h?.last && h.last.kind) settle = settle || { at: row.ms, kind: 'commit-early' };
      }
      if (cancelledSeen && i > 6) break;
      if (i === 59) break;
    }
    if (!settle && !cancelledSeen) {
      const finalState = { eng: (await eng()).tab?.session ?? null, vs: (await vs()).tab?.handoff ?? null };
      out.checks.noSettle = finalState;
      throw new Error('the restart never settled at the selection: ' + JSON.stringify(finalState).slice(0, 300));
    }
    const settledEng = await eng();
    const settledVs = await vs();
    const settledH = settledVs.tab?.handoff ?? null;
    const settledS = settledEng.tab?.session ?? null;
    const newSegs = Components.utils.waiveXrays(internal._readAloudSegments?.segments || []);
    const landedText = String(Components.utils.waiveXrays(newSegs[settledS?.position] ?? {})?.text ?? '');
    const rebuildSameCount = newSegs.length === segCount;
    out.checks.afterRestart = {
      settle, cancelledSeen: cancelledSeen ?? null,
      pending: settledH?.pending ?? null, stage: settledH?.stage ?? null, notice: settledH?.notice ?? null, waitedAt: settledH?.waitedAt ?? null,
      position: settledS?.position ?? null, positionIsSelection: settledS?.position === targetIndex,
      landedMarker: landedText.includes(`${markerNum}.`) || landedText.includes(`yek${markerTag.slice(3)} ${markerNum}`),
      landedText: landedText.slice(0, 70),
      voice: settledS?.voice ?? null, playing: settledS?.playing ?? null,
      endedDelta: (settledEng.tab.stats.ended ?? 0) - stats0.ended,
      startedDelta: (settledEng.tab.stats.started ?? 0) - stats0.started,
      carriedDelta: (settledEng.tab.stats.carriedOn ?? 0) - stats0.carriedOn,
      fallbacks: settledEng.tab.stats.fallbacks ?? null,
      rebuildSameCount, requests: settledS?.store?.requests ?? null, requests0,
      lookups: settledS?.store?.lookups ?? null, lookups0,
      msAfterKey: Date.now() - keyAt,
    };

    // ---- Release B: the landing resolves ----
    session.hold.armed = false; session.hold.mode = 'pass';
    const commit = await waitFor(async () => {
      const t = await vs();
      const h = t.tab?.handoff;
      if (h?.last && h.last.kind) return h;
      if (h && (h.stage === 'failed' || h.stage === 'cancelled')) return { __bad: h.stage, handoff: h };
      return null;
    }, 60000, 300);
    if (!commit || commit.__bad) throw new Error('no commit after release: ' + JSON.stringify(commit ?? null));
    await sleep(700);
    const after = await eng();
    const afterVs = await vs();
    const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
    const aFetches = hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceX)).map(e => ({ at: e.at - pickAt, url: e.url }));
    out.checks.commit = {
      last: commit.last ?? null, stage: commit.stage ?? null, notice: afterVs.tab?.handoff?.notice ?? null,
      pendingNow: afterVs.tab?.handoff?.pending ?? null, oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      voiceNow: after.tab.session.voice, position: after.tab.session.position, playing: after.tab.session.playing,
      playbackTime: after.tab.session.playbackTime,
      requests: after.tab.session.store?.requests ?? null,
      aFetchesAfterPick: aFetches, bFetchesAfterPick: hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(voiceB)).length,
      msAfterPick: Date.now() - pickAt,
    };

    const c = out.checks;
    const noCancel = !c.afterRestart.cancelledSeen;
    const restartKept = c.afterRestart.pending === voiceB && noCancel
      && c.afterRestart.endedDelta === 1 && c.afterRestart.startedDelta === 1 && c.afterRestart.carriedDelta === 0
      && (c.afterRestart.fallbacks ?? 0) === 0 && c.afterRestart.rebuildSameCount;
    if (variant === 'dry') {
      c.pass = restartKept
        && c.afterRestart.positionIsSelection && c.afterRestart.landedMarker
        && c.afterRestart.stage === 'waiting' && c.afterRestart.waitedAt === c.afterRestart.position
        && c.afterRestart.playing === false && c.afterRestart.voice === voiceX
        && c.afterRestart.requests === requests0
        && c.commit.last?.kind === 'sentence' && c.commit.last?.index === c.afterRestart.waitedAt && c.commit.last?.offset === 0
        && c.commit.last?.from === voiceX && c.commit.last?.to === voiceB
        && c.commit.notice === 'selected' && (c.commit.oldRequests ?? 0) === 0
        && c.commit.voiceNow === voiceB && c.commit.aFetchesAfterPick.length === 0;
    } else {
      c.pass = restartKept
        && c.afterRestart.positionIsSelection && c.afterRestart.landedMarker
        && c.afterRestart.voice === voiceX && c.afterRestart.playing === true
        && c.afterRestart.requests === requests0
        && c.commit.last && (c.commit.last.kind === 'word' || c.commit.last.kind === 'sentence')
        && c.commit.last.to === voiceB && c.commit.last.from === voiceX
        && c.commit.last.index >= c.afterRestart.position
        && c.commit.notice === 'selected' && (c.commit.oldRequests ?? 0) === 0
        && c.commit.aFetchesAfterPick.length === 0;
    }
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
