// Case item 8, reader lifecycle: the segment-preparation patch must attach to
// a brand-new reader (cold open — hooks installed at startup, watchReader for
// new tabs) and survive a close/reopen. Two legs, both ending with the
// diagnostic counters for the fixture's fresh reader entry: cold open +
// one plain start (patched:true from the first observation, started +1, one
// native setSegments at the started block, pending false), then tab close +
// reopen + one plain start again. Wrappers (setSegments only) restored in
// finally with descriptor/reference comparison.
(async () => {
  const out = { step: 'reader-lifecycle', legs: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const survey = state.survey;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const d = Zotero.ZoteroTTS.diagnostics;
  try {
    if (!f?.itemID || !survey) throw new Error('runs 20/21 first');
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const win = Zotero.getMainWindow();
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(800); }
    const prep = async (itemID) => (JSON.parse(await d.segmentPreparation()).readers || []).find((r) => r.itemID === itemID)?.state ?? null;
    const fb = survey.blocks.find((b) => b.text.indexOf('This is the local fallback sentence.') === 0);
    const fbRef = Number(fb.ref.split('/')[0]);
    const firstDot = fb.text.indexOf('. ') + 1;
    const closeFixtureTab = async () => {
      const r = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
      if (!r) return true;
      try { const m = r._internalReader?._readAloudManager; if (m?.active) r._internalReader.toggleReadAloudPopup(false); } catch {}
      win.Zotero_Tabs.close(String(r.tabID));
      await sleep(2000);
      return !(Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID);
    };
    const openCold = async () => {
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

    const runLeg = async (name) => {
      const leg = { name };
      const installs = [];
      try {
        leg.tabClosedBefore = await closeFixtureTab();
        const reader = await openCold();
        leg.countersOnOpen = await prep(f.itemID);
        leg.patchedOnOpen = leg.countersOnOpen?.patched === true;
        leg.startedOnOpen = leg.countersOnOpen?.started ?? null;
        // One plain start at the fallback first sentence.
        const setCalls = [];
        const internal = reader._internalReader;
        const wMgr = waive(internal._readAloudManager);
        const entry = { obj: wMgr, name: 'setSegments' };
        entry.descBefore = Object.getOwnPropertyDescriptor(wMgr, 'setSegments');
        entry.hadOwn = !!entry.descBefore;
        entry.orig = wMgr.setSegments;
        wMgr.setSegments = function (...args) {
          try {
            const [segments, bsi] = args;
            const ws = waive(segments); const idx = Number(bsi);
            let point = null, text = null;
            if (ws && idx >= 0 && idx < ws.length) { const w = waive(ws[idx]); point = w && w.position ? Array.from(waive(w.position).start ?? []).map(Number) : null; text = String(w?.text ?? '').slice(0, 40); }
            setCalls.push({ bsi: idx, point, text });
          } catch (e) {}
          return Reflect.apply(entry.orig, this, args);
        };
        entry.installed = true;
        installs.push(entry);
        try { waive(reader._iframeWindow.document).notifyUserGestureActivation(); } catch (e) {}
        reader._internalReader.startReadAloudAtPosition(Components.utils.cloneInto({ start: [fbRef, 0, 0], end: [fbRef, 0, firstDot] }, reader._iframeWindow));
        const t0 = Date.now();
        let landed = null;
        while (Date.now() - t0 < 12000) {
          const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
          const active = m?.activeSegment ?? null;
          if (active && typeof active.text === 'string') {
            const sp = Array.from(waive(active.position?.start) ?? []);
            landed = { ref: sp.slice(0, -2).join('/'), point: sp.map(Number), text: String(active.text).slice(0, 40) };
            if (landed.ref === String(fbRef)) break;
          }
          await sleep(250);
        }
        leg.landing = landed;
        await sleep(600);
        const rNow = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
        if (rNow) { try { rNow._internalReader.toggleReadAloudPopup(false); } catch (e) {} }
        await sleep(1200);
        leg.countersAfter = await prep(f.itemID);
        leg.setSegments = setCalls;
        leg.startedDelta = (leg.countersAfter?.started ?? 0) - (leg.countersOnOpen?.started ?? 0);
        leg.pass = leg.patchedOnOpen && setCalls.length === 1 && leg.startedDelta === 1
          && leg.countersAfter?.pending === false && landed?.ref === String(fbRef);
      } catch (e) {
        leg.error = String(e && e.stack ? e.stack : e);
        leg.pass = false;
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
            if (!(refOk && descOk)) residue.push(entry.name);
          } catch (e) { residue.push(entry.name + ':' + String(e).slice(0, 40)); }
        }
        leg.wrapperRestore = { checked: installs.length, residue };
        if (leg.pass && residue.length) leg.pass = false;
      }
      return leg;
    };

    out.legs.push(await runLeg('cold-new-reader'));
    out.legs.push(await runLeg('close-reopen'));
    out.ok = out.legs.length === 2 && out.legs.every((l) => l.pass === true);
    out.fixtureTabLeftOpen = !!(Zotero.Reader._readers || []).some((x) => x.itemID === f.itemID);
    try { if (host) host.minimize(); await sleep(300); } catch (e) {}
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
    try { const h = Services.wm.getMostRecentWindow('navigator:browser'); if (h) h.minimize(); } catch (e2) {}
  }
  return JSON.stringify(out, null, 1);
})()
