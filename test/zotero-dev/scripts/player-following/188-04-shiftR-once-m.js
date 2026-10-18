// 188-04 — item 2: M on the snapshot (default Manual-scroll), wheel away, trusted Shift+R returns once;
// over the next three sentences scrollY does not move; Player and following stay M.
// Fresh tab so the per-tab intent is created from the changed default (case §2: close/reopen uses it).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();

  Zotero.Prefs.set('zotero-tts.readAloud.defaultAutoScroll', false);
  if (S.fix4SnapshotTab) { try { win.Zotero_Tabs.close(S.fix4SnapshotTab); } catch (e) {} }
  const c0 = Date.now();
  while (Date.now() - c0 < 8000 && (Zotero.Reader._readers ?? []).some((r) => r.itemID === S.fix4Items.snapshot)) {
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 500));

  await Zotero.Reader.open(S.fix4Items.snapshot);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.snapshot);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader || !reader._internalReader) { out.error = 'reader not ready'; return JSON.stringify(out); }
  S.fix4SnapshotTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 800));
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); reader._internalReader._readAloudManager.play(); } catch (e) { out.playError = String(e); }
  await new Promise((r) => setTimeout(r, 600));

  const rowOf = async () => {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    return rows[idx] ?? null;
  };
  const posOf = async () => {
    const e = JSON.parse(await d.engine());
    const idx = (e.readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const s = e.readers?.[idx]?.session;
    return { position: s ? s.position : null, index: s ? s.currentIndex : null, playing: s ? s.playing : null };
  };

  let row = await rowOf();
  out.attached = { kind: row?.kind, patched: row?.patched, following: row?.following };
  if (!row || row.following !== false) { out.error = 'reader did not start in M'; return JSON.stringify(out); }

  const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
  // DOM views scroll the view's own window (iframe.loaded), not the shell
  const viewWin = () => {
    const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
    return Components.utils.waiveXrays(view.iframeWindow);
  };
  const cw = viewWin();

  // Bring the reading to a known mid-document sentence and wait until the helper can resolve it
  // (a press during the first buffering has no segment to return to: _resolveSegmentSelector null)
  const helper = Components.utils.waiveXrays(Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView)._readAloud);
  try { reader._internalReader._readAloudManager.repositionTo(3); } catch (e) { out.reposError = String(e); }
  let resolved = null;
  const rw0 = Date.now();
  while (Date.now() - rw0 < 12000) {
    try { resolved = helper._resolveSegmentSelector(helper.state); } catch (e) { resolved = null; }
    if (resolved) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  out.selectorResolved = resolved ? (resolved.value || 'sel') : null;
  if (!resolved) { out.fail = 'segment never resolvable'; out.pass = false; return JSON.stringify(out); }

  // Wheel away: trusted wheel (the manual input), then the page physically moved (synthesized
  // wheels do not drive this frame's scroller; a programmatic scroll is the observation scaffold)
  try {
    const rawWin = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView).iframeWindow;
    const f = [...reader._iframeWindow.document.querySelectorAll('iframe')].find((f) => f.contentDocument && f.contentDocument.querySelectorAll('p').length > 0);
    const u = (f ? f.contentWindow : rawWin).windowUtils;
    const x = Math.round(cw.innerWidth / 2), y = Math.round(cw.innerHeight / 2);
    for (let i = 0; i < 3; i++) { u.sendWheelEvent(x, y, 0, 400, 0, 0, 0, 0, 4, 0, null); await new Promise((r) => setTimeout(r, 150)); }
  } catch (e) { out.wheelError = String(e); }
  cw.scrollTo(0, cw.scrollY + 2400);
  await new Promise((r) => setTimeout(r, 600));
  out.scrollAway = cw.scrollY;

  // Trusted Shift+R on the reader shell (plugin key routing)
  const Ci = Components.interfaces;
  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(reader._iframeWindow)) { out.error = 'TIP refused'; return JSON.stringify(out); }
  const kd = (init) => tip.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  const ku = (init) => tip.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  const rKey = kd({ key: 'R', code: 'KeyR', keyCode: 82, shiftKey: true });
  ku({ key: 'R', code: 'KeyR', keyCode: 82, shiftKey: true });
  ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  out.shiftR = { consumed: rKey };

  // The page returns once
  let returned = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 6000) {
    await new Promise((r) => setTimeout(r, 200));
    const y = cw.scrollY;
    if (Math.abs(y - out.scrollAway) > 200) { returned = { scrollY: y, afterMs: Date.now() - t1 }; break; }
  }
  out.returned = returned;
  if (!returned) { out.pass = false; out.fail = 'page did not return after Shift+R'; return JSON.stringify(out); }

  const rowAfter = await rowOf();
  out.afterReturn = { following: rowAfter?.following, reason: rowAfter?.reason, last: rowAfter?.last };
  // let the return's own smooth scroll settle before the stability window
  await new Promise((r) => setTimeout(r, 1500));
  const stableY = cw.scrollY;
  out.stableY = stableY;

  // Three more sentences: scrollY stays put, Player and following stay M
  const seen = [];
  const t2 = Date.now();
  const pos0 = await posOf();
  while (Date.now() - t2 < 25000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seen.push({ y: cw.scrollY, position: p.position, index: p.index });
    if (pos0.index !== null && p.index !== null && p.index >= pos0.index + 3) break;
    if (p.position !== null && pos0.position !== null && p.position >= pos0.position + 3) break;
  }
  out.sentences = { from: pos0, seen: seen.slice(0, 12), count: seen.length };
  out.finalY = cw.scrollY;
  const rowEnd = await rowOf();
  const pp = JSON.parse(await d.pluginPlayer());
  const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.end = { following: rowEnd?.following ?? null, playerAutomatic: pp.readers?.[idx]?.state?.automatic ?? null };
  out.movedMid = seen.some((s) => Math.abs(s.y - stableY) > 2);
  out.pass = !!(returned && !out.movedMid && out.end.following === false && out.end.playerAutomatic === false);
  return JSON.stringify(out);
})()
