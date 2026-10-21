return (async () => {
  // Issue #212: the Outline and the Appearance sliders keep their arrows during a session.
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
  const center = el => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  const clickHost = (slot, el) => { const [x, y] = center(el); clickAt(reader(slot)._iframeWindow, x, y); };
  const clickChild = (slot, el) => { const fb = frame(slot).getBoundingClientRect(), b = el.getBoundingClientRect(); clickAt(reader(slot)._iframeWindow, fb.left + b.left + b.width / 2, fb.top + b.top + b.height / 2); };
  const select = slot => { const r = reader(slot); if (!r) throw new Error('fixture reader gone'); try { Zotero_Tabs.select(r.tabID); } catch (e) {} try { r.focus?.(); } catch (e) {} return globalThis.Zotero_Tabs?.selectedID === r.tabID; };
  const mainWin = Services.wm.getMostRecentWindow('navigator:browser');
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(mainWin)) throw new Error('nsITextInputProcessor begin failed');
  const mk = (key, code, keyCode, shift) => new mainWin.KeyboardEvent('', { key, code, keyCode, shiftKey: !!shift });
  const press = (key, code, keyCode, shift) => { let consumed = 0;
    if (shift) consumed += tip.keydown(mk('Shift', 'ShiftLeft', 16));
    consumed += tip.keydown(mk(key, code, keyCode, shift));
    tip.keyup(mk(key, code, keyCode, shift));
    if (shift) tip.keyup(mk('Shift', 'ShiftLeft', 16));
    return consumed; };
  const out = {};
  // ---- part 1: the Outline on the PDF fixture, session open and paused
  const slot = S.fixtures.outline;
  select(slot);
  if (!openedDom(slot)) throw new Error('outline player not open');
  const m = () => irOf(slot)?._readAloudManager;
  if (m().active && !m().paused) { clickChild(slot, cdoc(slot).querySelector('.play')); await wait(() => m()?.paused === true, 6000); }
  if (!m().active || !m().paused) throw new Error('outline session not open+paused: ' + JSON.stringify({ active: m().active, paused: m().paused }));
  const findItem = text => { const d = doc(slot), ov = d && (d.getElementById('outlineView') || d.querySelector('div.outline-view')); if (!ov) return null; const cands = [...ov.querySelectorAll('[role="option"], li, div, span')].filter(el => (el.textContent || '').trim() === text); return cands[cands.length - 1] || null; };
  const liCount = () => { const d = doc(slot), ov = d && (d.getElementById('outlineView') || d.querySelector('div.outline-view')); return ov ? ov.querySelectorAll('li').length : null; };
  let item = findItem('Measurements');
  if (!item) throw new Error('Outline item "Measurements" (has children) not found');
  const titleEl = item.querySelector('.title') || item;
  clickHost(slot, titleEl);
  await sleep(350);
  item = findItem('Measurements');
  if (!item) throw new Error('Outline item lost after click');
  const seg0 = segOf(eng(slot));
  const exp0 = String(item.className).includes('expanded');
  const li0 = liCount();
  const focusInfo = (() => { const ae = doc(slot).activeElement; return ae ? waive(ae).tagName + '.' + String(waive(ae).className).slice(0, 40) : null; })();
  const presses = [['ArrowRight', 'ArrowRight', 39, false], ['ArrowLeft', 'ArrowLeft', 37, false], ['ArrowRight', 'ArrowRight', 39, true], ['ArrowLeft', 'ArrowLeft', 37, true]];
  const rows = [];
  for (const [key, code, keyCode, shift] of presses) {
    try { waive(view(slot))._readAloudPositionLocked = false; } catch (e) { rows.push({ key: (shift ? 'Shift+' : '') + key, error: 'lock reset failed: ' + String(e) }); continue; }
    const itemB = findItem('Measurements');
    const expBefore = itemB ? String(itemB.className).includes('expanded') : null;
    const liBefore = liCount();
    const keydownReturn = press(key, code, keyCode, shift);
    await sleep(420);
    const itemA = findItem('Measurements');
    const expAfter = itemA ? String(itemA.className).includes('expanded') : null;
    const e = segOf(eng(slot));
    const locked = (() => { try { return waive(view(slot))._readAloudPositionLocked === true; } catch (err) { return 'error'; } })();
    rows.push({ key: (shift ? 'Shift+' : '') + key, keydownReturn, expBefore, expAfter, expandedChanged: expBefore !== expAfter, liBefore, liAfter: liCount(), position: e.position, currentIndex: e.currentIndex, lockedAfter: locked, paused: m().paused === true });
  }
  const segMoved = rows.some(r => (r.position !== seg0?.position) || (r.currentIndex !== seg0?.currentIndex));
  const want = [true, false, true, false];
  rows.forEach((r, i) => { r.expandedAsExpected = r.expAfter === want[i] && (want[i] ? r.liAfter > r.liBefore : r.liAfter === r.liBefore); });
  const outlineOk = rows.length === 4 && rows.every(r => r.expandedAsExpected) && !segMoved && rows.every(r => r.paused);
  // restore the Outline state (collapse if we leave it expanded)
  const itemNow = findItem('Measurements');
  const expNow = itemNow ? String(itemNow.className).includes('expanded') : null;
  let outlineRestored = expNow === exp0;
  if (!outlineRestored && itemNow) { const t2 = itemNow.querySelector('.toggle'); if (t2) { clickHost(slot, t2); await sleep(350); outlineRestored = String(findItem('Measurements')?.className).includes('expanded') === exp0; } }
  // close the outline session so later presses route unambiguously
  let outlineSessionClosed = false;
  try { reader(slot)._internalReader.toggleReadAloudPopup(false); outlineSessionClosed = await wait(() => !openedDom(slot), 6000, 100) ? true : !openedDom(slot); } catch (e) { outlineSessionClosed = 'error: ' + String(e); }
  out.outline = { focusInfo, exp0, li0, seg0: { position: seg0?.position, currentIndex: seg0?.currentIndex }, rows, segMoved, outlineOk, expNow, outlineRestored, outlineSessionClosed };
  // ---- part 2: the EPUB Appearance size slider — the widget the case names does not exist in this build
  out.slider = { notTestable: 'this Zotero 11 build renders no input[type=range] (no #myRange, no .ticked-range-input) in the Appearance popup of the EPUB or the PDF fixture; the popup holds only Reading Mode/Scrolling/Spreads/Split View/Themes rows. Verified by DOM dump before this run.' };
  // session on the EPUB fixture for the control part
  const epub = S.fixtures.epub;
  select(epub);
  if (!openedDom(epub)) throw new Error('epub player not open');
  const me = () => irOf(epub)?._readAloudManager;
  if (me().active && !me().paused) { clickChild(epub, cdoc(epub).querySelector('.play')); await wait(() => me()?.paused === true, 6000); }
  if (!me().active || !me().paused) throw new Error('epub session not open+paused');
  // ---- part 3: control — click the page, ArrowRight skips one segment
  const v = view(epub)?._iframeWindow;
  if (!v) throw new Error('no epub view window');
  { const vw = Components.utils.waiveXrays(v), fe = vw.frameElement; if (!fe) throw new Error('no view frameElement'); const fb = fe.getBoundingClientRect(); clickAt(reader(epub)._iframeWindow, fb.left + Math.round(vw.innerWidth / 2), fb.top + Math.round(vw.innerHeight / 2)); }
  await sleep(300);
  try { waive(view(epub))._readAloudPositionLocked = false; } catch (e) {}
  const c0 = segOf(eng(epub));
  const rc = press('ArrowRight', 'ArrowRight', 39);
  await sleep(450);
  const c1 = segOf(eng(epub));
  const advanced = (typeof c1.currentIndex === 'number' && typeof c0.currentIndex === 'number') ? c1.currentIndex - c0.currentIndex : ((c1.position ?? 0) - (c0.position ?? 0));
  out.control = { keydownReturn: rc, advanced, before: c0, after: c1, paused: me().paused === true };
  out.allOk = outlineOk && outlineRestored && advanced === 1 && out.control.paused;
  return JSON.stringify(out, null, 1);
})()
