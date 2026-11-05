// Case-3 synchronous initial-setter probe (fixture-only, one resume): the
// complete native chain for the Han resume, recorded by events rather than
// polling — startReadAloudAtPosition (the delivered input),
// _requestReadAloudSegments (entries), _captureReadAloudStart (chosen start),
// consumeTargetPosition, and the ACTUAL native setSegments (bsi/point/text),
// plus segmentPreparation() counters around the resume. Proves whether the
// known startup race (a second setSegments overwriting the target-containing
// segment) still occurs on the real resume path, and which source point the
// setter installed. Wrappers are own properties restored in finally with
// descriptor/reference comparison, exactly as in 40-start-race.js.
(async () => {
  const out = { step: 'han-resume-setter-probe' };
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
  const installs = [];
  try {
    if (!f?.itemID || !survey) throw new Error('state missing (fixture/survey)');
    if (JSON.parse(await d.positionSync()).folder !== false || String(p.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') !== String(state.testUrl).replace(/\/+$/, '')) throw new Error('test destination/folder isolation missing');
    const settle = async () => {
      const end = Date.now() + 30000;
      while (Date.now() < end) {
        const position = JSON.parse(await d.position());
        const sync = JSON.parse(await d.positionSync());
        if (position.store?.queued === 0 && position.store?.writing === false
          && sync.transport?.running === false && sync.shared?.transport?.running === false) return true;
        await sleep(400);
      }
      return false;
    };
    if (p.getBoolPref(prefix + 'webdav.syncPositions') !== false) p.setBoolPref(prefix + 'webdav.syncPositions', false);
    out.settledBefore = await settle();

    const url = String(p.getStringPref(prefix + 'webdav.url') || '').trim().replace(/\/+$/, '') + '/';
    const bytes = new TextEncoder().encode(String(p.getStringPref(prefix + 'webdav.username') || '') + ':' + String(p.getStringPref(prefix + 'webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const auth = 'Basic ' + btoa(binary);
    const grab = async () => {
      const r = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
      if (r.status !== 200) throw new Error('shared file GET ' + r.status);
      return JSON.parse(await r.text());
    };

    // Preamble: local row to the opening paragraph (derived from the survey).
    const fb = survey.blocks.find((b) => b.text.indexOf('This is the local fallback sentence.') === 0);
    const fbRef = Number(fb.ref.split('/')[0]);
    const fbPathTail = fb.path.slice(fb.path.indexOf('!'));
    const firstDot = fb.text.indexOf('. ') + 1;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(700); }
    const win = Zotero.getMainWindow();
    let reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    if (!reader) throw new Error('fixture reader gone');
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(400);
    const iframe = waive(reader._iframeWindow);
    const rowNow = async () => {
      const pos = JSON.parse(await d.position());
      const mine = (pos.readers || []).find((r) => r.itemID === f.itemID) ?? null;
      return String(mine?.stored?.value ?? '');
    };
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
    if (!resetOk) throw new Error('local row reset failed');

    // Craft the Han phone item (identical inputs to check 3).
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
    if (!out.craftOk) throw new Error('craft failed');

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
    if (out.adopted !== 1) throw new Error('adopted ' + out.adopted);

    // --- Synchronous observation wrappers (own properties, finally-restored). ---
    const install = (obj, name, onCall) => {
      const entry = { obj, name };
      entry.descBefore = Object.getOwnPropertyDescriptor(obj, name);
      entry.hadOwn = !!entry.descBefore;
      const orig = obj[name];
      if (typeof orig !== 'function') { entry.skipped = true; installs.push(entry); return; }
      entry.orig = orig;
      obj[name] = function (...args) { return onCall({ args, orig, self: this }); };
      entry.installed = true;
      installs.push(entry);
    };
    let events = [];
    let T0 = 0;
    const ev = (name, detail) => events.push(Object.assign({ t: Math.round((performance.now() - T0) * 100) / 100, name }, detail));
    const readPoint = (o) => {
      try { const w = waive(o); const s = w && w.position ? waive(w.position).start : (w && w.start ? waive(w.start) : null); return s ? Array.from(s).map(Number) : null; }
      catch (e) { return null; }
    };
    const internal = reader._internalReader;
    const wInt = waive(internal);
    const wMgr = waive(internal._readAloudManager);
    install(wInt, 'startReadAloudAtPosition', ({ args, orig, self }) => {
      const [pos] = args;
      const copy = { start: null, end: null };
      try { if (pos && typeof pos === 'object') { copy.start = Array.from(waive(pos.start) ?? []).map(Number); copy.end = Array.from(waive(pos.end) ?? []).map(Number); } } catch (e) {}
      ev('startReadAloudAtPosition-input', copy);
      return Reflect.apply(orig, self, args);
    });
    install(wInt, '_requestReadAloudSegments', ({ args, orig, self }) => {
      ev('requestSegments-entry', { active: !!wMgr.active, segmentsNull: !wMgr._segments });
      return Reflect.apply(orig, self, args);
    });
    install(wInt, '_captureReadAloudStart', ({ args, orig, self }) => {
      const ret = Reflect.apply(orig, self, args);
      let kind = 'null', start = null;
      try { if (ret) { const wr = waive(ret); const s = wr && wr.start ? waive(wr.start) : null; if (s) { kind = 'sdt'; start = Array.from(s).map(Number); } else kind = 'other'; } } catch (e) { kind = 'err'; }
      ev('capture', { kind, start });
      return ret;
    });
    install(wMgr, 'consumeTargetPosition', ({ args, orig, self }) => {
      const ret = Reflect.apply(orig, self, args);
      let kind = 'null', start = null;
      try { if (ret) { const wr = waive(ret); const s = wr && wr.start ? waive(wr.start) : null; if (s) { kind = 'sdt'; start = Array.from(s).map(Number); } else kind = 'other'; } } catch (e) { kind = 'err'; }
      ev('consumeTarget', { kind, start });
      return ret;
    });
    install(wMgr, 'setSegments', ({ args, orig, self }) => {
      const [segments, bsi] = args;
      const detail = { bsi: Number(bsi) };
      try {
        const ws = waive(segments); const idx = Number(bsi);
        if (ws && idx >= 0 && idx < ws.length) { detail.point = readPoint(ws[idx]); detail.text = String(waive(ws[idx]).text ?? '').slice(0, 24); detail.segmentsLen = ws.length; }
      } catch (e) {}
      ev('setSegments', detail);
      return Reflect.apply(orig, self, args);
    });
    out.wrappersInstalled = installs.filter((i) => i.installed).length;

    const prepBefore = JSON.parse(await d.segmentPreparation());
    out.countersBefore = (prepBefore.readers || []).find((r) => r.itemID === f.itemID)?.state ?? null;

    // The real resume: trusted Shift+Space.
    const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
    const beforeCount = (await linesNow()).length;
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(300);
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(win);
    const key = (k2, code, keyCode, shift) => new win.KeyboardEvent('', { key: k2, code, keyCode, shiftKey: !!shift });
    tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
    out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
    tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
    tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));

    T0 = performance.now();
    ev('press', {});
    const w0 = performance.now();
    while (performance.now() - w0 < 8000 && !events.some((e) => e.name === 'setSegments')) await sleep(30);
    await sleep(4000);
    out.countersAfter = (JSON.parse(await d.segmentPreparation()).readers || []).find((r) => r.itemID === f.itemID)?.state ?? null;
    out.events = events;
    out.newLines = (await linesNow()).slice(beforeCount).slice(0, 10);
    const setCalls = events.filter((e) => e.name === 'setSegments');
    out.setter = {
      count: setCalls.length,
      calls: setCalls.map((c) => ({ bsi: c.bsi, point: c.point, text: c.text })),
      targetConsumesNonNull: events.filter((e) => e.name === 'consumeTarget' && e.kind === 'sdt').length,
      targetConsumesNull: events.filter((e) => e.name === 'consumeTarget' && e.kind === 'null').length,
      requestEntries: events.filter((e) => e.name === 'requestSegments-entry').length,
      deliveredInput: (events.find((e) => e.name === 'startReadAloudAtPosition-input') || {}).start ?? null,
      capture: (events.find((e) => e.name === 'capture') || {}) ?? null,
    };
    const han = out.setter.calls.filter((c) => c.point && c.point[0] === 6);
    out.setterHanContainsFirst = han.some((c) => c.point[2] <= 2 && c.point[2] + String(c.text ?? '').length > 2);
    out.setterSecondCall = setCalls.length > 1 ? setCalls[1] : null;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  } finally {
    const residue = [];
    for (const entry of installs) {
      if (!entry.installed) continue;
      try {
        if (entry.hadOwn) entry.obj[entry.name] = entry.orig;
        else { try { delete entry.obj[entry.name]; } catch (e2) { residue.push(entry.name + ':delete-failed'); continue; } }
        const refOk = entry.hadOwn ? (entry.obj[entry.name] === entry.orig) : !Object.prototype.hasOwnProperty.call(entry.obj, entry.name);
        const descAfter = Object.getOwnPropertyDescriptor(entry.obj, entry.name);
        const descOk = entry.hadOwn
          ? JSON.stringify([descAfter?.writable, descAfter?.enumerable, descAfter?.configurable]) === JSON.stringify([entry.descBefore?.writable, entry.descBefore?.enumerable, entry.descBefore?.configurable])
          : !descAfter;
        if (!(refOk && descOk)) residue.push(entry.name + ':' + (refOk ? '' : 'ref,') + (descOk ? '' : 'descriptor'));
      } catch (e) { residue.push(entry.name + ':' + String(e).slice(0, 40)); }
    }
    out.wrapperRestore = { checked: installs.filter((i) => i.installed).length, residue };
    if (out.ok !== false) out.ok = residue.length === 0;
    try {
      const rNow = (Zotero.Reader._readers || []).find((x) => x.itemID === state.fixture?.itemID);
      if (rNow) { const m = rNow._internalReader?._readAloudManager; if (m?.active) rNow._internalReader.toggleReadAloudPopup(false); }
      await sleep(1500);
      const p2 = Services.prefs;
      p2.setBoolPref(prefix + 'webdav.syncPositions', false);
      const fb2 = state.folderSwitchBefore;
      if (fb2) { p2.setBoolPref(prefix + 'webdav.enabled', fb2.value === true); if (!fb2.user) { try { p2.clearUserPref(prefix + 'webdav.enabled'); } catch {} } }
      out.folderSwitchRestored = p2.prefHasUserValue(prefix + 'webdav.enabled') === (state.folderSwitchBefore?.user ?? false)
        && p2.getBoolPref(prefix + 'webdav.enabled') === (state.folderSwitchBefore?.value ?? false);
      out.settledAfter = await (async () => { const end = Date.now() + 20000; while (Date.now() < end) { const position = JSON.parse(await d.position()); const sync = JSON.parse(await d.positionSync()); if (position.store?.queued === 0 && !position.store?.writing && !sync.transport?.running && !sync.shared?.transport?.running) return true; await sleep(400); } return false; })();
      const h = Services.wm.getMostRecentWindow('navigator:browser');
      try { if (h) h.minimize(); } catch (e3) {}
    } catch (e4) { out.cleanupError = String(e4).slice(0, 80); }
  }
  return JSON.stringify(out, null, 1);
})()
