// One shared-resume check (case items 1-5), parameterized by params:
//   check   — the row's name ('1a', '1b', '2', '3', '4a', ...)
//   anchor  — { exact, prefix, suffix } as a phone would store it
//   locator — the phone item's locator (a real block locator, or an absent one)
//   expectSegmentStartsWith — what the landing segment must begin with
// Sequence: settle → local row reset to the opening paragraph → craft the
// phone item into xujialiu-positions.json (stamp monotonic, device
// 'tester-anchor-234') → syncPositions on (its sync adopts) → trusted
// Shift+Space → observe the log line, the manager's active segment and its
// SDT point, the unresolved toast, then stop and suspend again.
(async () => {
  const out = { step: 'resume-check', check: Zotero.ZoteroTTSRun.params.check };
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
  try {
    if (!f?.itemID || !survey) throw new Error('runs 20/21 first');
    const a = Zotero.ZoteroTTSRun.params.anchor;
    const locator = Zotero.ZoteroTTSRun.params.locator;
    if (!a?.exact || typeof locator !== 'string') throw new Error('params.anchor/locator missing');
    const P = Zotero.ZoteroTTSRun.params;
    if (typeof P.expectedBlockRef !== 'string' || typeof P.expectedOffset !== 'number' || typeof P.expectedLog !== 'string') {
      throw new Error('explicit expectedBlockRef/expectedOffset/expectedLog are required');
    }
    if (JSON.parse(await d.positionSync()).folder !== false) throw new Error('folder must be suspended before this check');
    if (String(p.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') !== String(state.testUrl).replace(/\/+$/, '')) throw new Error('test destination mismatch');
    out.anchorChars = { exact: a.exact.length, prefix: a.prefix.length, suffix: a.suffix.length };

    const settle = async () => {
      const end = Date.now() + 30000;
      let last = null;
      while (Date.now() < end) {
        try {
          const position = JSON.parse(await d.position());
          const sync = JSON.parse(await d.positionSync());
          last = position.store?.queued === 0 && position.store?.writing === false
            && sync.transport?.running === false && sync.shared?.transport?.running === false;
          if (last) return true;
        } catch {}
        await sleep(400);
      }
      return last === true;
    };
    if (p.getBoolPref(prefix + 'webdav.syncPositions') !== false) p.setBoolPref(prefix + 'webdav.syncPositions', false);
    out.settledBefore = await settle();
    if (!out.settledBefore) throw new Error('transports did not settle');

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

    // --- Preamble: the known older local position at the opening paragraph. ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(800); }
    const win = Zotero.getMainWindow();
    let reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    if (!reader) throw new Error('fixture reader gone');
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(500);
    const m0 = waive(reader._internalReader._readAloudManager);
    if (m0?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1500); }
    // The opening paragraph is DERIVED from the live survey (the block
    // holding the fallback sentence), never a hard-coded ref or CFI tail.
    const fb = survey.blocks.find((b) => b.text.indexOf('This is the local fallback sentence.') === 0) ?? survey.blocks[1];
    const fbRef = Number(fb.ref.split('/')[0]);
    const fbPathTail = fb.path.slice(fb.path.indexOf('!'));
    const firstDot = fb.text.indexOf('. ') + 1;
    const iframe = waive(reader._iframeWindow);
    // The local row moves on the sampler's heartbeat ticks while the session
    // is active — not on the popup close. Poll the ROW itself until it names
    // the opening paragraph (the block's own path) while the active segment
    // is still inside that block, then close at once.
    const rowNow = async () => {
      const pos = JSON.parse(await d.position());
      const mine = (pos.readers || []).find((r) => r.itemID === f.itemID) ?? null;
      return String(mine?.stored?.value ?? '');
    };
    const resetOnce = async () => {
      reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
      const mB = waive(reader._internalReader._readAloudManager);
      if (mB?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1200); }
      reader._internalReader.startReadAloudAtPosition(Components.utils.cloneInto({ start: [fbRef, 0, 0], end: [fbRef, 0, firstDot] }, iframe));
      const t0 = Date.now();
      let ref = null;
      while (Date.now() - t0 < 12000) {
        const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
        const active = m?.activeSegment ?? null;
        ref = active ? (Array.from(waive(active.position?.start) ?? [])).slice(0, -2).join('/') : null;
        const row = await rowNow();
        if (ref === String(fbRef) && row.indexOf(fbPathTail) !== -1) return { ref, atMs: Date.now() - t0, ok: true };
        await sleep(300);
      }
      return { ref, atMs: Date.now() - t0, ok: false };
    };
    const pre1 = await resetOnce();
    out.preamble = pre1;
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(1200);
    const position0 = JSON.parse(await d.position());
    const mine0 = (position0.readers || []).find((r) => r.itemID === f.itemID) ?? null;
    out.localRowBefore = mine0?.stored ?? null;
    out.localRowTsBefore = mine0?.stored?.ts ?? null;
    out.localRowAtFallback = String(out.localRowBefore?.value || '').indexOf(fbPathTail) !== -1;
    // One retry if the first reset did not leave the row at the paragraph.
    if (!out.localRowAtFallback) {
      const pre2 = await resetOnce();
      out.preambleRetry = pre2;
      reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
      reader._internalReader.toggleReadAloudPopup(false);
      await sleep(1200);
      const position0b = JSON.parse(await d.position());
      const mine0b = (position0b.readers || []).find((r) => r.itemID === f.itemID) ?? null;
      out.localRowBefore = mine0b?.stored ?? null;
      out.localRowAtFallback = String(out.localRowBefore?.value || '').indexOf(fbPathTail) !== -1;
      out.preambleRetried = true;
    }
    if (!out.localRowAtFallback) throw new Error('the local row could not be reset to the opening paragraph: ' + JSON.stringify(out.localRowBefore));

    // --- The phone item: file as it stands, fixture item replaced, canonical. ---
    const cur = await grab();
    const heldAt = (cur.items.find((i) => i.id === FIXTURE_ID)?.stamp?.at) ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(state.phoneStampBase)) state.phoneStampBase = Date.now() + 3 * 60 * 60 * 1000;
    const k = state.phoneStampIndex = (state.phoneStampIndex ?? 0);
    state.phoneStampIndex = k + 1;
    let stampAt = Math.max(state.phoneStampBase + 1000 * k, Number.isFinite(heldAt) ? heldAt + 1000 : heldAt);
    out.craft = { replacedHeld: Number.isFinite(heldAt), stampAt, device: DEVICE, locatorChars: locator.length };
    const items = cur.items
      .filter((i) => i.id !== FIXTURE_ID)
      .concat([{ id: FIXTURE_ID, format: 'epub', publicationId: null, locator, anchor: { exact: a.exact, prefix: a.prefix || '', suffix: a.suffix || '' }, stamp: { at: stampAt, device: DEVICE } }])
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const body = JSON.stringify({ format: 'xujialiu-positions', version: 1, items });
    const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
    out.craft.putStatus = put.status;
    const verify = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    out.craft.putVerified = (await verify.text()) === body;
    if (!(put.status === 200 || put.status === 204) || !out.craft.putVerified) throw new Error('craft PUT/verify failed: status ' + put.status);

    // --- Switch on; its sync must adopt the phone item. The transports' gate
    // is webdavSwitchOn(webdav, 'syncPositions') = enabled && syncPositions,
    // so the folder switch (webdav.enabled, found OFF on this profile) is
    // raised for the check window and restored right after (settings.ts 605). ---
    p.setBoolPref(prefix + 'webdav.syncPositions', true);
    const folderBefore = { user: p.prefHasUserValue(prefix + 'webdav.enabled'), value: p.getBoolPref(prefix + 'webdav.enabled') };
    state.folderSwitchBefore = folderBefore;
    p.setBoolPref(prefix + 'webdav.enabled', true);
    const swStart = Date.now();
    let sw = null;
    while (Date.now() - swStart < 30000) {
      await sleep(600);
      const st = JSON.parse(await d.positionSync());
      sw = st;
      if (st.transport?.running === false && st.shared?.transport?.running === false
        && st.transport?.lastTrigger === 'switch-on' && st.transport?.lastOutcome === 'ok'
        && st.shared?.transport?.lastOutcome === 'ok') break;
    }
    out.switchOn = {
      own: { trigger: sw?.transport?.lastTrigger, outcome: sw?.transport?.lastOutcome, uploaded: sw?.transport?.uploaded },
      shared: { outcome: sw?.shared?.transport?.lastOutcome, remote: sw?.shared?.transport?.remoteItems, adopted: sw?.shared?.transport?.adopted, uploaded: sw?.shared?.transport?.uploaded },
      heldItem: (await grab()).items.find((i) => i.id === FIXTURE_ID) ? 'fixture item in file' : 'absent',
    };
    if (out.switchOn.shared.adopted !== 1) throw new Error('the switch-on sync did not adopt exactly 1 item: ' + JSON.stringify(out.switchOn.shared));

    // --- The real resume: trusted Shift+Space. ---
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(600); }
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(400);
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

    // Poll: the FIRST active segment after the press is the landing; keep
    // tracing for ~2 s (or until the unresolved toast shows) as evidence.
    const started = Date.now();
    let seg = null, segPoint = null, segOffset = null, segRef = null, segPointEnd = null, segOffsetEnd = null;
    const toasts = [];
    while (Date.now() - started < 20000) {
      const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
      const active = m?.activeSegment ?? null;
      const doc = reader?._iframeWindow ? waive(reader._iframeWindow).document : null;
      const toastEl = doc ? doc.getElementById('ztts-speed-toast') : null;
      if (toastEl && toastEl.style && toastEl.style.opacity === '1' && toastEl.textContent) {
        const text = String(toastEl.textContent);
        if (!toasts.length || toasts[toasts.length - 1].text !== text) toasts.push({ atMs: Date.now() - started, text: text.slice(0, 160) });
      }
      if (active && typeof active.text === 'string' && (!seg || active.text !== seg.text)) {
        const sp = Array.from(waive(active.position?.start) ?? []);
        const ep = Array.from(waive(active.position?.end) ?? []);
        const block = survey.blocks.find((b) => b.ref === sp.slice(0, -2).join('/'));
        const off = block && sp.length >= 2 ? (block.starts[sp[sp.length - 2]] ?? -1) + sp[sp.length - 1] : null;
        const offEnd = block && ep.length >= 2 ? (block.starts[ep[ep.length - 2]] ?? -1) + ep[ep.length - 1] : null;
        out.segmentTrace = out.segmentTrace || [];
        out.segmentTrace.push({ atMs: Date.now() - started, ref: sp.slice(0, -2).join('/'), offset: off, offsetEnd: offEnd, text: String(active.text).slice(0, 90) });
        if (!seg) { seg = { text: active.text }; segPoint = sp; segPointEnd = ep; segRef = sp.slice(0, -2).join('/'); segOffset = off; segOffsetEnd = offEnd; }
        if (seg && (toasts.length || Date.now() - started > 2500)) break;
      }
      await sleep(120);
    }
    out.landing = {
      segmentText: seg === null ? null : String(seg.text).slice(0, 120),
      segmentRef: segRef,
      segmentPoint: segPoint,
      segmentOffsetInBlock: segOffset,
      segmentPointEnd: segPointEnd,
      segmentOffsetEndInBlock: segOffsetEnd,
      expectedStartsWith: Zotero.ZoteroTTSRun.params.expectSegmentStartsWith ?? null,
      matchesExpectation: seg !== null && String(seg.text).startsWith(Zotero.ZoteroTTSRun.params.expectSegmentStartsWith ?? '\u0000never'),
      // The case's containment rule: the landing segment's own span must hold
      // the selected source start (params.expectedOffset) — how a joined short
      // reply is proven without inferring from displayed text.
      expectedOffset: typeof Zotero.ZoteroTTSRun.params.expectedOffset === 'number' ? Zotero.ZoteroTTSRun.params.expectedOffset : null,
      offsetContained: typeof Zotero.ZoteroTTSRun.params.expectedOffset === 'number' && segOffset !== null && segOffsetEnd !== null
        ? (segOffset <= Zotero.ZoteroTTSRun.params.expectedOffset && Zotero.ZoteroTTSRun.params.expectedOffset < segOffsetEnd)
        : null,
    };
    out.toast = toasts;
    out.newLines = (await linesNow()).slice(beforeCount);
    const sharedLine = out.newLines.find((l) => l.indexOf('shared position sync (resume)') !== -1) ?? null;
    const posLine = out.newLines.find((l) => l.indexOf('position sync (resume)') !== -1) ?? null;
    out.resumeSyncLines = { sharedLine, posLine };
    out.resumedLine = out.newLines.find((l) => l.indexOf('resumed from the shared position') !== -1) ?? null;
    out.notResolvedLine = out.newLines.find((l) => l.indexOf('not resolved') !== -1) ?? null;

    // The audio question, once more, while the landing session is up: full entry.
    try {
      const e = JSON.parse(await d.engine());
      const mine = (e.readers || []).find((r) => r.itemID === f.itemID) ?? null;
      out.audio = { audioState: mine?.audio?.state ?? null, sessionKeys: mine?.session ? Object.keys(mine.session) : null, playing: mine?.session?.playing ?? null, position: mine?.session?.position ?? null, voice: mine?.session?.voice ?? mine?.controller?.voice ?? null };
    } catch (e2) { out.audio = { error: String(e2).slice(0, 100) }; }

    // --- Stop the landing session; the row moves; suspend again. ---
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(3500);
    const position1 = JSON.parse(await d.position());
    const mine1 = (position1.readers || []).find((r) => r.itemID === f.itemID) ?? null;
    out.localRowAfter = mine1?.stored ?? null;
    out.stopped = !waive(reader._internalReader?._readAloudManager)?.active;
    p.setBoolPref(prefix + 'webdav.syncPositions', false);
    // The folder switch back to as found: value false and, when it held no
    // user value before this run, no user value again.
    p.setBoolPref(prefix + 'webdav.enabled', state.folderSwitchBefore?.value === true);
    if (state.folderSwitchBefore && !state.folderSwitchBefore.user) { try { p.clearUserPref(prefix + 'webdav.enabled'); } catch {} }
    out.folderSwitchRestored = p.prefHasUserValue(prefix + 'webdav.enabled') === state.folderSwitchBefore.user
      && p.getBoolPref(prefix + 'webdav.enabled') === state.folderSwitchBefore.value;
    out.settledAfter = await settle();
    try { if (host) host.minimize(); await sleep(400); } catch {}
    out.hostMinimized = host ? host.windowState === 2 : null;
    const wantOk = out.landing.offsetContained === true && out.landing.segmentRef === P.expectedBlockRef;
    out.expectedLogMatched = out.newLines.some(line => line.includes(P.expectedLog));
    const refusalOk = !P.expectedLog.includes('not resolved') || (out.notResolvedLine !== null && out.resumedLine === null && out.toast.length > 0);
    out.ok = out.settledAfter && out.stopped && out.folderSwitchRestored && wantOk && out.expectedLogMatched && refusalOk;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
    try {
      const p2 = Services.prefs;
      const prefix2 = 'extensions.zotero.zotero-tts.';
      const failedReader = (Zotero.Reader._readers || []).find(reader => reader.itemID === f?.itemID);
      if (failedReader?._internalReader?._readAloudManager?.active) failedReader._internalReader.toggleReadAloudPopup(false);
      p2.setBoolPref(prefix2 + 'webdav.enabled', false);
      p2.setBoolPref(prefix2 + 'webdav.syncPositions', false);
      const fb = Zotero.ZoteroTTSRun.state?.folderSwitchBefore;
      if (fb) {
        p2.setBoolPref(prefix2 + 'webdav.enabled', fb.value === true);
        if (!fb.user) { try { p2.clearUserPref(prefix2 + 'webdav.enabled'); } catch {} }
      }
    } catch {}
  }
  return JSON.stringify(out, null, 1);
})()
