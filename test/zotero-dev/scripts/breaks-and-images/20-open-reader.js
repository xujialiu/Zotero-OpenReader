// Open a fixture in a reader tab and bring up its Player, held paused and muted
// (readAloud.volume is 0 from 01). The window is restored and focused first —
// page initialization and the highlight need a rendered window; 90 minimizes it
// again. A reader opened after an install is driven only once its
// _internalReader and _readAloudManager exist (polled, ~24 s ceiling). The popup
// of a document whose remembered voice is listed starts playback at once, so it
// is paused in the same script. Reports the voice, the view, and Zotero's
// segment list (index, full text) the reading checks index into.
// params: which ('epub' | 'snapshot'). state: reads fx; writes readers[which].
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'open-reader', which: p.which };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const fx = state.fx?.[p.which];
  if (!fx) throw new Error('no fixture ' + p.which);
  const win = Zotero.getMainWindow();
  out.volume = Services.prefs.getIntPref('extensions.zotero.zotero-tts.readAloud.volume', -1);
  if (out.volume !== 0) throw new Error('not muted: volume ' + out.volume);

  // Restore the window for the steps that render.
  if (win.windowState === 2) win.restore();
  win.focus();
  for (let i = 0; i < 20 && win.windowState === 2; i++) await sleep(150);
  out.windowState = win.windowState;

  const find = () => (Zotero.Reader._readers || []).find((r) => r.itemID === fx.id) ?? null;
  let reader = find();
  out.alreadyOpen = !!reader;
  if (!reader) {
    const opened = Zotero.Reader.open(fx.id);
    if (opened && typeof opened.then === 'function') await opened;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    reader = find();
    if (reader?._internalReader && reader._internalReader._readAloudManager) break;
    await sleep(250);
  }
  if (!reader?._internalReader || !reader._internalReader._readAloudManager) throw new Error('reader or manager never appeared for ' + p.which);
  out.readyAfterMs = Date.now() - t0;
  if (win.Zotero_Tabs.selectedID !== reader.tabID) win.Zotero_Tabs.select(reader.tabID);
  await sleep(1200);

  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  if (manager.active) throw new Error('a session is already active on ' + p.which);

  // Player up, held at once.
  reader._iframeWindow.document.notifyUserGestureActivation?.();
  internal.toggleReadAloudPopup(true);
  let active = false;
  for (let i = 0; i < 80 && !active; i++) {
    await sleep(200);
    active = !!manager.active;
    if (active && !manager.paused) { try { manager.togglePaused(); } catch (e) { out.holdError = String(e); } }
  }
  if (!active) throw new Error('the manager never became active after the popup opened');
  for (let i = 0; i < 20 && !manager.paused; i++) { await sleep(150); try { if (!manager.paused) manager.togglePaused(); } catch (e) { /* retry */ } }
  await sleep(600);
  out.manager = { active: !!manager.active, paused: !!manager.paused, voice: manager.selectedVoiceID ?? null, tier: manager.selectedTier ?? null, lang: manager.lang ?? null };
  out.voiceIsListed = typeof out.manager.voice === 'string' && out.manager.voice.includes('::');

  // Segments, by index, full text.
  const list = waive(internal._readAloudSegments?.segments);
  const segments = [];
  for (let i = 0; i < (Number(list?.length) || 0); i++) {
    const seg = waive(list[i]);
    segments.push({ i, text: String(seg?.text ?? ''), hasPosition: !!seg?.sourcePosition });
  }
  out.segments = segments;
  const view = internal._activePrimaryView ? waive(internal._activePrimaryView) : (internal._primaryView ? waive(internal._primaryView) : null);
  out.view = { present: !!view, hasToDisplayedRange: typeof view?.toDisplayedRange === 'function', hasSpotlights: !!view?._spotlights, hasHelper: !!view?._readAloud, type: String(internal._type ?? internal.type ?? '') };
  out.tabSelected = win.Zotero_Tabs.selectedID === reader.tabID;

  state.readers = state.readers || {};
  state.readers[p.which] = { itemID: fx.id, tabID: reader.tabID, segments: segments.map((s) => s.text) };
  out.ok = out.voiceIsListed && out.manager.paused && segments.length > 0 && out.view.present && out.view.hasToDisplayedRange;
  return JSON.stringify(out, null, 1);
})()
