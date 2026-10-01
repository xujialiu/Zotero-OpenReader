// Item 7 (issue #165, 1.16.4-beta5): a voice list that lands after its tab
// closed is planned for nobody. Imports <params.fixtureFile> fresh and opens
// it, then opens the player with toggleReadAloudPopup(true) -- with the
// provider catalog COLD (this run's in-place reinstall just reset it; 00/00b
// only write prefs and warm nothing) that open dispatches the getVoices
// listing, whose MiMo half took ~8.4 s live on 2026-10-01. NO catalog warm-up
// here anywhere (item 6's diagnostics.defaultVoice() must NOT run before this).
// ~<params.closeDelayMs> ms (default 1000, the brief's "about 1 s") after the
// popup open it closes the tab the x way (reader._window.Zotero_Tabs.close) --
// BEFORE the list lands -- then waits up to <params.waitMaxMs> (default 30000)
// for the answer in the debug store. A metered-voice guard polls the manager
// while the tab lives (this fixture is ours; a session that somehow starts is
// paused at once so MiMo is not read into).
// Expected (case item 7): lateResults.byMethod.getVoices up by 1; one
// 'late result dropped: getVoices answered after its reader window was gone'
// line; one 'voice list not planned: its reader is gone' line just before it;
// zero 'can't access dead object' attributable to zotero-tts after t0 (by
// content + timeStamp; Zotero's own reader.js:1758 at a close is its noise).
// No drop line = the list landed before the window died: close sooner and say
// so (the script reports the timings either way).
// params: fixtureFile (default 'fixture-a.pdf'), fixtureState (default 'a',
// so 04's control reopens this same item and 90 erases it), closeDelayMs,
// waitMaxMs. state: reads baseline; writes fixtures.<fixtureState>, item7.
(async () => {
  const out = { step: 'item7-voices-late' };
  const S = Zotero.ZoteroTTSRun.state;
  const Ci = Components.interfaces;
  const P = Zotero.ZoteroTTSRun.params;
  const fixtureFile = P.fixtureFile || 'fixture-a.pdf';
  const fixtureState = P.fixtureState || 'a';
  const closeDelayMs = Number(P.closeDelayMs) > 0 ? Number(P.closeDelayMs) : 1000;
  const waitMaxMs = Number(P.waitMaxMs) > 0 ? Number(P.waitMaxMs) : 30000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (!S.baseline) throw new Error('00-baseline-and-mute.js must run first');
    if (!S.fixtures) S.fixtures = {};

    // Fresh import (new item, no documentVoices record) -- same as item 6.
    const file = PathUtils.join(P.fixturesDir, fixtureFile);
    const title = 'ztts issue165 late-audio v7 ' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const item = await Zotero.Attachments.importFromFile({ file, title, libraryID: Zotero.Libraries.userLibraryID });
    S.fixtures[fixtureState] = { itemID: item.id, key: item.key, title };
    out.itemID = item.id;
    out.fixtureFile = fixtureFile;
    out.closeDelayPlannedMs = closeDelayMs;

    await Zotero.Reader.open(item.id);
    let r = null;
    const t0open = Date.now();
    while (Date.now() - t0open < 24000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === item.id) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader or read-aloud manager never appeared within 24 s');
    out.readerReadyMs = Date.now() - t0open;
    const ir = r._internalReader;
    await sleep(1500);

    const lateResultsBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenBefore = (await Zotero.Debug.get()).length;
    const t0 = Date.now();

    // Open the player. With the catalog cold the listing is dispatched by this
    // open and gates the manager's activation (active stayed false on 2026-10-01,
    // run 2) -- which is the window this item closes into.
    const openErr = await (async () => { try { await ir.toggleReadAloudPopup(true); return null; } catch (e) { return String(e); } })();
    out.popupOpenError = openErr;
    let mSnap = null;
    try { const m = ir._readAloudManager; mSnap = { active: m.active, paused: m.paused }; } catch (e) { mSnap = { error: String(e) }; }
    out.afterOpen = Object.assign({ atMs: Date.now() - t0 }, mSnap);

    // Close ~closeDelayMs after the open, the x way, before the list lands.
    const tabID = r.tabID;
    const win = r._window;
    setTimeout(() => {
      try { win.Zotero_Tabs.close(tabID); out.closedAtMs = Date.now() - t0; } catch (e) { out.closeError = String(e); }
    }, closeDelayMs);

    // While the tab lives: guard against a session reading MiMo into the air;
    // after the close the wrappers are dead -- every read is try/catch'd.
    let dead = false;
    const tGuard = setInterval(() => {
      if (dead) return;
      try {
        const m = ir._readAloudManager;
        if (m && m.active && m.paused === false) { m.pause(); out.guardPausedAtMs = Date.now() - t0; }
      } catch (e) { dead = true; clearInterval(tGuard); }
    }, 300);

    // Wait for the answer in the debug store (MiMo ~8.4 s live).
    let delta = '';
    const deadline = Date.now() + waitMaxMs;
    while (true) {
      delta = (await Zotero.Debug.get()).slice(debugLenBefore);
      if (/late result dropped: getVoices answered after its reader window was gone/.test(delta)) { out.dropLineSeenAfterMs = Date.now() - t0; break; }
      if (Date.now() > deadline) break;
      await sleep(500);
    }
    try { clearInterval(tGuard); } catch (_) {}
    out.closed = out.closedAtMs != null;
    out.guardPaused = out.guardPausedAtMs != null;

    out.notPlannedCount = (delta.match(/voice list not planned: its reader is gone/g) || []).length;
    out.dropLineCount = (delta.match(/late result dropped: getVoices answered after its reader window was gone/g) || []).length;
    const npIdx = delta.indexOf('voice list not planned: its reader is gone');
    const dropIdx = delta.indexOf('late result dropped: getVoices answered after its reader window was gone');
    out.notPlannedJustBeforeDrop = npIdx >= 0 && dropIdx > npIdx && (dropIdx - npIdx) < 200;
    out.notPlannedToDropChars = npIdx >= 0 && dropIdx > npIdx ? dropIdx - npIdx : null;
    const deadInStore = (delta.match(/can't access dead object/g) || []).length;
    out.deadObjectLinesInDebugDelta = deadInStore;
    const deltaLines = delta.split('\n').filter((l) => l.trim());
    out.debugDeltaLines = deltaLines.length;
    out.pluginLines = deltaLines.filter((l) => /zotero-tts/i.test(l)).slice(0, 10).map((l) => l.slice(0, 160));
    out.mimoLines = deltaLines.filter((l) => /mimo/i.test(l)).slice(0, 4).map((l) => l.slice(0, 160));

    const lateResultsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;
    const gvb = (lateResultsBefore.byMethod && lateResultsBefore.byMethod.getVoices) || 0;
    const gva = (lateResultsAfter.byMethod && lateResultsAfter.byMethod.getVoices) || 0;
    out.getVoicesRise = gva - gvb;
    out.lastDrops = (lateResultsAfter.last || []).slice(-3);

    // Console: dead-object entries after t0 (by content + timeStamp, never ring
    // length; 00's deadBaseline pair-match removes the pre-existing ones), and
    // each carries its sourceName/line/column so Zotero's own reader.js noise
    // is attributable. nsIScriptError timeStamp units vary -- normalize to ms.
    const t0ms = t0;
    const tsMs = (ts) => (ts > 1e14 ? Math.round(ts / 1000) : ts);
    const arr = Services.console.getMessageArray() || [];
    const baseline = (S.baseline && S.baseline.deadBaseline) || [];
    const isBaseline = (ts, col) => baseline.some((b) => b.timeStamp === ts && b.columnNumber === col);
    const newDead = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = String((se && se.errorMessage) || arr[i].message || '');
      if (!/can't access dead object/i.test(msg)) continue;
      const rawTs = se ? se.timeStamp : 0;
      const ms = tsMs(rawTs);
      if (ms && ms < t0ms - 5000) continue;
      if (isBaseline(rawTs, se && se.columnNumber)) continue;
      newDead.push({ timeStampMs: ms, sourceName: se && se.sourceName, lineNumber: se && se.lineNumber, columnNumber: se && se.columnNumber, fromPlugin: /zotero-tts/i.test(String((se && se.sourceName) || '') + msg) });
    }
    out.newDeadObjectEntries = newDead;
    out.newDeadFromPlugin = newDead.filter((d) => d.fromPlugin).length;

    // The reader is gone.
    let readerGone = true;
    const rs2 = Zotero.Reader._readers || [];
    for (let i = 0; i < rs2.length; i++) { try { if (rs2[i] && rs2[i].itemID === item.id) readerGone = false; } catch (_) {} }
    out.readerGone = readerGone;

    S.item7 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
