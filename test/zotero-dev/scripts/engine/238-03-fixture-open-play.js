// Issue #238: a fresh fixture-a.pdf copy, opened and playing with a plugin
// voice (the memory's: a free System voice), and the mechanism check on that
// live reader -- the controller the manager holds carries clearFailures, and
// it is the Engine's (diagnostics.engine() controller.ours / live).
// The popup open starts playback at once, so the voice is checked the moment
// the manager is active: an id without "::" (a metered Zotero voice) is paused
// and the script stops. Volume is already 0 (238-01). Nothing here calls
// play() or togglePaused(); the first start is the popup's own.
// params: label (default 'A'), fixtureFile (default 'fixture-a.pdf'), tag.
// state: reads baseline238; writes fixtures[label] ({ itemID, key, title,
// tabID }), mechanism238[label]; leaves the reader open and playing.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const label = P.label || 'A';
  const out = { step: '238-03-fixture-open-play', label, at: new Date().toISOString() };
  S.fixtures = S.fixtures || {};
  S.mechanism238 = S.mechanism238 || {};

  // The voice the popup will start with must be a plugin voice: refuse otherwise (credits are the owner's)
  const memId = (() => { try { return JSON.parse(S.baseline238.memory.value).voice.id; } catch (e) { return null; } })();
  if (!(typeof memId === 'string' && memId.includes('::'))) throw new Error('readAloud.memory is not a plugin voice; refusing to open the popup');

  // --- import the fixture copy
  const file = PathUtils.join(P.fixturesDir, P.fixtureFile || 'fixture-a.pdf');
  const title = `ztts-238 ${P.tag || '2026-11-02'} ${label}`;
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  const fx = { itemID: item.id, key: item.key, title: item.getField('title') };
  S.fixtures[label] = fx;
  out.fixture = fx;

  // --- open it; poll for the internal reader and the manager (<= 7 s polls, ~24 s ceiling)
  await Zotero.Reader.open(fx.itemID);
  let r = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    r = (Zotero.Reader._readers || []).find((x) => x.itemID === fx.itemID) || null;
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader/_readAloudManager never appeared');
  out.readerReadyMs = Date.now() - t0;
  fx.tabID = r.tabID;
  const win = r._window;
  out.selectedTabIsFixture = win.Zotero_Tabs.selectedID === r.tabID;
  out.windowState = win.windowState;
  const ir = r._internalReader;
  const m = ir._readAloudManager;
  out.before = { active: m.active, paused: m.paused };

  // The popup's tab must be the selected one; wait for the view and the player's page to exist
  for (let i = 0; i < 40 && !(ir._primaryView && ir._primaryView._iframeWindow && ir._primaryView.initialized); i++) await sleep(250);
  out.viewInitialized = !!(ir._primaryView && ir._primaryView.initialized);

  // --- start: the popup open (a script-started session; autoplay is the Engine's job, engine item 23e)
  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);
  const tA = Date.now();
  while (Date.now() - tA < 30000 && !m.active) await sleep(40);
  if (!m.active) throw new Error('manager never activated within 30 s');
  out.activatedAfterMs = Date.now() - tA;
  const voice = String(m.selectedVoiceID || '');
  out.voice = voice;
  out.voiceIsPlugin = voice.includes('::');
  if (!out.voiceIsPlugin) {
    try { m.pause(); } catch (e) { /* paused at once, reported */ }
    throw new Error('the session started on a voice without "::" (' + voice + '): paused, stopping');
  }

  // --- the mechanism on this live reader
  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    return eng.readers.find((x) => x.itemID === fx.itemID) || null;
  };
  let e = null;
  const tP = Date.now();
  while (Date.now() - tP < 25000) {
    e = await engineFor();
    if (e && e.session && e.session.playing && e.audio && e.audio.state === 'running') break;
    await sleep(120);
  }
  out.playingAfterMs = Date.now() - tP;
  out.segCount = m.segments ? m.segments.length : null;
  const ctl = wu(m._controller);
  out.mechanism = {
    hooks: e && e.hooks,
    controller: e && e.controller,
    typeofClearFailures: typeof ctl.clearFailures,
    typeofRetry: typeof ctl.retry,
    session: e && e.session && { voice: e.session.voice, position: e.session.position, currentIndex: e.session.currentIndex, paused: e.session.paused, playing: e.session.playing, speed: e.session.speed, playbackTime: e.session.playbackTime, clipDuration: e.session.clipDuration, error: e.session.error },
    audio: e && e.audio && { state: e.audio.state, gain: e.audio.gain, contexts: e.audio.contexts },
    stats: e && e.stats,
    manager: { active: m.active, paused: m.paused, error: m.error || null, speed: m.speed },
  };
  S.mechanism238[label] = out.mechanism;
  out.popupOpen = !!(ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen);
  out.playerFrame = !!r._iframeWindow.document.getElementById('ztts-player-frame');
  out.ok = !!(e && e.controller && e.controller.ours && e.controller.live && out.mechanism.typeofClearFailures === 'function' && e.session && e.session.playing && e.audio && e.audio.state === 'running');
  return JSON.stringify(out, null, 1);
})();
