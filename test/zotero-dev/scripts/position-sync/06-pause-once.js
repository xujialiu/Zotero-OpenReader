// 6.11 part 2 + the audio-activation fix: a chrome-driven popup start leaves
// the reader's AudioContext suspended (no user activation), so the iframe's
// document is notified of a user gesture, then the session pauses once and
// resumes through the plugin's own funnel. Evidence: one `pause` sync per
// transport, then stable; after the resume the playbackTime really advances.
(async () => {
  const out = { steps: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const A = state.readerA;
  const stats = async () => {
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    return {
      p: { syncs: pos.transport?.syncs, trigger: pos.transport?.lastTrigger, outcome: pos.transport?.lastOutcome, running: !!pos.transport?.running },
      s: { syncs: pos.shared?.transport?.syncs, trigger: pos.shared?.transport?.lastTrigger, outcome: pos.shared?.transport?.lastOutcome, running: !!pos.shared?.transport?.running },
    };
  };
  const eng = async () => {
    const e = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    return e.readers.find((r) => r.itemID === A.itemID) ?? null;
  };
  try {
    const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === A.itemID);
    if (!reader) throw new Error('reader A not found');
    const mgr = reader._internalReader._readAloudManager;
    out.before = { active: mgr.active, paused: mgr.paused };
    const before = await stats();
    out.beforeCounts = before;

    // The gesture: the same one a trusted key press establishes.
    const doc = reader._iframeWindow?.document;
    out.gestureAvailable = typeof doc?.notifyUserGestureActivation === 'function';
    doc?.notifyUserGestureActivation?.();

    // One real pause of the speaking reader.
    reader._internalReader.toggleReadAloudPaused();
    let pauseAt = null;
    const started = Date.now();
    while (Date.now() - started < 8000) {
      await Zotero.Promise.delay(150);
      const s = await stats();
      const gained = (s.p.syncs - before.p.syncs) + (s.s.syncs - before.s.syncs);
      if (!s.p.running && !s.s.running && gained >= 2) { pauseAt = { ms: Date.now() - started, stats: s }; break; }
    }
    out.pause = pauseAt
      ? { settledMs: pauseAt.ms, pTrigger: pauseAt.stats.p.trigger, sTrigger: pauseAt.stats.s.trigger, pOutcome: pauseAt.stats.p.outcome, sOutcome: pauseAt.stats.s.outcome,
          pauseSyncsGainedP: pauseAt.stats.p.syncs - before.p.syncs, pauseSyncsGainedS: pauseAt.stats.s.syncs - before.s.syncs }
      : { timeout: true };
    out.pausedAfterPause = { active: mgr.active, paused: mgr.paused };

    // Two quiet seconds: no further pause syncs may appear.
    await Zotero.Promise.delay(2000);
    const after2s = await stats();
    out.stableAfter2s = {
      pSyncs: after2s.p.syncs, sSyncs: after2s.s.syncs,
      gainedP: after2s.p.syncs - (pauseAt ? pauseAt.stats.p.syncs : before.p.syncs),
      gainedS: after2s.s.syncs - (pauseAt ? pauseAt.stats.s.syncs : before.s.syncs),
    };

    // Resume through the funnel (the EPUB pull runs first), then the audio probe.
    reader._internalReader.toggleReadAloudPaused();
    await Zotero.Promise.delay(2500);
    const e1 = await eng();
    await Zotero.Promise.delay(900);
    const e2 = await eng();
    await Zotero.Promise.delay(900);
    const e3 = await eng();
    out.audioAfterResume = [
      { pos: e1?.session?.position, pt: e1?.session?.playbackTime, audio: e1?.audio?.state, buffering: e1?.session?.buffering },
      { pos: e2?.session?.position, pt: e2?.session?.playbackTime, audio: e2?.audio?.state },
      { pos: e3?.session?.position, pt: e3?.session?.playbackTime, audio: e3?.audio?.state },
    ];
    out.audioMoving = out.audioAfterResume.some((s, i) => i > 0 && typeof s.pt === 'number' && s.pt > out.audioAfterResume[0].pt);
    out.resumed = { active: mgr.active, paused: mgr.paused };
    const final = await stats();
    out.finalCounts = final;
    out.resumeTriggers = { pTrigger: final.p.trigger, sTrigger: final.s.trigger };
    out.ok = !!pauseAt && out.stableAfter2s.gainedP === 0 && out.stableAfter2s.gainedS === 0 && out.audioMoving && out.resumed.active && !out.resumed.paused;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
