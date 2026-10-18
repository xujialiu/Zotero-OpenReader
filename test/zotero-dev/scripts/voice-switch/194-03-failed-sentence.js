// 194-03 — item 15, variant (b): a FAILED sentence. The stub refuses voice A's request for the
// second sentence (speech_mode fail + text match, set from the tester's side before this runs);
// sentence one plays, the refusal at sentence two shows (Playback failed notice, manager paused by
// Error, session error set). The pick itself is 194-03b, after the tester flips the stub to ok.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const P = Zotero.ZoteroTTSRun.params;
  const title = 'ztts 2026-10-18 194b';

  const s = new Zotero.Search();
  s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
  s.addCondition('title', 'is', title);
  const old = await s.search();
  if (old.length) await Zotero.Items.erase(old);
  S.vs194Items = S.vs194Items || {};
  const item = await Zotero.Attachments.importFromFile({ file: P.fixture194b, libraryID: Zotero.Libraries.userLibraryID, title });
  S.vs194Items.b = item.id;

  await Zotero.Reader.open(item.id);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader) { out.error = 'reader not ready'; return JSON.stringify(out); }
  S.vs194bTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 800));

  const m = reader._internalReader._readAloudManager;
  await m.selectTier('compatible');
  await m.selectVoice('compatible::stub-echo');
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }

  const sessionOf = async () => {
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === item.id);
    return { session: e.readers?.[i]?.session ?? null };
  };
  // wait for the error state: manager paused (by Error), session error set
  let errState = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    await new Promise((r) => setTimeout(r, 500));
    const mgr = reader._internalReader._readAloudManager;
    const cur = (await sessionOf()).session;
    if (cur && (cur.error || (mgr.paused === true && cur.playing === false && cur.position >= 1))) {
      errState = { afterMs: Date.now() - t1, mgrPaused: mgr.paused, position: cur.position, error: cur.error ?? null, playing: cur.playing };
      break;
    }
  }
  out.errState = errState;
  if (!errState) {
    const cur = (await sessionOf()).session;
    const mgr = reader._internalReader._readAloudManager;
    out.errDiag = { active: mgr.active, mgrPaused: mgr.paused, session: cur ? { position: cur.position, playing: cur.playing, paused: cur.paused, error: cur.error ?? null, buffering: cur.buffering } : null };
    out.error = 'failure state never showed within 30 s';
    return JSON.stringify(out);
  }
  // the failure notice element (Playback failed...), while it is up
  const el = reader._iframeWindow.document.getElementById('ztts-playback-notice');
  out.playbackNotice = el ? String(el.textContent).slice(0, 120) : null;
  out.pass = true;
  return JSON.stringify(out);
})()
