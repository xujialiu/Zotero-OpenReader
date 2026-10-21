return (async () => {
  // Imports the disposable outline-fixture PDF, opens it, opens + pauses the
  // players on it and the EPUB fixture, and discovers the Outline DOM.
  const R = Zotero.ZoteroTTSRun, S = R.state || (R.state = {}), P = R.params || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (t, ms = 8000, step = 80) => { const e = Date.now() + ms; while (Date.now() < e) { const v = t(); if (v) return v; await sleep(step); } return t(); };
  const gw = Services.wm.getMostRecentWindow('navigator:browser'); gw.focus(); await sleep(350);
  if (Services.focus.activeWindow !== gw) throw new Error('Zotero window is not OS-active; native input refused');
  const readers = () => Zotero.Reader?._readers || [];
  const reader = slot => { for (const r of readers()) try { if (r?.itemID === slot?.itemID) return r; } catch (e) {} return null; };
  const irOf = slot => reader(slot)?._internalReader || null;
  const doc = slot => reader(slot)?._iframeWindow?.document || null;
  const frame = slot => doc(slot)?.getElementById('ztts-player-frame') || null;
  const child = slot => { const f = frame(slot); return f?.contentWindow ? Components.utils.waiveXrays(f.contentWindow) : null; };
  const cdoc = slot => child(slot)?.document || null;
  const idx = slot => { const r = reader(slot), l = readers(); for (let i = 0; i < l.length; i++) if (l[i] === r) return i; return -1; };
  const openedDom = slot => frame(slot)?.hidden === false && !!cdoc(slot)?.querySelector('.player');
  const view = slot => irOf(slot)?._primaryView || null;
  const clickAt = (win, x, y) => { const gw = Services.wm.getMostRecentWindow('navigator:browser'); if (Services.focus.activeWindow !== gw) gw.focus(); const ww = Components.utils.waiveXrays(win), wu = Components.utils.waiveXrays(win.windowUtils || ww.windowUtils); const scale = ww.devicePixelRatio || 1; const sx = Math.round((ww.mozInnerScreenX + x) * scale), sy = Math.round((ww.mozInnerScreenY + y) * scale); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP, 0, 0, null); };
  const center = el => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  const clickHost = (slot, el) => { const [x, y] = center(el); clickAt(reader(slot)._iframeWindow, x, y); return [Math.round(x), Math.round(y)]; };
  const select = slot => { const r = reader(slot); if (!r) return false; try { Zotero_Tabs.select(r.tabID); } catch (e) {} try { r.focus?.(); } catch (e) {} try { view(slot)?._iframeWindow?.focus?.(); } catch (e) {} return globalThis.Zotero_Tabs?.selectedID === r.tabID; };
  const readiness = slot => { const r = reader(slot), v = view(slot), w = v?._iframeWindow || v?.iframeWindow, d = w?.document; return { selected: globalThis.Zotero_Tabs?.selectedID === r?.tabID, windowState: r?._window?.windowState ?? null, suspended: v?._suspended ?? false, hidden: d?.hidden ?? null, manager: !!irOf(slot)?._readAloudManager }; };
  const toggleBtn = slot => doc(slot)?.getElementById('ztts-player-toggle') || doc(slot)?.querySelector('button[aria-controls="ztts-player-frame"]');
  const pauseIfNeeded = async slot => {
    const m = irOf(slot)?._readAloudManager; if (!m) throw new Error('no manager');
    const before = { active: !!m.active, paused: !!m.paused };
    if (m.active && !m.paused) {
      const play = cdoc(slot)?.querySelector('.play'); if (!play) throw new Error('no .play button');
      clickChild(slot, play);
      await wait(() => irOf(slot)?._readAloudManager?.paused === true, 5000);
    }
    const m2 = irOf(slot)?._readAloudManager;
    return { before, after: { active: !!m2.active, paused: !!m2.paused } };
    function clickChild(s, el) { const fb = frame(s).getBoundingClientRect(), b = el.getBoundingClientRect(); clickAt(reader(s)._iframeWindow, fb.left + b.left + b.width / 2, fb.top + b.top + b.height / 2); }
  };
  const ensureOpen = async slot => {
    if (openedDom(slot)) return 'already-open';
    const b = toggleBtn(slot); if (!b) throw new Error('player toggle button missing (reader not attached?)');
    clickHost(slot, b);
    const ok = await wait(() => openedDom(slot), 10000);
    if (!ok) throw new Error('player did not open');
    return 'opened-by-toggle-button';
  };
  // 1. import the outline fixture (idempotent: reuse the slot when a previous run left it)
  const existingSlot = () => !!(S.fixtures?.outline?.itemID && reader(S.fixtures.outline) && irOf(S.fixtures.outline)?._readAloudManager);
  if (!existingSlot()) {
  const pdfPath = Zotero.isWin ? String(P.outlinePdf || '').replace(/\//g, '\\') : String(P.outlinePdf || '');
  if (!pdfPath) throw new Error('outlinePdf param missing');
  const title = 'Zotero-TTS issue 213 Outline ' + Date.now();
  const imported = await Zotero.Attachments.importFromFile({ file: pdfPath, libraryID: Zotero.Libraries.userLibraryID, title });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('outline fixture import failed');
  S.fixtures = S.fixtures || {}; S.fixtures.outline = { title, itemID: item.id, key: item.key };
  // 2. open + readiness
  const pending = Zotero.Reader.open(item.id, null, { openInBackground: false, allowDuplicate: false }); if (pending?.then) await pending;
  if (!(await wait(() => reader(S.fixtures.outline)?._internalReader?._readAloudManager ? reader(S.fixtures.outline) : null, 24000, 250))) throw new Error('outline reader did not expose manager');
  select(S.fixtures.outline);
  const ready = await wait(() => { const v = readiness(S.fixtures.outline); return v.selected && v.windowState !== 2 && v.suspended !== true && v.hidden === false ? v : null; }, 20000);
  if (!ready) throw new Error('outline iframe not ready: ' + JSON.stringify(readiness(S.fixtures.outline)));
  } else { select(S.fixtures.outline); }
  // 3. sidebar Outline discovery
  const odoc = doc(S.fixtures.outline);
  let outlineView = odoc.getElementById('outlineView') || odoc.querySelector('div.outline-view');
  let outlineOpenedVia = 'already-visible';
  if (!outlineView) {
    const cands = [...odoc.querySelectorAll('button')].filter(b => /outline/i.test([b.id, b.className, b.title || '', b.getAttribute('aria-label') || ''].join(' ')));
    if (!cands.length) throw new Error('no outline button candidate; toolbar buttons: ' + [...odoc.querySelectorAll('button')].map(b => [b.id, b.className].join('|')).filter(x => x !== '|').join('; ').slice(0, 900));
    clickHost(S.fixtures.outline, cands[0]);
    outlineView = await wait(() => odoc.getElementById('outlineView') || odoc.querySelector('div.outline-view'), 6000);
    outlineOpenedVia = 'clicked:' + (cands[0].id || cands[0].className);
    if (!outlineView) throw new Error('outlineView did not appear after ' + outlineOpenedVia);
  }
  await sleep(400);
  const itemInfo = [...outlineView.querySelectorAll('[role="option"], li, div[class*="item"], span')].map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 40), exp: el.getAttribute('aria-expanded'), sel: el.getAttribute('aria-selected'), text: (el.textContent || '').trim().slice(0, 30) })).filter(x => x.text).slice(0, 24);
  // 4. open + pause players on outline and epub tabs
  const opened = {};
  for (const kind of ['outline', 'epub']) {
    const slot = S.fixtures[kind]; if (!slot) throw new Error('state.fixtures.' + kind + ' missing; run 02-fixtures.js first');
    select(slot);
    if (!(await wait(() => { const v = readiness(slot); return v.selected && v.windowState !== 2 && v.suspended !== true && v.hidden === false ? v : null; }, 20000))) throw new Error(kind + ' iframe not ready');
    opened[kind] = { toggle: await ensureOpen(slot), pause: await pauseIfNeeded(slot) };
  }
  select(S.fixtures.outline);
  // 5. discovery evidence
  const c = cdoc(S.fixtures.outline);
  let eng = null; try { const a = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); eng = (a.readers || []).find(e => e.itemID === S.fixtures.outline.itemID) || null; } catch (e) { eng = { error: String(e) }; }
  return JSON.stringify({ outline: { itemID: S.fixtures.outline.itemID, tabID: reader(S.fixtures.outline).tabID }, outlineOpenedVia, outlineItems: itemInfo,
    opened,
    anchors: { voice: !!c?.querySelector('[data-pick="voice"]'), speed: !!c?.querySelector('[data-adjust="speed"]'), play: !!c?.querySelector('.play') },
    engine: eng, layoutNow: frame(S.fixtures.outline)?.getAttribute('data-layout') || null, frameHeight: frame(S.fixtures.outline)?.style?.height || null,
    selectedTabID: globalThis.Zotero_Tabs?.selectedID || null }, null, 1);
})()
