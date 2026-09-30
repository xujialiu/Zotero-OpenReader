(async () => {
  // Issue #163, item 14 row "A skip to a sentence A lacks": with a pick pending,
  // skip FORWARD past the old voice's stock. Variant A: trusted Shift+→ presses
  // (the 600 ms debounce takes the last landing). Variant B: the player's own
  // forward skip button. Each variant uses its own fresh-prose fixture (the
  // plugin's in-memory audio cache is text-keyed and process-lifetime, so a dry
  // landing needs sentences no voice has touched). Expect: the landing is dry,
  // no old-voice request, stage waiting / waitedAt = landing, the switch NOT
  // taken and not cancelled, then B reads the landed sentence from offset 0.
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

  // Close + erase the previous run fixtures, import `file`, open it, resolve a
  // local voice, return the reader with segments built.
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

  const seedAndPick = async (internal, manager, rw, segCount) => {
    // Play, fix the voice to a local one if the native map won, reposition once
    // for runway, and pick the other pair member with its requests held.
    try { rw.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { throw new Error('seed play: ' + String(e)); }
    const started = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 30000, 300);
    if (started === null) throw new Error('session never started playing');
    let vx0 = ((await eng())?.tab?.session?.voice) ?? null;
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
    // One reposition for runway (the persisted start is near the top).
    const PIN = Math.min(10, Math.max(4, segCount - 17));
    try {
      manager.repositionTo(PIN);
      await sleep(900);
    } catch (_) {}
    const at = await waitFor(async () => {
      const t = await eng();
      return t.tab?.session?.playing === true ? t.tab.session.position : null;
    }, 15000, 300);
    if (at === null) throw new Error('session not playing after reposition');
    if (at + 8 > segCount - 1) throw new Error(`no runway: at ${at} of ${segCount}`);
    const before = await eng();
    const voiceX = before.tab.session.voice;
    const voiceB = voiceX === 'local::af_bella' ? 'local::af_alloy' : 'local::af_bella';
    session.hold = { armed: true, ms: 20000, mode: 'hold', voice: voiceB };
    session.holdVoice = voiceB;
    pressKey(rw, '.', 'Period', 190, true);
    const pending = await waitFor(async () => {
      const t = await vs();
      return t.tab?.handoff && t.tab.handoff.pending === voiceB && t.tab.handoff.stage === 'preparing' ? t.tab.handoff : null;
    }, 5000, 80);
    if (!pending) throw new Error('switch to B never reported pending/preparing');
    return { voiceX, voiceB, at, requestsAtPick: before.tab.session.store?.requests ?? null };
  };

  const out = { status: 'FAIL', errors: [], checks: {}, variants: {} };
  // Variant gate: params.skip163Variants (default both) — a run may drive only
  // 'shiftRight' or only 'buttonForward' (each variant imports its own fixture).
  const wantVariants = Array.isArray(Zotero.ZoteroTTSRun.params.skip163Variants)
    ? Zotero.ZoteroTTSRun.params.skip163Variants : ['shiftRight', 'buttonForward'];
  let hold = null;
  try {
    restoreHost();

    // ---- Variant A: trusted Shift+→ presses past the stock ----
    if (wantVariants.includes('shiftRight')) try {
      const swapped = await swapFixture(Zotero.ZoteroTTSRun.params.fixture163);
      const internal = swapped.reader._internalReader;
      const manager = Components.utils.waiveXrays(internal._readAloudManager);
      const rw = swapped.reader._iframeWindow;
      hold = installHold();
      const picked = await seedAndPick(internal, manager, rw, swapped.segmentCount);
      const pickAt = Date.now();
      const presses = [];
      let landing = picked.at;
      let waitObserved = null;
      for (let i = 0; i < 8; i++) {
        pressKey(rw, 'ArrowRight', 'ArrowRight', 39, true);
        presses.push(Date.now() - pickAt);
        await sleep(700);
        const t = await eng();
        landing = t.tab.session.position;
        const h = (await vs()).tab?.handoff;
        if (h?.stage === 'waiting') { waitObserved = h; break; }
        if (h?.pending !== picked.voiceB) throw new Error('switch lost during skips: ' + JSON.stringify(h ?? null));
      }
      session.hold.armed = false;
      const during = await eng();
      const duringVs = await vs();
      const h = duringVs.tab?.handoff;
      const a = {
        presses: presses.length, landing, waitedAt: waitObserved?.waitedAt ?? null,
        atRest: {
          stage: h?.stage ?? null, waitedAt: h?.waitedAt ?? null, pending: h?.pending ?? null, notice: h?.notice ?? null,
          voice: during.tab.session.voice, playing: during.tab.session.playing, position: during.tab.session.position,
          requests: during.tab.session.store?.requests ?? null, requestsAtPick: picked.requestsAtPick,
        },
      };
      a.noCancel = a.atRest.pending === picked.voiceB && a.atRest.stage === 'waiting' && a.atRest.voice === picked.voiceX;
      a.noOldRequest = a.atRest.requests === picked.requestsAtPick;
      // B's audio for the waited sentence lands; B reads it from offset 0.
      const commit = await waitFor(async () => {
        const t = await vs();
        const hh = t.tab?.handoff;
        return hh?.last?.kind === 'sentence' ? hh : null;
      }, 45000, 300);
      await sleep(600);
      const after = await eng();
      const afterVs = await vs();
      session.hold.armed = false; session.hold.mode = 'pass';
      const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
      a.commit = {
        last: commit?.last ?? null, notice: afterVs.tab?.handoff?.notice ?? null,
        voiceNow: after.tab.session.voice, position: after.tab.session.position,
        playing: after.tab.session.playing, playbackTime: after.tab.session.playbackTime,
        oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      };
      a.xFetchesAfterKeys = hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(picked.voiceX)).length;
      a.pass = a.noCancel && a.noOldRequest && a.commit.last?.kind === 'sentence'
        && a.commit.last?.index === a.waitedAt && a.commit.last?.offset === 0
        && a.commit.last?.to === picked.voiceB && a.commit.notice === 'selected'
        && (a.commit.oldRequests ?? 0) === 0 && a.xFetchesAfterKeys === 0;
      out.variants.shiftRight = a;
    } catch (e) {
      out.variants.shiftRight = { error: String(e) };
      out.errors.push('shiftRight: ' + String(e));
    } finally {
      try { session.hold.armed = false; session.hold.mode = 'pass'; } catch (_) {}
      if (hold) { hold.restore(); hold = null; }
    }

    // ---- Variant B: the player's forward skip button ----
    if (wantVariants.includes('buttonForward')) try {
      const swapped = await swapFixture(Zotero.ZoteroTTSRun.params.fixture163Alt);
      const internal = swapped.reader._internalReader;
      const manager = Components.utils.waiveXrays(internal._readAloudManager);
      const rw = swapped.reader._iframeWindow;
      const buttons = Array.from(rw.document.querySelectorAll('.read-aloud-popup button.toolbar-button.skip') || []);
      out.checks.skipButtons = buttons.map((b, i) => ({ i, title: b.getAttribute('title') ?? b.getAttribute('aria-label') ?? null }));
      let forwardButton = null;
      for (let i = 0; i < buttons.length; i++) {
        const t = String(buttons[i].getAttribute('title') ?? buttons[i].getAttribute('aria-label') ?? '');
        if (/next/i.test(t)) { forwardButton = { i, btn: buttons[i] }; break; }
      }
      if (!forwardButton && buttons.length >= 3) forwardButton = { i: 2, btn: buttons[2] };
      if (!forwardButton) throw new Error('player forward skip button not found');
      hold = installHold();
      const picked = await seedAndPick(internal, manager, rw, swapped.segmentCount);
      const pickAt = Date.now();
      const presses = [];
      let landing = picked.at;
      let waitObserved = null;
      for (let i = 0; i < 10; i++) {
        try { forwardButton.btn.click(); } catch (e) { out.errors.push('button click: ' + String(e)); }
        presses.push(Date.now() - pickAt);
        await sleep(700);
        const t = await eng();
        landing = t.tab.session.position;
        const h = (await vs()).tab?.handoff;
        if (h?.stage === 'waiting') { waitObserved = h; break; }
        if (h?.pending !== picked.voiceB) throw new Error('switch lost during skips: ' + JSON.stringify(h ?? null));
      }
      session.hold.armed = false;
      const during = await eng();
      const duringVs = await vs();
      const h = duringVs.tab?.handoff;
      const b = {
        buttonIndex: forwardButton.i, buttonTitle: out.checks.skipButtons[forwardButton.i]?.title ?? null,
        presses: presses.length, landing, waitedAt: waitObserved?.waitedAt ?? null,
        atRest: {
          stage: h?.stage ?? null, waitedAt: h?.waitedAt ?? null, pending: h?.pending ?? null, notice: h?.notice ?? null,
          voice: during.tab.session.voice, playing: during.tab.session.playing, position: during.tab.session.position,
          requests: during.tab.session.store?.requests ?? null, requestsAtPick: picked.requestsAtPick,
        },
      };
      b.noCancel = b.atRest.pending === picked.voiceB && b.atRest.stage === 'waiting' && b.atRest.voice === picked.voiceX;
      b.noOldRequest = b.atRest.requests === picked.requestsAtPick;
      const commit = await waitFor(async () => {
        const t = await vs();
        const hh = t.tab?.handoff;
        return hh?.last?.kind === 'sentence' ? hh : null;
      }, 45000, 300);
      await sleep(600);
      const after = await eng();
      const afterVs = await vs();
      session.hold.armed = false; session.hold.mode = 'pass';
      const shortOf = id => String(id || '').includes('::') ? String(id).split('::').pop() : String(id || '');
      b.commit = {
        last: commit?.last ?? null, notice: afterVs.tab?.handoff?.notice ?? null,
        voiceNow: after.tab.session.voice, position: after.tab.session.position,
        playing: after.tab.session.playing, playbackTime: after.tab.session.playbackTime,
        oldRequests: afterVs.tab?.handoff?.oldRequests ?? null,
      };
      b.xFetchesAfterKeys = hold.log.filter(e => e.at >= pickAt && e.voice === shortOf(picked.voiceX)).length;
      b.pass = b.noCancel && b.noOldRequest && b.commit.last?.kind === 'sentence'
        && b.commit.last?.index === b.waitedAt && b.commit.last?.offset === 0
        && b.commit.last?.to === picked.voiceB && b.commit.notice === 'selected'
        && (b.commit.oldRequests ?? 0) === 0 && b.xFetchesAfterKeys === 0;
      out.variants.buttonForward = b;
    } catch (e) {
      out.variants.buttonForward = { error: String(e) };
      out.errors.push('buttonForward: ' + String(e));
    } finally {
      try { session.hold.armed = false; session.hold.mode = 'pass'; } catch (_) {}
      if (hold) { hold.restore(); hold = null; }
    }

    out.status = (!wantVariants.includes('shiftRight') || out.variants.shiftRight.pass === true)
      && (!wantVariants.includes('buttonForward') || out.variants.buttonForward.pass === true) ? 'PASS' : 'FAIL';
    try { if (manager && manager.active && !manager.paused) manager.pause(); } catch (_) {}
  } catch (e) {
    out.errors.push(String(e));
    try { session.hold.armed = false; session.hold.mode = 'pass'; } catch (_) {}
  } finally {
    if (hold) hold.restore();
    await minimizeHost();
  }
  return JSON.stringify(out, null, 1);
})();
