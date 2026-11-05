// Case-3 diagnosis part 2: which of Zotero's own start-selection inputs wins
// when the plugin delivers a mid-block SDT point. Wraps the fixture reader's
// internal._captureReadAloudStart, the manager's consumeTargetPosition and the
// view's getSelectionPosition for one resume; every wrapper is an own property
// removed in finally (hadOwn respected). Fixture-only; no production change.
(async () => {
  const out = { step: 'han-start-selection-probe' };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const survey = state.survey;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  const FIXTURE_ID = state.fixtureDocId;
  const DEVICE = 'tester-anchor-234';
  const restores = [];
  try {
    if (JSON.parse(await d.positionSync()).folder !== false || String(p.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') !== String(state.testUrl).replace(/\/+$/, '')) throw new Error('test destination/folder isolation missing');
    const fb = survey.blocks.find((b) => b.text.indexOf('This is the local fallback sentence.') === 0);
    const fbRef = Number(fb.ref.split('/')[0]);
    const fbPathTail = fb.path.slice(fb.path.indexOf('!'));
    const firstDot = fb.text.indexOf('. ') + 1;
    const settle = async () => {
      const end = Date.now() + 30000;
      while (Date.now() < end) {
        try {
          const position = JSON.parse(await d.position());
          const sync = JSON.parse(await d.positionSync());
          if (position.store?.queued === 0 && position.store?.writing === false
            && sync.transport?.running === false && sync.shared?.transport?.running === false) return true;
        } catch {}
        await sleep(400);
      }
      return false;
    };
    if (p.getBoolPref(prefix + 'webdav.syncPositions') !== false) p.setBoolPref(prefix + 'webdav.syncPositions', false);
    await settle();

    const url = String(p.getStringPref(prefix + 'webdav.url') || '').trim().replace(/\/+$/, '') + '/';
    const bytes = new TextEncoder().encode(String(p.getStringPref(prefix + 'webdav.username') || '') + ':' + String(p.getStringPref(prefix + 'webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const auth = 'Basic ' + btoa(binary);
    const grab = async () => {
      const r = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
      return JSON.parse(await r.text());
    };

    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(700); }
    const win = Zotero.getMainWindow();
    let reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(400);
    const iframe = waive(reader._iframeWindow);
    const rowNow = async () => {
      const pos = JSON.parse(await d.position());
      const mine = (pos.readers || []).find((r) => r.itemID === f.itemID) ?? null;
      return String(mine?.stored?.value ?? '');
    };
    // Preamble (row to the opening paragraph, derived from the survey).
    const mB = waive(reader._internalReader._readAloudManager);
    if (mB?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1200); }
    reader._internalReader.startReadAloudAtPosition(Components.utils.cloneInto({ start: [fbRef, 0, 0], end: [fbRef, 0, firstDot] }, iframe));
    const t0 = Date.now();
    let resetOk = false;
    while (Date.now() - t0 < 12000) {
      const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
      const active = m?.activeSegment ?? null;
      const ref = active ? (Array.from(waive(active.position?.start) ?? [])).slice(0, -2).join('/') : null;
      const row = await rowNow();
      if (ref === String(fbRef) && row.indexOf(fbPathTail) !== -1) { resetOk = true; break; }
      await sleep(300);
    }
    out.preambleReset = resetOk;
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(1200);
    out.localRowBefore = await rowNow();

    // Craft (same Han item).
    const cur = await grab();
    const heldAt = (cur.items.find((i) => i.id === FIXTURE_ID)?.stamp?.at) ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(state.phoneStampBase)) state.phoneStampBase = Date.now() + 3 * 60 * 60 * 1000;
    const k = state.phoneStampIndex = (state.phoneStampIndex ?? 0);
    state.phoneStampIndex = k + 1;
    const stampAt = Math.max(state.phoneStampBase + 1000 * k, Number.isFinite(heldAt) ? heldAt + 1000 : heldAt);
    const items = cur.items
      .filter((i) => i.id !== FIXTURE_ID)
      .concat([{ id: FIXTURE_ID, format: 'epub', publicationId: null, locator: 'epubcfi(/6/2!/4/98)', anchor: { exact: '你好', prefix: '前文', suffix: '后文。 你好。' }, stamp: { at: stampAt, device: DEVICE } }])
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const body = JSON.stringify({ format: 'xujialiu-positions', version: 1, items });
    const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
    const verify = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    out.craftOk = (put.status === 200 || put.status === 204) && (await verify.text()) === body;

    p.setBoolPref(prefix + 'webdav.syncPositions', true);
    const folderBefore = { user: p.prefHasUserValue(prefix + 'webdav.enabled'), value: p.getBoolPref(prefix + 'webdav.enabled') };
    state.folderSwitchBefore = folderBefore;
    p.setBoolPref(prefix + 'webdav.enabled', true);
    const swStart = Date.now();
    let sw = null;
    while (Date.now() - swStart < 30000) {
      await sleep(600);
      sw = JSON.parse(await d.positionSync());
      if (sw.transport?.running === false && sw.shared?.transport?.running === false
        && sw.transport?.lastTrigger === 'switch-on' && sw.transport?.lastOutcome === 'ok'
        && sw.shared?.transport?.lastOutcome === 'ok') break;
    }
    out.adopted = sw?.shared?.transport?.adopted ?? null;

    // --- The observation wrappers. ---
    const internal = reader._internalReader;
    const mgr = internal._readAloudManager;
    const view = internal._activePrimaryView ?? internal._lastView ?? null;
    const wrap = (obj, name, push) => {
      if (!obj || typeof obj[name] !== 'function') { push.unavailable = true; return; }
      const hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
      const orig = obj[name];
      obj[name] = function (...args) {
        let ret;
        try { ret = Reflect.apply(orig, this, Array.from(arguments)); } catch (e) { push.push({ at: Date.now(), threw: String(e).slice(0, 60) }); throw e; }
        try {
          let retOut = null;
          if (ret && typeof ret === 'object') {
            retOut = {
              start: Array.from(waive(ret.start) ?? []).map(Number),
              end: Array.from(waive(ret.end) ?? []).map(Number),
              kind: ret.pageIndex !== undefined ? 'pdf' : 'sdt',
            };
          } else retOut = ret === undefined ? 'undefined' : ret;
          push.push({ at: Date.now(), ret: retOut });
        } catch {}
        return ret;
      };
      restores.push(() => {
        if (hadOwn) obj[name] = orig; else delete obj[name];
        return obj[name] === orig && Object.prototype.hasOwnProperty.call(obj, name) === hadOwn;
      });
    };
    const capLog = [], consumeLog = [], selLog = [], jumpLog = [], playLog = [];
    wrap(internal, '_captureReadAloudStart', capLog);
    wrap(mgr, 'consumeTargetPosition', consumeLog);
    if (view) wrap(view, 'getSelectionPosition', selLog); else out.noView = true;
    wrap(mgr, 'jumpTo', jumpLog);
    wrap(mgr, 'play', playLog);

    try {
      if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(500); }
      win.Zotero_Tabs.select(String(reader.tabID));
      win.focus();
      await sleep(300);
      const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
      const beforeCount = (await linesNow()).length;
      const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      tip.beginInputTransactionForTests(win);
      const key = (k2, code, keyCode, shift) => new win.KeyboardEvent('', { key: k2, code, keyCode, shiftKey: !!shift });
      tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
      out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
      const started = Date.now();
      let last = null;
      const trace = [];
      while (Date.now() - started < 5000) {
        const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
        const active = m?.activeSegment ?? null;
        if (active && typeof active.text === 'string') {
          const sp = Array.from(waive(active.position?.start) ?? []).map(Number);
          const sig = sp.join(',') + String(active.text).slice(0, 30);
          if (sig !== last) { last = sig; trace.push({ atMs: Date.now() - started, point: sp, text: String(active.text).slice(0, 40) }); }
        }
        await sleep(80);
      }
      out.trace = trace;
      out.captureReadAloudStart = capLog;
      out.consumeTargetPosition = consumeLog;
      out.getSelectionPosition = selLog;
      out.jumpTo = jumpLog;
      out.play = playLog;
      out.viewKind = view ? (view._type ?? view.constructor?.name ?? 'unknown') : null;
      out.savedPositionAtStart = (() => { try { const raw = internal?._state?.readAloudState?.savedPosition; return raw ? String(JSON.stringify(raw)).slice(0, 80) : null; } catch { return 'ERR'; } })();
      out.newLines = (await linesNow()).slice(beforeCount).slice(0, 8);
    } finally {
      let restored = true;
      while (restores.length) { try { restored = restores.pop()() && restored; } catch { restored = false; } }
      out.wrappersRestored = restored;
    }

    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(2500);
    p.setBoolPref(prefix + 'webdav.syncPositions', false);
    p.setBoolPref(prefix + 'webdav.enabled', state.folderSwitchBefore?.value === true);
    if (state.folderSwitchBefore && !state.folderSwitchBefore.user) { try { p.clearUserPref(prefix + 'webdav.enabled'); } catch {} }
    out.settledAfter = await settle();
    try { if (host) host.minimize(); await sleep(300); } catch {}
    out.ok = out.wrappersRestored;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
    try {
      while (restores.length) { restores.pop()(); }
      const reader2 = (Zotero.Reader._readers || []).find((x) => x.itemID === state.fixture?.itemID);
      if (reader2) { try { reader2._internalReader.toggleReadAloudPopup(false); } catch {} }
      const p2 = Services.prefs;
      p2.setBoolPref('extensions.zotero.zotero-tts.webdav.syncPositions', false);
      const fb2 = Zotero.ZoteroTTSRun.state?.folderSwitchBefore;
      if (fb2) {
        p2.setBoolPref('extensions.zotero.zotero-tts.webdav.enabled', fb2.value === true);
        if (!fb2.user) { try { p2.clearUserPref('extensions.zotero.zotero-tts.webdav.enabled'); } catch {} }
      }
    } catch {}
  }
  return JSON.stringify(out, null, 1);
})()
