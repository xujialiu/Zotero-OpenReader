return (async () => {
  // Issue #213, second bullet: a voice list left open while reading stays open.
  const R = Zotero.ZoteroTTSRun, S = R.state || (R.state = {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (t, ms = 6000, step = 70) => { const e = Date.now() + ms; while (Date.now() < e) { const v = t(); if (v) return v; await sleep(step); } return t(); };
  const gw = Services.wm.getMostRecentWindow('navigator:browser'); gw.focus(); await sleep(350);
  if (Services.focus.activeWindow !== gw) throw new Error('Zotero window is not OS-active; native input refused');
  const waive = el => Components.utils.waiveXrays(el);
  const readers = () => Zotero.Reader?._readers || [];
  const reader = slot => { for (const r of readers()) try { if (r?.itemID === slot?.itemID) return r; } catch (e) {} return null; };
  const irOf = slot => reader(slot)?._internalReader || null;
  const doc = slot => reader(slot)?._iframeWindow?.document || null;
  const frame = slot => doc(slot)?.getElementById('ztts-player-frame') || null;
  const child = slot => { const f = frame(slot); return f?.contentWindow ? waive(f.contentWindow) : null; };
  const cdoc = slot => child(slot)?.document || null;
  const idx = slot => { const r = reader(slot), l = readers(); for (let i = 0; i < l.length; i++) if (l[i] === r) return i; return -1; };
  const openedDom = slot => frame(slot)?.hidden === false && !!cdoc(slot)?.querySelector('.player');
  const view = slot => irOf(slot)?._primaryView || null;
  const eng = slot => { try { const a = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); return (a.readers || []).find(e => e.itemID === slot?.itemID) || null; } catch (e) { return { error: String(e) }; } };
  const segOf = e => e ? { position: e.session?.position ?? null, currentIndex: e.session?.currentIndex ?? null } : {};
  const audioOf = e => e ? { state: e.audio?.state ?? null, playing: e.session?.playing ?? null } : null;
  const clickAt = (win, x, y) => { const gw = Services.wm.getMostRecentWindow('navigator:browser'); if (Services.focus.activeWindow !== gw) gw.focus(); const ww = Components.utils.waiveXrays(win), wu = Components.utils.waiveXrays(win.windowUtils || ww.windowUtils); const scale = ww.devicePixelRatio || 1; const sx = Math.round((ww.mozInnerScreenX + x) * scale), sy = Math.round((ww.mozInnerScreenY + y) * scale); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP, 0, 0, null); };
  const clickChild = (slot, el) => { const fb = frame(slot).getBoundingClientRect(), b = el.getBoundingClientRect(); clickAt(reader(slot)._iframeWindow, fb.left + b.left + b.width / 2, fb.top + b.top + b.height / 2); };
  const select = slot => { const r = reader(slot); if (!r) throw new Error('fixture reader gone'); try { Zotero_Tabs.select(r.tabID); } catch (e) {} try { r.focus?.(); } catch (e) {} return globalThis.Zotero_Tabs?.selectedID === r.tabID; };
  const slot = S.fixtures.outline;
  select(slot);
  const m = () => irOf(slot)?._readAloudManager;
  if (!openedDom(slot)) throw new Error('player not open on outline fixture');
  if (!m()?.active) throw new Error('no active session on outline fixture');
  const out = {};
  // resume if paused
  if (m().paused) { clickChild(slot, cdoc(slot).querySelector('.play')); await wait(() => m()?.paused === false, 6000); }
  out.resumed = { active: m().active, paused: m().paused };
  if (m().paused) throw new Error('could not resume playback');
  // open the voice list
  const voiceAnchor = cdoc(slot).querySelector('[data-pick="voice"]');
  clickChild(slot, voiceAnchor);
  if (!(await wait(() => cdoc(slot)?.querySelector('.popover'), 4000, 50))) throw new Error('voice menu did not open');
  await sleep(150);
  const openedGeom = { frameHeight: frame(slot).style.height, popover: true };
  const search = cdoc(slot).querySelector('.popover input[type="search"], .popover input');
  const start = eng(slot);
  const t0 = Date.now();
  let keepAction = 'none';
  if (search) { clickChild(slot, search); keepAction = 'trusted click on menu search field'; }
  else { const list = cdoc(slot).querySelector('.popover .option-list'); if (list) { list.dispatchEvent(new (waive(cdoc(slot).defaultView)).WheelEvent('wheel', { bubbles: true, deltaY: 120 })); keepAction = 'synthetic wheel on option list'; } }
  let end = start, advanced = null, advancedBy = null;
  while (Date.now() - t0 < 22000) {
    await sleep(400);
    end = eng(slot);
    if (typeof end?.session?.currentIndex === 'number' && typeof start?.session?.currentIndex === 'number') { advanced = end.session.currentIndex - start.session.currentIndex; advancedBy = 'currentIndex'; }
    else if (typeof end?.session?.position === 'number' && typeof start?.session?.position === 'number') { advanced = end.session.position - start.session.position; advancedBy = 'position'; }
    if (advanced !== null && advanced >= 3) break;
  }
  const elapsedMs = Date.now() - t0;
  await sleep(150);
  const duringGeom = { frameHeight: frame(slot)?.style?.height || null, popover: !!cdoc(slot)?.querySelector('.popover') };
  const audio = { state: end?.audio?.state ?? null, playing: end?.session?.playing ?? null, playbackTime: end?.session?.playbackTime ?? null };
  // pause again and close the menu
  let pausedAfter = null;
  try { clickChild(slot, cdoc(slot).querySelector('.play')); pausedAfter = await wait(() => m()?.paused === true, 6000) ? true : m().paused; } catch (e) { pausedAfter = 'error: ' + String(e); }
  let menuClosed = null;
  try { clickChild(slot, cdoc(slot).querySelector('[data-pick="voice"]')); await wait(() => !cdoc(slot)?.querySelector('.popover'), 2500, 60); menuClosed = !cdoc(slot)?.querySelector('.popover'); } catch (e) { menuClosed = 'error: ' + String(e); }
  const sentenceCriterion = advanced !== null && advanced >= 3;
  out.result = { openedGeom, keepAction, advanced, advancedBy, elapsedMs, duringGeom, audio, engineStart: { currentIndex: start?.session?.currentIndex, position: start?.session?.position }, engineEnd: { currentIndex: end?.session?.currentIndex, position: end?.session?.position }, pausedAfter, menuClosed,
    verdict: sentenceCriterion ? (duringGeom.popover && duringGeom.frameHeight === '460px' ? 'PASS' : 'FAIL') : 'NOT-TESTABLE(audio did not advance ' + advanced + ' in ' + elapsedMs + 'ms; menu stayed open: ' + duringGeom.popover + ')' };
  return JSON.stringify(out, null, 1);
})()
