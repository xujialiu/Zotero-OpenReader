// 194-01 — item 15, variant (a): read a compatible voice to the END of a two-sentence fixture,
// pick the provider's other voice: `ready` within ~3 s (not a lasting "Preparing"), then Play
// reads in the new voice from the start. The 130 s no-`Could not switch` window is 194-02.
// The picks wait for the tier's voices to be listed: a selectTier raced against the popup's
// first catalog listing once and the resolved pick was dropped (this run's first attempt).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const P = Zotero.ZoteroTTSRun.params;
  const title = 'ztts 2026-10-18 194a';

  // fresh import unless the prepared reader from this run is still open on voice A
  let reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === (S.vs194Items || {}).a);
  if (!reader) {
    const s = new Zotero.Search();
    s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
    s.addCondition('title', 'is', title);
    const old = await s.search();
    if (old.length) await Zotero.Items.erase(old);
    S.vs194Items = S.vs194Items || {};
    const item = await Zotero.Attachments.importFromFile({ file: P.fixture194a, libraryID: Zotero.Libraries.userLibraryID, title });
    S.vs194Items.a = item.id;
    await Zotero.Reader.open(item.id);
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    if (!reader) { out.error = 'reader not ready'; return JSON.stringify(out); }
    S.vs194Tab = reader.tabID;
    win.Zotero_Tabs.select(reader.tabID);
    await new Promise((r) => setTimeout(r, 500));
    reader._internalReader.toggleReadAloudPopup(true);
  }
  const m = reader._internalReader._readAloudManager;
  await new Promise((r) => setTimeout(r, 500));

  // voice A of the OpenAI Compatible section: wait for the tier's voices to be listed, then pick
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
  out.voicesListed = listed();
  if (m.selectedVoiceID !== 'compatible::stub-echo') {
    await m.selectTier('compatible');
    await m.selectVoice('compatible::stub-echo');
  }
  await new Promise((r) => setTimeout(r, 600));
  out.selectedA = { tier: m.selectedTier ?? null, voice: m.selectedVoiceID ?? null };
  if (m.selectedVoiceID !== 'compatible::stub-echo') { out.error = 'voice A not selected'; return JSON.stringify(out); }

  // play and read to the end: the manager sets its own paused on Complete; session.paused stays false (#194)
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }
  const sessionOf = async () => {
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === S.vs194Items.a);
    return e.readers?.[i]?.session ?? null;
  };
  // End of the document: the manager sets its own paused on Complete. On Zotero 10.0.3 the
  // Engine's session.paused then reads false (#194); this Zotero 11.0-beta.1's manager pauses the
  // controller too (session.paused true) — waitsForPlay = paused || halted holds either way.
  let endState = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 45000) {
    await new Promise((r) => setTimeout(r, 700));
    const cur = await sessionOf();
    if (m.active && m.paused === true && cur && cur.playing === false && cur.position === 0) {
      endState = { at: Date.now(), position: cur.position, voice: cur.voice, sessionPaused: cur.paused };
      break;
    }
  }
  out.endState = endState;
  if (!endState) {
    const cur = await sessionOf();
    out.endDiag = { active: m.active, mgrPaused: m.paused, session: cur ? { position: cur.position, paused: cur.paused, playing: cur.playing, error: cur.error ?? null, voice: cur.voice } : null };
    out.error = 'end state never reached (manager paused + session.paused false)';
    return JSON.stringify(out);
  }

  // pick B of the same provider
  const pickAt = Date.now();
  await m.selectVoice('compatible::stub-fox');
  let ready = null;
  const t3 = Date.now();
  while (Date.now() - t3 < 6000) {
    await new Promise((r) => setTimeout(r, 200));
    const vs = JSON.parse(await d.voiceSwitch());
    const ri = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === S.vs194Items.a);
    const h = vs.readers?.[ri]?.handoff ?? null;
    if (h && h.notice === 'ready') { ready = { afterMs: Date.now() - t3, pending: h.pending, stage: h.stage, notice: h.notice }; break; }
    if (h && h.notice === 'failed') { out.failed = h; break; }
  }
  out.ready = ready;
  if (!ready) { out.error = 'notice never turned ready within 6 s'; return JSON.stringify(out); }

  // Play: B reads from the start
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }
  let played = null;
  const t4 = Date.now();
  while (Date.now() - t4 < 10000) {
    await new Promise((r) => setTimeout(r, 300));
    const cur = await sessionOf();
    if (cur && cur.voice === 'compatible::stub-fox' && cur.playing) { played = { afterMs: Date.now() - t4, position: cur.position, voice: cur.voice }; break; }
  }
  out.playedInB = played;
  S.vs194aPickAt = pickAt;
  out.pass = !!(ready && ready.afterMs <= 3500 && played);
  return JSON.stringify(out);
})()
