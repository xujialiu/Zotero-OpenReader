// Case-3 landing diagnosis (bounded, fixture-only): wrap the INSTALLED
// internal reader's startReadAloudAtPosition for the duration of one resume —
// exactly the call resumeFromShared makes (index.ts:1707: the SDT position
// cloned into the reader window) — capture the delivered position verbatim,
// poll the manager's active segment at 80 ms to catch every transient segment,
// and inspect Zotero's own segment list for the Han block. The wrapper is an
// own property on the fixture reader's internal object only, removed in
// finally (hadOwn respected). Same craft/adopt/press as check 3.
(async () => {
  const out = { step: 'han-landing-probe' };
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
  let unwrapped = false;
  try {
    if (!f?.itemID || !survey) throw new Error('state missing (fixture/survey)');
    if (JSON.parse(await d.positionSync()).folder !== false || String(p.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') !== String(state.testUrl).replace(/\/+$/, '')) throw new Error('test destination/folder isolation missing');
    const a = { exact: '你好', prefix: '前文', suffix: '后文。 你好。' };
    const locator = 'epubcfi(/6/2!/4/98)';
    const hanBlock = survey.blocks.find((b) => b.ref === '6');
    out.hanBlock = { ref: hanBlock.ref, path: hanBlock.path, text: hanBlock.text, firstYouHaoAt: hanBlock.text.indexOf('你好') };

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

    // Preamble: local row to the opening paragraph (derived from the survey,
    // not hard-coded: the block holding the fallback sentence, its path in
    // the CFI is what the row must name).
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
    const resetOnce = async () => {
      const mB = waive(reader._internalReader._readAloudManager);
      if (mB?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1200); }
      reader._internalReader.startReadAloudAtPosition(Components.utils.cloneInto({ start: [fbRef, 0, 0], end: [fbRef, 0, firstDot] }, iframe));
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
        const active = m?.activeSegment ?? null;
        const ref = active ? (Array.from(waive(active.position?.start) ?? [])).slice(0, -2).join('/') : null;
        const row = await rowNow();
        if (ref === String(fbRef) && row.indexOf(fbPathTail) !== -1) return true;
        await sleep(300);
      }
      return false;
    };
    out.preambleReset = await resetOnce();
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(1200);
    out.localRowBefore = await rowNow();
    if (!out.preambleReset) throw new Error('local row reset failed: ' + out.localRowBefore);

    // Craft the Han phone item (same inputs as the failing check 3 run).
    const cur = await grab();
    const heldAt = (cur.items.find((i) => i.id === FIXTURE_ID)?.stamp?.at) ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(state.phoneStampBase)) state.phoneStampBase = Date.now() + 3 * 60 * 60 * 1000;
    const k = state.phoneStampIndex = (state.phoneStampIndex ?? 0);
    state.phoneStampIndex = k + 1;
    const stampAt = Math.max(state.phoneStampBase + 1000 * k, Number.isFinite(heldAt) ? heldAt + 1000 : heldAt);
    out.craft = { stampAt, device: DEVICE };
    const items = cur.items
      .filter((i) => i.id !== FIXTURE_ID)
      .concat([{ id: FIXTURE_ID, format: 'epub', publicationId: null, locator, anchor: { exact: a.exact, prefix: a.prefix, suffix: a.suffix }, stamp: { at: stampAt, device: DEVICE } }])
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const body = JSON.stringify({ format: 'xujialiu-positions', version: 1, items });
    const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
    const verify = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    out.craft = { stampAt, device: DEVICE, putStatus: put.status, putVerified: (await verify.text()) === body };
    if (!(put.status === 200 || put.status === 204) || !out.craft.putVerified) throw new Error('craft failed');

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

    // --- The wrapper: installed resumeFromShared → startReadAloudAtPosition. ---
    const internal = reader._internalReader;
    const hadOwn = Object.prototype.hasOwnProperty.call(internal, 'startReadAloudAtPosition');
    const orig = internal.startReadAloudAtPosition;
    const delivered = [];
    internal.startReadAloudAtPosition = function (pos) {
      try {
        const copy = { hadPosition: pos !== null && pos !== undefined, start: null, end: null, rawKind: typeof pos };
        if (pos && typeof pos === 'object') {
          copy.start = Array.from(waive(pos.start) ?? []).map((n) => Number(n));
          copy.end = Array.from(waive(pos.end) ?? []).map((n) => Number(n));
        }
        delivered.push({ at: new Date().toISOString(), ...copy });
      } catch (e) {
        delivered.push({ at: new Date().toISOString(), captureError: String(e).slice(0, 80) });
      }
      return Reflect.apply(orig, this, Array.from(arguments));
    };
    try {
      if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(500); }
      win.Zotero_Tabs.select(String(reader.tabID));
      win.focus();
      await sleep(300);
      const m1 = waive(reader._internalReader._readAloudManager);
      if (m1?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1500); }
      const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
      const beforeCount = (await linesNow()).length;
      const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      tip.beginInputTransactionForTests(win);
      const key = (k2, code, keyCode, shift) => new win.KeyboardEvent('', { key: k2, code, keyCode, shiftKey: !!shift });
      tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
      out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));

      // Samples only: a transition shorter than 80 ms can still be missed.
      const started = Date.now();
      let last = null;
      const trace = [];
      while (Date.now() - started < 6000) {
        const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
        const active = m?.activeSegment ?? null;
        if (active && typeof active.text === 'string') {
          const sp = Array.from(waive(active.position?.start) ?? []).map((n) => Number(n));
          const sig = sp.join(',') + '|' + String(active.text).slice(0, 40);
          if (sig !== last) {
            last = sig;
            trace.push({ atMs: Date.now() - started, ref: sp.slice(0, -2).join('/'), point: sp, text: String(active.text).slice(0, 50) });
          }
        }
        await sleep(80);
      }
      out.segmentTrace = trace;
      out.delivered = delivered;

      // Zotero's own segment list around the Han block (walk by index).
      try {
        const segs = waive(internal._readAloudSegments?.segments);
        const total = segs ? segs.length : null;
        const han = [];
        const head = [];
        if (segs) {
          for (let i = 0; i < segs.length; i++) {
            const s = waive(segs[i]);
            const sp = Array.from(waive(s?.position?.start) ?? []).map((n) => Number(n));
            const ref = sp.slice(0, -2).join('/');
            const entry = { i, ref, point: sp, text: String(s?.text ?? '').slice(0, 30) };
            if (ref === '6') han.push(entry);
            else if (head.length < 6 && Number(ref) <= 6) head.push(entry);
          }
        }
        out.zoteroSegments = { total, hanBlockSegments: han, otherHead: head };
      } catch (e) {
        out.zoteroSegments = { error: String(e).slice(0, 100) };
      }
      out.newLines = (await linesNow()).slice(beforeCount).slice(0, 14);
    } finally {
      // Restore the wrapper exactly as found.
      if (hadOwn) internal.startReadAloudAtPosition = orig;
      else { try { delete internal.startReadAloudAtPosition; } catch {} }
      unwrapped = !Object.prototype.hasOwnProperty.call(internal, 'startReadAloudAtPosition') || internal.startReadAloudAtPosition === orig;
    }
    out.wrapperRestored = unwrapped;

    // Stop, suspend, restore the folder switch, minimize.
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(2500);
    p.setBoolPref(prefix + 'webdav.syncPositions', false);
    p.setBoolPref(prefix + 'webdav.enabled', state.folderSwitchBefore?.value === true);
    if (state.folderSwitchBefore && !state.folderSwitchBefore.user) { try { p.clearUserPref(prefix + 'webdav.enabled'); } catch {} }
    out.folderSwitchRestored = p.prefHasUserValue(prefix + 'webdav.enabled') === state.folderSwitchBefore.user
      && p.getBoolPref(prefix + 'webdav.enabled') === state.folderSwitchBefore.value;
    out.settledAfter = await settle();
    try { if (host) host.minimize(); await sleep(300); } catch {}
    out.ok = out.wrapperRestored && out.delivered.length > 0;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
    try {
      const reader2 = (Zotero.Reader._readers || []).find((x) => x.itemID === state.fixture?.itemID);
      if (reader2) {
        // The observation wrapper's finally restored its exact original.
        // Never delete a preexisting own method during error cleanup.
        try { reader2._internalReader.toggleReadAloudPopup(false); } catch {}
      }
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
