// Case item 8 — a concurrent voice refresh cannot replace the explicit start
// (adapted from the retained red research probe r33-inject-voices-write.js).
// Each trial opens a COLD reader on the fixture (previous tab closed), so
// every start is a genuine initial segment preparation with fresh
// segmentPreparation() counters. Injected trials supply the first-Han SDT
// point directly and inject ONE applyPersistedVoices at the first
// _requestReadAloudSegments entry (the realistic mid-start memory-sync
// write). Evidence is the native setter/event trace (setSegments,
// consumeTargetPosition, capture, request entries), not polling, plus the
// diagnostic's started/coalesced/pending deltas. Wrappers are restored in a
// per-trial finally and their property descriptors/references compared.
// Expected on beta5, per injected trial: EXACTLY ONE native setSegments at
// the segment containing the Han point; one non-null target consumption;
// coalesced +1; started +1; pending false at the end.
(async () => {
  const out = { step: 'start-race', trials: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const survey = state.survey;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const p = Services.prefs;
  try {
    if (!f?.itemID || !survey) throw new Error('runs 20/21 first');
    // The first-Han point comes from the live survey, never hard-coded.
    const hanBlock = survey.blocks.find((b) => b.text.indexOf('前文你好后文。') === 0)
      ?? survey.blocks.find((b) => b.text.indexOf('你好') !== -1);
    if (!hanBlock) throw new Error('Han block missing from survey');
    const firstIdx = hanBlock.text.indexOf('你');
    if (firstIdx < 0) throw new Error('Han block has no Han text');
    const refNums = hanBlock.ref.split('/').map(Number);
    out.han = { blockRef: hanBlock.ref, firstIdx, text: hanBlock.text.slice(0, 40) };
    const targetStart = [...refNums, 0, firstIdx];
    const targetEnd = [...refNums, 0, firstIdx + 2];
    const containingTextPrefix = hanBlock.text.slice(0, hanBlock.text.indexOf('。') + 1);

    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const win = Zotero.getMainWindow();
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(800); }
    const d = Zotero.ZoteroTTS.diagnostics;
    const prep = async (itemID) => {
      const pp = JSON.parse(await d.segmentPreparation());
      return (pp.readers || []).find((r) => r.itemID === itemID)?.state ?? null;
    };
    const closeFixtureTab = async () => {
      const r = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
      if (!r) return false;
      try { const m = r._internalReader?._readAloudManager; if (m?.active) r._internalReader.toggleReadAloudPopup(false); } catch {}
      win.Zotero_Tabs.close(String(r.tabID));
      await sleep(2000);
      return !(Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID);
    };
    const openCold = async () => {
      await closeFixtureTab();
      let reader = await Zotero.Reader.open(f.itemID);
      const opened = Date.now();
      while (Date.now() - opened < 24000 && !(reader?._internalReader && reader?._internalReader?._readAloudManager)) {
        await sleep(700);
        reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID) || reader;
      }
      if (!(reader?._internalReader && reader?._internalReader?._readAloudManager)) throw new Error('cold reader not ready in 24 s');
      try { win.Zotero_Tabs.select(String(reader.tabID)); } catch {}
      await sleep(600);
      return reader;
    };
    const readPoint = (o) => {
      try {
        const w = waive(o);
        const s = w && w.position ? waive(w.position).start : (w && w.start ? waive(w.start) : null);
        return s ? Array.from(s).map(Number) : null;
      } catch (e) { return null; }
    };

    const runTrial = async (spec) => {
      const t = { name: spec.name, inject: spec.inject };
      const installs = [];
      let events = [];
      let T0 = 0;
      const ev = (name, detail) => events.push(Object.assign({ t: Math.round((performance.now() - T0) * 100) / 100, name }, detail));
      const install = (obj, name, onCall) => {
        const entry = { obj, name };
        try {
          entry.descBefore = Object.getOwnPropertyDescriptor(obj, name);
          entry.hadOwn = !!entry.descBefore;
          const orig = obj[name];
          if (typeof orig !== 'function') { entry.skipped = true; installs.push(entry); return entry; }
          entry.orig = orig;
          obj[name] = function (...args) { return onCall({ args, orig, self: this }); };
          entry.installed = true;
        } catch (e) { entry.error = String(e).slice(0, 60); }
        installs.push(entry);
        return entry;
      };
      try {
        const reader = await openCold();
        t.readerTabID = reader.tabID;
        t.countersBefore = await prep(f.itemID);
        const internal = reader._internalReader;
        const wInt = waive(internal);
        const wMgr = waive(internal._readAloudManager);
        let injected = false;
        let injectionError = null;
        install(wMgr, 'setSegments', ({ args, orig, self }) => {
          const [segments, bsi] = args;
          const detail = { bsi: Number(bsi) };
          try {
            const ws = waive(segments); const idx = Number(bsi);
            if (ws && idx >= 0 && idx < ws.length) {
              detail.point = readPoint(ws[idx]);
              detail.text = String(waive(ws[idx]).text ?? '').slice(0, 24);
              detail.segmentsLen = ws.length;
            }
          } catch (e) {}
          ev('setSegments', detail);
          return Reflect.apply(orig, self, args);
        });
        install(wMgr, 'consumeTargetPosition', ({ args, orig, self }) => {
          const ret = Reflect.apply(orig, self, args);
          let kind = 'null', start = null;
          try {
            if (ret) { const wr = waive(ret); const s = wr && wr.start ? waive(wr.start) : null; if (s) { kind = 'sdt'; start = Array.from(s).map(Number); } else kind = 'other'; }
          } catch (e) { kind = 'err'; }
          ev('consumeTarget', { kind, start });
          return ret;
        });
        install(wMgr, 'activate', ({ args, orig, self }) => { ev('activate', {}); return Reflect.apply(orig, self, args); });
        install(wMgr, 'applyPersistedVoices', ({ args, orig, self }) => { ev('applyPersistedVoices', {}); return Reflect.apply(orig, self, args); });
        install(wInt, '_requestReadAloudSegments', ({ args, orig, self }) => {
          ev('requestSegments-entry', { active: !!wMgr.active, segmentsNull: !wMgr._segments });
          if (spec.inject && !injected) {
            injected = true;
            try {
              ev('inject-applyPersistedVoices', {});
              Reflect.apply(wMgr.applyPersistedVoices, wMgr, [waive(wMgr._persistedVoices) || {}]);
            } catch (e) { injectionError = String(e).slice(0, 80); }
          }
          return Reflect.apply(orig, self, args);
        });
        install(wInt, '_captureReadAloudStart', ({ args, orig, self }) => {
          const ret = Reflect.apply(orig, self, args);
          let kind = 'null', start = null;
          try {
            if (ret) { const wr = waive(ret); const s = wr && wr.start ? waive(wr.start) : null; if (s) { kind = 'sdt'; start = Array.from(s).map(Number); } else kind = 'other'; }
          } catch (e) { kind = 'err'; }
          ev('capture', { kind, start });
          return ret;
        });
        t.wrappersInstalled = installs.filter((i) => i.installed).length;

        // The start: the first-Han SDT point, exactly as the resume delivers it.
        try { waive(reader._iframeWindow.document).notifyUserGestureActivation(); } catch (e) {}
        T0 = performance.now();
        events = [];
        ev('trial-start', { target: targetStart });
        let callThrew = null;
        try {
          internal.startReadAloudAtPosition(Components.utils.cloneInto({ start: targetStart, end: targetEnd }, reader._iframeWindow));
        } catch (e) { callThrew = String(e).slice(0, 100); }
        t.callThrew = callThrew;
        t.injectionError = injectionError;

        // Wait for activation, then for the native setter event (bounded).
        const a0 = performance.now();
        while (performance.now() - a0 < 12000 && !wMgr.active) await sleep(100);
        t.activationMs = wMgr.active ? Math.round(performance.now() - T0) : null;
        const s0 = performance.now();
        while (performance.now() - s0 < 5000 && !events.some((e) => e.name === 'setSegments')) await sleep(50);
        await sleep(800);
        const snaps = [];
        for (let k = 0; k < 3; k++) {
          await sleep(250);
          try { const a = wMgr.activeSegment; snaps.push({ point: a ? readPoint(a) : null, hasActive: !!a }); } catch (e) { snaps.push({ err: true }); }
        }
        t.snapshots = snaps;
        const rNow = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
        if (rNow) { try { rNow._internalReader.toggleReadAloudPopup(false); } catch (e) {} }
        await sleep(1200);
        t.stopped = !waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager)?.active;
        t.countersAfter = await prep(f.itemID);
        t.events = events;
        const setCalls = events.filter((e) => e.name === 'setSegments');
        const consumes = events.filter((e) => e.name === 'consumeTarget');
        const nonNull = consumes.filter((e) => e.kind === 'sdt');
        const seg = setCalls[0] ?? null;
        const segContainsTarget = !!seg && !!seg.point && seg.point.length >= 3
          && seg.point[0] === targetStart[0] && seg.point[1] === targetStart[1]
          && seg.point[2] <= targetStart[2] && (seg.point[2] + String(seg.text ?? '').length) > targetStart[2];
        t.verdict = {
          setSegmentsCount: setCalls.length,
          setSegmentsPoints: setCalls.map((c) => ({ bsi: c.bsi, point: c.point, text: c.text })),
          targetConsumesNonNull: nonNull.length,
          targetConsumesNull: consumes.filter((e) => e.kind === 'null').length,
          requestEntries: events.filter((e) => e.name === 'requestSegments-entry').length,
          segContainsTarget,
          startedDelta: (t.countersAfter?.started ?? null) - (t.countersBefore?.started ?? 0),
          coalescedDelta: (t.countersAfter?.coalesced ?? null) - (t.countersBefore?.coalesced ?? 0),
          pendingAfter: t.countersAfter?.pending ?? null,
          patched: t.countersAfter?.patched ?? null,
        };
        t.pass = spec.inject
          ? t.verdict.setSegmentsCount === 1 && t.verdict.segContainsTarget && t.verdict.targetConsumesNonNull === 1
            && t.verdict.coalescedDelta >= 1 && t.verdict.startedDelta === 1 && t.verdict.pendingAfter === false
          : t.verdict.setSegmentsCount === 1 && t.verdict.segContainsTarget
            && t.verdict.startedDelta === 1 && t.verdict.pendingAfter === false;
      } catch (e) {
        t.error = String(e && e.stack ? e.stack : e);
        t.pass = false;
      } finally {
        // Restore wrappers and compare descriptors/references — always.
        const residue = [];
        for (const entry of installs) {
          if (!entry.installed) continue;
          try {
            if (entry.hadOwn) entry.obj[entry.name] = entry.orig;
            else { try { delete entry.obj[entry.name]; } catch (e2) { residue.push(entry.name + ':delete-failed'); continue; } }
            const refOk = entry.hadOwn ? (entry.obj[entry.name] === entry.orig) : !Object.prototype.hasOwnProperty.call(entry.obj, entry.name);
            const descAfter = Object.getOwnPropertyDescriptor(entry.obj, entry.name);
            const fields = (dd) => dd ? [dd.writable, dd.enumerable, dd.configurable, typeof dd.value, dd.value === entry.orig] : null;
            const descOk = entry.hadOwn
              ? JSON.stringify([descAfter?.writable, descAfter?.enumerable, descAfter?.configurable]) === JSON.stringify([entry.descBefore?.writable, entry.descBefore?.enumerable, entry.descBefore?.configurable])
              : !descAfter;
            if (refOk && descOk) residue.length += 0; else residue.push(entry.name + ':' + (refOk ? '' : 'ref,') + (descOk ? '' : 'descriptor'));
          } catch (e) { residue.push(entry.name + ':' + String(e).slice(0, 40)); }
        }
        t.wrapperRestore = { checked: installs.filter((i) => i.installed).length, residue };
        if (!t.pass || residue.length) t.pass = t.pass === true && residue.length === 0 && !t.error;
      }
      return t;
    };

    // Close the pre-existing fixture session/tab; the trials each open cold.
    await closeFixtureTab();
    for (const spec of [{ name: 'inject-1', inject: true }, { name: 'inject-2', inject: true }, { name: 'inject-3', inject: true }, { name: 'control-unwrapped', inject: false }]) {
      out.trials.push(await runTrial(spec));
      if (!out.trials[out.trials.length - 1].pass && spec.inject) break; // stop at the first injected failure
    }
    const injected = out.trials.filter((t) => t.inject);
    out.ok = injected.length === 3 && injected.every((t) => t.pass === true)
      && out.trials.some((t) => t.name === 'control-unwrapped' && t.pass === true);
    try { if (host) host.minimize(); await sleep(300); } catch (e) {}
    out.hostMinimized = host ? host.windowState === 2 : null;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
    try { const h = Services.wm.getMostRecentWindow('navigator:browser'); if (h) h.minimize(); } catch (e2) {}
  }
  return JSON.stringify(out, null, 1);
})()
