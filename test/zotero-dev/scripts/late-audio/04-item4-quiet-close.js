// Item 4 (control): a quiet close. Reuses fixture-a's EXISTING item
// (state.fixtures.a). Reopens it, opens the popup then closes it again at once
// (toggleReadAloudPopup(false) right after (true)), then waits -- at least 5 s
// AND until the fixture's Engine row reports store.inflight == 0 (bounded 30
// s) -- BEFORE closing the tab, so nothing is in flight when Zotero_Tabs.close
// actually runs. The inflight==0 condition replaces run of 2026-09-16's fixed
// 7 s: with Xiaomi MiMo (00b), the popup open fires a getVoices listing whose
// answer took > 7 s live (2026-10-01, run 2026-10-01-1.16.4-beta4-late-audio:
// the fixed wait closed the tab with that listing still in flight and the
// window wrapper dropped it -- droppedRise 1 byMethod.getVoices -- the exact
// opposite of this control's intent), so the wait is now measured, not
// assumed. Expected: dropped unchanged, no "late result dropped" line, no
// "late audio dropped" Engine line, no error.
// params: none. state: reads baseline, fixtures.a; writes item4.
(async () => {
  const out = { step: 'item4-quiet-close' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fa = S.fixtures && S.fixtures.a;
    if (!fa || fa.itemID == null) throw new Error('state.fixtures.a is missing -- item 1 must run first');
    const itemID = fa.itemID;
    out.itemID = itemID;

    await Zotero.Reader.open(itemID);
    let r = null;
    const t0open = Date.now();
    while (Date.now() - t0open < 24000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader or read-aloud manager never appeared for item ' + itemID);
    out.readerReadyMs = Date.now() - t0open;

    const ir = r._internalReader;
    const m = ir._readAloudManager;
    const lateResultsBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenBefore = (await Zotero.Debug.get()).length;

    const t0 = Date.now();
    await ir.toggleReadAloudPopup(true);
    out.afterOpen = { active: m.active, paused: m.paused };
    ir.toggleReadAloudPopup(false);
    out.popupClosedAtMs = Date.now() - t0;

    // Quiet means measured quiet: >= 5 s AND no Engine request in flight.
    let inflight = null;
    const tSettle0 = Date.now();
    while (Date.now() - tSettle0 < 30000) {
      await sleep(400);
      try {
        const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
        let row = null;
        const list = eng.readers || [];
        for (let i = 0; i < list.length; i++) if (Number(list[i].itemID) === Number(itemID)) { row = list[i]; break; }
        const store = row && row.session && row.session.store;
        inflight = store && store.inflight != null ? store.inflight : 0;
      } catch (_) { inflight = null; }
      if (Date.now() - t0 >= 5000 && inflight === 0) break;
    }
    out.waitedMs = Date.now() - t0;
    out.inflightAtClose = inflight;

    r._window.Zotero_Tabs.close(r.tabID);
    out.closedAtMs = Date.now() - t0;

    await sleep(2000);

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;

    const debugFull = await Zotero.Debug.get();
    const delta = debugFull.slice(debugLenBefore);
    out.dropLines = (delta.match(/late (result|failure) dropped: \S+ answered after its reader window was gone|late audio dropped: its reader window was gone/g) || []);

    out.readersStillOpenForItem = (Zotero.Reader._readers || []).some((x) => x.itemID === itemID);
    S.item4 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
