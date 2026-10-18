// 196-02 — item 16, variant (b) setup: hold A's first request 20 s (stub delay), pick B, Pause/Play
// so B takes the sentence, then RETURN while the request is still held. The tester flips the stub to
// fail (speech_mode fail + match stub-echo) while it is in flight; 196-03 checks the dropped answer.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const P = Zotero.ZoteroTTSRun.params;
  const title = 'ztts 2026-10-18 196g';

  const s = new Zotero.Search();
  s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
  s.addCondition('title', 'is', title);
  const old = await s.search();
  if (old.length) await Zotero.Items.erase(old);
  S.vs196Items = S.vs196Items || {};
  const item = await Zotero.Attachments.importFromFile({ file: P.fixture196g, libraryID: Zotero.Libraries.userLibraryID, title });
  S.vs196Items.g = item.id;

  await Zotero.Reader.open(item.id);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader) { out.error = 'reader not ready'; return JSON.stringify(out); }
  S.vs196bTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 800));

  const m = reader._internalReader._readAloudManager;
  // wait for the compatible tier's voices to be listed before picking (the listing races a pick)
  const listed = () => {
    const voices = m.allVoices;
    const n = Number(voices?.length) || 0;
    for (let i = 0; i < n; i++) {
      const v = Components.utils.waiveXrays(voices[i]);
      if (typeof v?.id === 'string' && v.id.startsWith('compatible::')) return true;
    }
    return false;
  };
  const tl0 = Date.now();
  while (!listed() && Date.now() - tl0 < 12000) await new Promise((r) => setTimeout(r, 400));
  // Deterministic pick: pause first, pick while paused (the native path re-applies on Play).
  // A pick while playing arms a Handoff whose boundary needs a live audio clock, which this
  // environment's rebuilt contexts keep suspending.
  m.pause();
  await new Promise((r) => setTimeout(r, 500));
  if (m.selectedVoiceID !== 'compatible::stub-echo') {
    await m.selectTier('compatible');
    await m.selectVoice('compatible::stub-echo');
  }
  const sessionOf = async () => {
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === item.id);
    return { session: e.readers?.[i]?.session ?? null, stats: e.readers?.[i]?.stats ?? null };
  };
  const tA = Date.now();
  let aOwns = null;
  while (Date.now() - tA < 20000) {
    const cur = (await sessionOf()).session;
    if (cur && cur.voice === 'compatible::stub-echo') { aOwns = { afterMs: Date.now() - tA }; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  out.aOwns = aOwns;
  if (!aOwns) { out.error = 'voice A never took the session'; return JSON.stringify(out); }
  // a context created under the autoplay gate stays suspended: the clock never runs and a
  // handoff finds no boundary — pause, gesture, play again to resume it
  try {
    const a0 = (await sessionOf()).audio;
    if (a0 && a0.state !== 'running') {
      try { m.pause(); } catch (x) {}
      await new Promise((r) => setTimeout(r, 400));
      try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (x) {}
      await new Promise((r) => setTimeout(r, 900));
    }
    out.audioState = (await sessionOf()).audio ? (await sessionOf()).audio.state : null;
  } catch (e) { out.audioGateErr = String(e); }
  const playAt = Date.now();
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }

  const st = await sessionOf();
  out.armed = { playAt, lateAnswers: st.stats ? st.stats.lateAnswers : null };
  S.vs196bLateAtArm = out.armed.lateAnswers;
  const tPlay = Date.now();
  while (Date.now() - tPlay < 15000) {
    const cur = (await sessionOf()).session;
    if (cur && cur.voice === 'compatible::stub-echo' && cur.playing && cur.playbackTime > 0.3) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  // deterministic takeover: pause, pick B while paused (native restart on Play), play -> B owns
  m.pause();
  await new Promise((r) => setTimeout(r, 500));
  await m.selectVoice('compatible::stub-fox');
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError2 = String(e); }
  let bPlaying = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 12000) {
    await new Promise((r) => setTimeout(r, 300));
    const cur = (await sessionOf()).session;
    if (cur && cur.voice === 'compatible::stub-fox' && cur.playing && cur.playbackTime > 0.2) { bPlaying = { afterMs: Date.now() - t2, pt: cur.playbackTime }; break; }
  }
  out.bPlaying = bPlaying;
  out.holdDeadline = playAt + 20000;
  out.now = Date.now();
  S.vs196bArmAt = playAt;
  // return with the request still held; the tester flips the stub to fail now
  S.vs196bArmed = true;
  out.pass = !!bPlaying;
  return JSON.stringify(out);
})()
