// The known older local position (case preamble): the fixture session started
// at the opening paragraph's first sentence through Zotero's own
// startReadAloudAtPosition (the SDT position built from the live survey's
// block ref), observed, stopped — the row the refusals must fall back to.
// Baseline audio probe inside: engine() read twice ~600 ms apart; a session
// whose audio is frozen is reported, not silently treated as playback.
(async () => {
  const out = { step: 'local-position' };
  const state = Zotero.ZoteroTTSRun.state;
  const f = state.fixture;
  const survey = state.survey;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const p = Services.prefs;
  const d = Zotero.ZoteroTTS.diagnostics;
  try {
    if (!f?.itemID) throw new Error('run 20 first');
    if (!survey) throw new Error('run 21 first');
    out.volume = p.getIntPref('extensions.zotero.zotero-tts.readAloud.volume');
    if (out.volume !== 0) throw new Error('volume is not 0 — run 10 first');
    out.memoryIsFreeLocal = (() => { try { const m = JSON.parse(String(p.getStringPref('extensions.zotero.zotero-tts.readAloud.memory') || '{}')); const id = m?.voice?.id ?? ''; return id.indexOf('system::') === 0 || id.indexOf('local::') === 0; } catch { return false; } })();

    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host?.windowState === 2) { try { host.restore(); } catch {} await sleep(800); }
    const win = Zotero.getMainWindow();
    let reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    if (!reader) throw new Error('fixture reader gone');
    win.Zotero_Tabs.select(String(reader.tabID));
    win.focus();
    await sleep(600);

    const fb = survey.blocks.find((b) => b.text.startsWith('This is the local fallback sentence.'));
    if (!fb) throw new Error('fallback block missing from survey');
    const fallbackRef = fb.ref.split('/').map(Number);
    const firstDot = fb.text.indexOf('. ') + 1;
    out.fallbackFirstSentence = fb.text.slice(0, firstDot);
    // Reset: any active fixture session closes first.
    const m0 = waive(reader._internalReader._readAloudManager);
    if (m0?.active) { reader._internalReader.toggleReadAloudPopup(false); await sleep(1500); }
    const sdtPos = { start: [...fallbackRef, 0, 0], end: [...fallbackRef, 0, firstDot] };
    const iframe = waive(reader._iframeWindow);
    reader._internalReader.startReadAloudAtPosition(Components.utils.cloneInto(sdtPos, iframe));
    const started = Date.now();
    let seg = null, segRef = null;
    while (Date.now() - started < 20000) {
      const m = waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager);
      const active = m?.activeSegment ?? null;
      if (active && typeof active.text === 'string') {
        seg = active.text;
        const sp = Array.from(waive(active.position?.start) ?? []);
        segRef = sp.slice(0, -2).join('/');
        if (segRef === fb.ref) break;
      }
      await sleep(250);
    }
    out.startedSegmentRef = segRef;
    out.startedSegmentText = seg === null ? null : String(seg).slice(0, 80);
    out.sessionActive = !!waive((Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID)?._internalReader?._readAloudManager)?.active;

    // The audio probe: engine() read twice ~500 ms apart, ~1 s after the
    // session is up (an immediate read can still see the context before its
    // first Play). Short on purpose: the row below must not drift past the
    // opening paragraph while the probe runs.
    await sleep(1000);
    const e1 = JSON.parse(await d.engine());
    const mine1 = (e1.readers || []).find((r) => r.itemID === f.itemID) ?? null;
    await sleep(500);
    const e2 = JSON.parse(await d.engine());
    const mine2 = (e2.readers || []).find((r) => r.itemID === f.itemID) ?? null;
    out.audio = {
      state1: mine1?.audio?.state ?? mine1?.audioState ?? null,
      state2: mine2?.audio?.state ?? mine2?.audioState ?? null,
      playbackTime1: mine1?.playbackTime ?? mine1?.session?.playbackTime ?? null,
      playbackTime2: mine2?.playbackTime ?? mine2?.session?.playbackTime ?? null,
      voice: mine1?.voice ?? mine1?.selectedVoiceID ?? null,
      engineKeys: mine1 ? Object.keys(mine1) : null,
    };
    out.audio.advancing = out.audio.state2 === 'running' && out.audio.playbackTime2 !== out.audio.playbackTime1;

    // Stop as soon as the fallback segment was observed: the reading must
    // not drift past the opening paragraph before the close capture runs.
    reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
    reader._internalReader.toggleReadAloudPopup(false);
    await sleep(1200);
    out.stopped = !waive(reader._internalReader?._readAloudManager)?.active;

    const position = JSON.parse(await d.position());
    const mine = (position.readers || []).find((r) => r.itemID === f.itemID) ?? null;
    out.stored = mine?.stored ?? null;
    const storedPos = mine?.stored?.pos ?? null;
    // The row is a FragmentSelector CFI: the fixture's opening paragraph is
    // the block at /4/4 — look for its path in the CFI value.
    out.storedInFallback = String(mine?.stored?.value || '').includes(fb.path);
    state.localRow = mine?.stored ?? null;
    try { if (host) host.minimize(); await sleep(400); } catch {}
    out.hostMinimized = host ? host.windowState === 2 : null;
    out.ok = out.storedInFallback;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
