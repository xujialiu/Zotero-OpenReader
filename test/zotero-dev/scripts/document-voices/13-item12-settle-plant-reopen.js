(async () => {
  // Item 12 (issue #183), precondition: settled fixture (first popup open done),
  // then plant a manual record naming a Kokoro voice, point Kokoro at a closed
  // port, reopen the player. Expected: row selected null, active false, saved the Kokoro voice.
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const { itemID, key } = state.item12run.fixture;
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  if (!reader) throw new Error('fixture reader missing');
  const internal = reader._internalReader;
  const manager = () => internal._readAloudManager;
  const engine = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  // settle: open once, let the session activate (Kokoro still at its real server)
  const main = Zotero.getMainWindow();
  const winBefore = { windowState: main.windowState };
  if (main.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
  reader.focus?.(); reader._iframeWindow?.focus?.();
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
  internal.toggleReadAloudPopup(true);
  let active = false;
  for (let i = 0; i < 60; i++) { if (manager()?.active && manager()?._controller) { active = true; break; } await sleep(150); }
  let probe = null;
  try {
    const e1 = await engine();
    const row1 = (e1.readers || [])[0] ?? null;
    await sleep(500);
    const e2 = await engine();
    const row2 = (e2.readers || [])[0] ?? null;
    probe = {
      audioState1: row1?.audio?.state ?? row1?.audioState ?? null,
      audioState2: row2?.audio?.state ?? row2?.audioState ?? null,
      playbackTime1: row1?.session?.playbackTime ?? row1?.playbackTime ?? null,
      playbackTime2: row2?.session?.playbackTime ?? row2?.playbackTime ?? null,
    };
  } catch (e) { probe = { error: String(e) }; }
  const settleState = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null };
  if (!active) {
    const notice = reader._iframeWindow?.document?.getElementById('ztts-voice-notice')?.textContent
      || reader._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent || null;
    throw new Error('settle did not activate: ' + JSON.stringify({ settleState, notice, probe }));
  }
  // close the settle session
  internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 50; i++) { if (!manager()?.active) break; await sleep(150); }
  const settledClosed = !manager()?.active;
  // plant: manual record naming a Kokoro voice; pulse the change
  Services.prefs.setStringPref(P + 'documentVoices.user/' + key, JSON.stringify({ voice: { id: 'local::af_bella', lang: 'en' }, manual: true, ts: Date.now() }));
  Services.prefs.setStringPref(P + 'documentVoiceChanged', String(Number(Services.prefs.getStringPref(P + 'documentVoiceChanged', '0')) + 1));
  // Kokoro to a closed port
  const baseURLBefore = Services.prefs.getStringPref(P + 'local.baseURL');
  Services.prefs.setStringPref(P + 'local.baseURL', 'http://127.0.0.1:9');
  state.item12run.plant = { baseURLBefore, baseURLNow: 'http://127.0.0.1:9' };
  // reopen the player
  if (main.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
  internal.toggleReadAloudPopup(true);
  let frame = null;
  for (let i = 0; i < 60; i++) { frame = reader._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null; if (frame) break; await sleep(150); }
  await sleep(600);
  const notice = reader._iframeWindow?.document?.getElementById('ztts-voice-notice')?.textContent
    || reader._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent || null;
  const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row = docVoices.readers.find(r => r.key && r.key.endsWith('/' + key));
  const live = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null, controller: !!manager()?._controller };
  const savedId = typeof row?.saved === 'string' ? row.saved : (row?.saved?.id ?? row?.saved?.voice?.id ?? row?.saved ?? null);
  const ok = !!row && row.selected === null && row.active === false && savedId === 'local::af_bella';
  state.item12run.precondition = { notice, row, live, ok };
  if (!ok) throw new Error('item-12 precondition failed: ' + JSON.stringify({ row, live, notice }));
  return JSON.stringify({ winBefore, settleState, probe, settledClosed, planted: true, baseURLNow: 'http://127.0.0.1:9', notice, row, live, preconditionOk: ok }, null, 1);
})()
