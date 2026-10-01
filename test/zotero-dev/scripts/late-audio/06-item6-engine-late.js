// Item 6 (issue #165, 1.16.4-beta4): a late answer through the Engine reads
// nothing of the dead reader. Imports <params.fixtureFile> fresh (cold text ->
// a genuine MiMo round trip; a fresh item also reads readAloud.defaultVoice,
// NOT readAloud.memory, so 00b must have pointed both at mimo::mimo_default),
// opens it, waits for the manager and the reader iframe's readiness (this
// Zotero build precomputes no read-aloud segments on open), warms the
// provider's voice catalog through diagnostics.defaultVoice() (a fresh MiMo
// listing gates activation and took > 7 s live; a listing, not a read),
// restores + focuses the host (trusted input), then starts playback with ONE
// trusted Shift+Space through the TIP on the reader's iframe window (a
// script-started session's output stays suspended; the trusted press also
// supplies the user activation, §6). Activation can take seconds, so the tab
// close is anchored to the first observed in-flight Engine getAudio (polled
// from the press): ~<params.lateDelayMs> ms after THAT dispatch it closes the
// tab the x way (reader._window.Zotero_Tabs.close). Polls
// diagnostics.engine() for the fixture tab throughout, so "a request was in
// flight at the close" (store.requests / store.inflight) is measured, not
// assumed -- and the session's voice id is checked: anything without '::' (a
// Zotero-metered voice) pauses the session at once and fails the script. Then waits up to 10 s after the close for the
// Engine's drop line in the debug store.
// Expected: one 'late audio dropped: its reader window was gone' line per
// answer landing after the close; patches().lateResults UNCHANGED (the
// Engine's requests do not pass the window wrapper); zero 'can't access dead
// object' entries from zotero-tts.js after the close (content + timeStamp);
// reader gone from Zotero.Reader._readers; fixture absent from engine().
// The fixture item is NOT erased here -- 90-cleanup-restore.js does that.
// params: fixtureFile (default 'fixture-a.pdf'), fixtureState (default 'a'),
// lateDelayMs (default 250). state: reads baseline; writes
// fixtures.<fixtureState>, item6 (the measurements).
(async () => {
  const out = { step: 'item6-engine-late' };
  const S = Zotero.ZoteroTTSRun.state;
  const Ci = Components.interfaces;
  const P = Zotero.ZoteroTTSRun.params;
  const fixtureFile = P.fixtureFile || 'fixture-a.pdf';
  const fixtureState = P.fixtureState || 'a';
  const delayMs = Number(P.lateDelayMs) > 0 ? Number(P.lateDelayMs) : 250;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (!S.fixtures) throw new Error('00-baseline-and-mute.js must run first');

    // Fresh import: cold text for the plugin instance's cache, a new item with
    // no documentVoices record, so the session reads readAloud.defaultVoice.
    const file = PathUtils.join(P.fixturesDir, fixtureFile);
    const title = 'ztts issue165 late-audio ' + fixtureState.toUpperCase() + ' ' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const item = await Zotero.Attachments.importFromFile({ file, title, libraryID: Zotero.Libraries.userLibraryID });
    S.fixtures[fixtureState] = { itemID: item.id, key: item.key, title };
    out.itemID = item.id;
    out.fixtureFile = fixtureFile;
    out.delayPlannedMs = delayMs;

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
    const m = ir._readAloudManager;
    // The reader's iframe must be ready before the trusted press. This Zotero
    // build precomputes NO read-aloud segments on open (live, 2026-10-01
    // 13:38: neither m._segments nor _readAloudSegments exists on an idle
    // reader, owner's included) -- they materialize when a session starts, so
    // there is nothing else to wait for here.
    const tIframe0 = Date.now();
    let iframeReady = false;
    while (Date.now() - tIframe0 < 15000) {
      try {
        const d = r._iframeWindow && r._iframeWindow.document;
        if (d && d.readyState === 'complete' && d.body) { iframeReady = true; break; }
      } catch (_) {}
      await sleep(200);
    }
    out.iframeReady = iframeReady;
    if (!iframeReady) throw new Error('reader iframe never became ready within 15 s');
    await sleep(1500);

    const lateResultsBefore = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    const debugLenBefore = (await Zotero.Debug.get()).length;
    const host = Zotero.getMainWindow() || Services.wm.getMostRecentWindow('navigator:browser');

    // Warm the provider's voice catalog once: this session freshly enabled
    // MiMo, whose first getVoices listing gates the manager's activation and
    // answered in > 7 s live on this run's first attempt (the trusted press's
    // start died of it, and item 4's fixed 7 s wait caught the listing's own
    // late drop). diagnostics.defaultVoice() shares the one listing (issue
    // #32), so after it activation needs no listing and the trusted press
    // dispatches getAudio directly. A listing, not a synthesis read.
    const tList0 = Date.now();
    try {
      const listing = JSON.parse(await Zotero.ZoteroTTS.diagnostics.defaultVoice());
      out.listingMs = Date.now() - tList0;
      out.listingKeys = Object.keys(listing || {}).slice(0, 8);
    } catch (e) { out.listingError = String(e).slice(0, 120); }

    // Foreground for the trusted press; the fixture tab selected and focused.
    try { if (host.windowState === 2) { host.restore(); } } catch (e) { out.restoreError = String(e); }
    try { host.focus(); } catch (e) { out.focusError = String(e); }
    try { if (host.Zotero_Tabs && r.tabID) host.Zotero_Tabs.select(r.tabID); } catch (e) { out.selectError = String(e); }
    try { r.focus(); } catch (e) { out.readerFocusError = String(e); }
    await sleep(500);

    const tabID = r.tabID;
    const win = r._window;
    const rw = r._iframeWindow;

    // ONE trusted Shift+Space through the TIP (§6): Shift down, Space down
    // (shift), Space up, Shift up -- on the reader's own iframe window.
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: !!shiftKey });
    out.tipBegan = tip.beginInputTransactionForTests(rw);
    const tPress = Date.now();
    out.keydownShift = tip.keydown(ev('Shift', 'ShiftLeft', 16));
    out.keydownSpace = tip.keydown(ev(' ', 'Space', 32, true));
    out.keyupSpace = tip.keyup(ev(' ', 'Space', 32, true));
    out.keyupShift = tip.keyup(ev('Shift', 'ShiftLeft', 16));
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();

    // The trace helper. closeTimer is hoisted so the metered-voice guard can
    // cancel the close from inside a poll.
    let engineTrace = [];
    let closeTimer = null;
    const eng = async () => {
      try {
        const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
        let row = null;
        const list = all.readers || [];
        for (let i = 0; i < list.length; i++) if (Number(list[i].itemID) === Number(item.id)) { row = list[i]; break; }
        if (!row) return { present: false };
        const s = row.session || {};
        const store = s.store || {};
        const entry = { dt: Date.now() - tPress, present: true, playing: s.playing, ended: s.ended, voice: s.voice && s.voice.id ? String(s.voice.id).slice(0, 40) : JSON.stringify(s.voice ?? null).slice(0, 40), requests: store.requests, inflight: store.inflight, currentIndex: s.currentIndex, audio: row.audio && row.audio.state };
        // Metered-voice guard: a Zotero voice (no '::') must not keep reading.
        if (s.voice && s.voice.id && !String(s.voice.id).includes('::')) {
          try { m.pause(); } catch (e2) { try { ir.toggleReadAloudPopup(false); } catch (_) {} }
          if (closeTimer) clearTimeout(closeTimer);
          throw new Error('session took a Zotero-metered voice (' + s.voice.id + '); paused at once');
        }
        return entry;
      } catch (e) {
        if (/metered voice/.test(String(e))) throw e;
        return { dt: Date.now() - tPress, error: String(e).slice(0, 80) };
      }
    };

    // The trusted press is the only starter. Activation (a fresh provider
    // listing) can take seconds, so the close is anchored not to the press but
    // to the thing item 6 measures: the first Engine getAudio in flight.
    // delayMs (200-300 in the case) then runs from that dispatch.
    let dispatch = null;
    const tPoll0 = Date.now();
    while (Date.now() - tPoll0 < 25000) {
      const entry = await eng();
      engineTrace.push(entry);
      if (entry.present && entry.requests > 0 && entry.inflight > 0) { dispatch = entry; break; }
      await sleep(30);
    }
    out.pressToDispatchMs = dispatch ? dispatch.dt : null;
    if (!dispatch) throw new Error('no Engine getAudio dispatched within 25 s of the trusted press (trace kept)');

    const tDispatch = Date.now();
    closeTimer = setTimeout(() => {
      try {
        out.delayBeforeCloseMs = Date.now() - tDispatch;
        win.Zotero_Tabs.close(tabID);
        out.closed = true;
        out.closedAtMs = Date.now() - tPress;
      } catch (e) { out.closeError = String(e); }
    }, delayMs);

    while (Date.now() - tDispatch < delayMs + 600) {
      engineTrace.push(await eng());
      await sleep(40);
    }
    await new Promise((res) => { if (out.closed || out.closeError) res(); else { const j = setInterval(() => { if (out.closed || out.closeError) { clearInterval(j); res(); } }, 20); setTimeout(() => { clearInterval(j); res(); }, delayMs + 2000); } });
    engineTrace.push(await eng());
    out.trace = engineTrace.slice(0, 3).concat(engineTrace.length > 6 ? [{ omitted: engineTrace.length - 6 }] : []).concat(engineTrace.slice(-3));
    out.traceFull = engineTrace.length;
    // The close-moment evidence: the last entry at or before the close.
    const atClose = engineTrace.filter((e) => e.dt <= (out.delayBeforeCloseMs ?? 0) + (out.pressToDispatchMs ?? 0) && e.present);
    out.atClose = atClose.length ? atClose[atClose.length - 1] : null;
    out.sessionAppeared = engineTrace.some((e) => e.present && (e.playing || e.ended || e.requests > 0 || e.voice));

    // Wait up to 20 s after the close for the Engine's drop line (MiMo's
    // synthesis is seconds; the line appears when the answer lands).
    let delta = '';
    const deadline = Date.now() + 20000;
    while (true) {
      delta = (await Zotero.Debug.get()).slice(debugLenBefore);
      if (/late audio dropped: its reader window was gone/.test(delta)) { out.dropLineSeenAfterMs = Date.now() - tPress; break; }
      if (Date.now() > deadline) break;
      await sleep(500);
    }
    out.dropLineCount = (delta.match(/late audio dropped: its reader window was gone/g) || []).length;
    const deltaLines = delta.split('\n').filter((l) => l.trim());
    out.debugDeltaLines = deltaLines.length;
    out.mimoLines = deltaLines.filter((l) => /mimo/i.test(l)).slice(0, 4).map((l) => l.slice(0, 160));
    out.anyWindowWrapperLateLine = (delta.match(/late result dropped:/g) || []).length;

    const lateResultsAfter = JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults;
    out.lateResultsBefore = lateResultsBefore;
    out.lateResultsAfter = lateResultsAfter;
    out.droppedRise = lateResultsAfter.dropped - lateResultsBefore.dropped;
    out.lastDropCount = (lateResultsAfter.last || []).length;

    // Console: dead-object entries newer than the press, and anything naming
    // the plugin, by content + timeStamp (never ring length).
    const arr = Services.console.getMessageArray() || [];
    const baseline = (S.baseline && S.baseline.deadBaseline) || [];
    const isBaseline = (ts, col) => baseline.some((b) => b.timeStamp === ts && b.columnNumber === col);
    const newDead = [];
    const newPlugin = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = String((se && se.errorMessage) || arr[i].message || '');
      const ts = se ? se.timeStamp : 0;
      if (ts < tPress || isBaseline(ts, se && se.columnNumber)) continue;
      if (/can't access dead object/i.test(msg)) newDead.push({ timeStamp: ts, sourceName: se && se.sourceName, lineNumber: se && se.lineNumber, columnNumber: se && se.columnNumber, fromPlugin: /zotero-tts/i.test(String((se && (se.sourceName || '')) + msg)) });
      else if (/zotero-tts/i.test(msg + String((se && se.sourceName) || ''))) newPlugin.push({ timeStamp: ts, message: msg.slice(0, 140), sourceName: se && se.sourceName });
    }
    out.newDeadObjectEntries = newDead;
    out.newDeadFromPlugin = newDead.filter((d) => d.fromPlugin).length;
    out.newPluginConsoleEntries = newPlugin.slice(0, 6);

    // The reader is gone; the tab closed.
    let readerGone = true;
    const rs2 = Zotero.Reader._readers || [];
    for (let i = 0; i < rs2.length; i++) { try { if (rs2[i] && rs2[i].itemID === item.id) readerGone = false; } catch (_) {} }
    out.readerGone = readerGone;
    try {
      const engAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      out.fixtureInEngineAfter = (engAfter.readers || []).some((row) => Number(row.itemID) === Number(item.id));
    } catch (e) { out.engineAfterError = String(e).slice(0, 80); }

    S.item6 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
