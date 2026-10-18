// 188-08 — item 6: steps 2-4 again in Reading Mode (the hidden PDF view is not checked).
// Fixture: fixture-c (eight pages) — fixture-a's Reading Mode text fits one viewport, so there is
// nothing to scroll away. Reading Mode is a DOM view whose page scrolls inside an element of its
// own: placements carry last.reason "element" (live observation), and the away/return movement is
// the element scroller's, found dynamically. Environment limits recorded in the rows:
// - a synthesized wheel is not delivered into the SDT document at all (probe: 0 listeners fired
//   from either the shell's or the frame's windowUtils), so step 4's manual input is the trusted
//   keyboard (TIP PageDown), which the follower takes with reason "keyboard";
// - the follower refuses placement while the host is minimized (dom-follow.ts visible()), so the
//   window must stay restored for this script.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const Ci = Components.interfaces;
  const P = Zotero.ZoteroTTSRun.params;

  if (win.windowState === 2) win.windowState = 3;

  // import fixture-c (standalone), erasing a leftover of the same title first
  if (!S.fix4Items.pdfC) {
    const s = new Zotero.Search();
    s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
    s.addCondition('title', 'is', 'ztts 2026-10-18 188 pdfc');
    const old = await s.search();
    if (old.length) await Zotero.Items.erase(old);
    const item = await Zotero.Attachments.importFromFile({ file: P.fixtureC, libraryID: Zotero.Libraries.userLibraryID, title: 'ztts 2026-10-18 188 pdfc' });
    S.fix4Items.pdfC = item.id;
  }
  out.pdfC = S.fix4Items.pdfC;

  if (S.fix4PdfTab) { try { win.Zotero_Tabs.close(S.fix4PdfTab); } catch (e) {} }
  await new Promise((r) => setTimeout(r, 600));
  await Zotero.Reader.open(S.fix4Items.pdfC);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.pdfC);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader || !reader._internalReader) { out.error = 'pdfc reader not ready'; return JSON.stringify(out); }
  S.fix4PdfTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 800));

  // Reading Mode on through the Appearance popup
  const doc = reader._iframeWindow.document;
  doc.getElementById('appearance')?.click();
  let popup = null;
  const p0 = Date.now();
  while (Date.now() - p0 < 4000) { popup = doc.querySelector('.appearance-popup'); if (popup) break; await new Promise((r) => setTimeout(r, 100)); }
  if (!popup) { out.error = 'appearance popup did not open'; return JSON.stringify(out); }
  doc.getElementById('reading-mode-enabled')?.click();
  await new Promise((r) => setTimeout(r, 500));
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); reader._internalReader._readAloudManager.play(); } catch (e) { out.playError = String(e); }
  let kind = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 15000) {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const row = rows[idx];
    if (row && row.kind === 'reading-mode' && row.patched) { kind = row; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  out.readingMode = kind ? { kind: kind.kind, patched: kind.patched, following: kind.following } : null;
  if (!kind) { out.error = 'row never became reading-mode'; return JSON.stringify(out); }

  const rowOf = async () => {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    return rows[idx] ?? null;
  };
  const posOf = async () => {
    const e = JSON.parse(await d.engine());
    const idx = (e.readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const s = e.readers?.[idx]?.session;
    return { position: s ? s.position : null, index: s ? s.currentIndex : null };
  };
  const viewDoc = () => Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView).iframeDocument;
  const scrollerOf = () => {
    const d2 = viewDoc();
    const se = d2.scrollingElement;
    if (se && se.scrollHeight > se.clientHeight + 1) return { el: se, kind: 'root' };
    const art = d2.querySelector('#sdt-content');
    if (art && art.scrollHeight > art.clientHeight + 1) return { el: art, kind: 'element' };
    // neither scrolls: the placements take the navigateToSelector ('element') path
    return { el: null, kind: 'none' };
  };
  const scrollerTop = () => { const s = scrollerOf(); return s.el ? s.el.scrollTop : 0; };
  const tipOf = () => {
    const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
    tip.beginInputTransactionForTests(reader._iframeWindow);
    return tip;
  };
  const tipKey = (tip, init) => {
    const kd = (i2) => tip.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(i2, reader._iframeWindow)));
    const ku = (i2) => tip.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(i2, reader._iframeWindow)));
    kd(init); ku(init);
    return true;
  };
  const shiftKey = (tip, key, code, kc) => {
    const kd = (init) => tip.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
    const ku = (init) => tip.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
    kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    const r = kd({ key, code, keyCode: kc, shiftKey: true });
    ku({ key, code, keyCode: kc, shiftKey: true });
    ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    return r;
  };
  const shellWheel = async (dy, times) => {
    const u = reader._iframeWindow.windowUtils;
    const x = Math.round(reader._iframeWindow.innerWidth / 2), y = Math.round(reader._iframeWindow.innerHeight / 2);
    for (let i = 0; i < times; i++) { u.sendWheelEvent(x, y, 0, dy, 0, 0, 0, 0, 4, 0, null); await new Promise((r) => setTimeout(r, 150)); }
  };

  // --- Step 4: in A, a manual input turns M at once
  out.step4 = {};
  try { reader._internalReader._readAloudManager.repositionTo(2); } catch (e) { out.reposError = String(e); }
  await new Promise((r) => setTimeout(r, 1000));
  const tip = tipOf();
  const rM = shiftKey(tip, 'M', 'KeyM', 77);
  await new Promise((r) => setTimeout(r, 1200));
  let row = await rowOf();
  out.step4.asA = { consumed: rM, following: row?.following ?? null, reason: row?.reason ?? null, last: row?.last ?? null };
  await shellWheel(400, 3); // recorded attempt: not delivered into the SDT document (see header)
  await new Promise((r) => setTimeout(r, 600));
  row = await rowOf();
  out.step4.afterWheel = { following: row?.following ?? null, reason: row?.reason ?? null };
  tipKey(tip, { key: 'PageDown', code: 'PageDown', keyCode: 34 }); // trusted keyboard: the manual input the view takes
  await new Promise((r) => setTimeout(r, 800));
  row = await rowOf();
  const pp1 = JSON.parse(await d.pluginPlayer());
  const idx1 = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.step4.afterManual = { following: row?.following ?? null, reason: row?.reason ?? null, playerAutomatic: pp1.readers?.[idx1]?.state?.automatic ?? null };
  out.step4.pass = out.step4.asA.following === true && out.step4.afterManual.following === false && out.step4.afterManual.playerAutomatic === false;

  // --- Step 2: away (the element scroller), Shift+R returns once, three sentences stable
  out.step2 = {};
  await (async () => { const s = scrollerOf(); if (s.el) s.el.scrollTop = s.el.scrollTop + 2400; })();
  await new Promise((r) => setTimeout(r, 500));
  const awayTop = scrollerTop();
  out.step2.awayTop = awayTop;
  const rR = shiftKey(tipOf(), 'R', 'KeyR', 82);
  out.step2.consumed = rR;
  let returned = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 6000) {
    await new Promise((r) => setTimeout(r, 250));
    row = await rowOf();
    const moved = Math.abs(scrollerTop() - awayTop) > 200;
    const decided = row?.last && row.last.reason === 'return';
    if (moved || decided) { returned = { top: scrollerTop(), afterMs: Date.now() - t2, reason: row?.last?.reason ?? null }; break; }
  }
  out.step2.returned = returned;
  if (!returned) { out.pass = false; out.step2.pass = false; return JSON.stringify(out); }
  // settle, then three sentences without movement
  await new Promise((r) => setTimeout(r, 1500));
  const stableTop = scrollerTop();
  const pos0 = await posOf();
  const seen = [];
  const t3 = Date.now();
  while (Date.now() - t3 < 25000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seen.push({ top: scrollerTop(), index: p.index, position: p.position });
    if (pos0.index !== null && p.index !== null && p.index >= pos0.index + 3) break;
    if (p.position !== null && pos0.position !== null && p.position >= pos0.position + 3) break;
  }
  out.step2.stable = { from: pos0, seen: seen.slice(0, 14), moved: seen.some((s2) => Math.abs(s2.top - stableTop) > 2) };
  const rowAfter2 = await rowOf();
  out.step2.stillM = rowAfter2?.following === false;
  out.step2.pass = !!(returned && !out.step2.stable.moved && out.step2.stillM);

  // --- Step 3: stop and play — no movement from the first sentence on; pause/resume — none either
  out.step3 = {};
  reader._internalReader.toggleReadAloudPopup(false);
  await new Promise((r) => setTimeout(r, 800));
  out.step3.stoppedActive = !!reader._internalReader._readAloudManager.active;
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 900));
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); reader._internalReader._readAloudManager.play(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 600));
  const rowP = await rowOf();
  out.step3.playRow = { following: rowP?.following ?? null };
  const y0 = scrollerTop();
  const pos1 = await posOf();
  const seenP = [];
  const t4 = Date.now();
  while (Date.now() - t4 < 25000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seenP.push({ top: scrollerTop(), index: p.index });
    if (pos1.index !== null && p.index !== null && p.index >= pos1.index + 3) break;
    if (p.position !== null && pos1.position !== null && p.position >= pos1.position + 3) break;
  }
  out.step3.playMovement = { from: pos1, moved: seenP.some((s2) => Math.abs(s2.top - y0) > 2), seen: seenP.slice(0, 10) };
  reader._internalReader._readAloudManager.pause?.();
  await new Promise((r) => setTimeout(r, 700));
  const yPaused = scrollerTop();
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); reader._internalReader._readAloudManager.play(); } catch (e) { out.step3.resumeError = String(e); }
  await new Promise((r) => setTimeout(r, 2200));
  const yResumed = scrollerTop();
  const pos2 = await posOf();
  const seenR = [];
  const t5 = Date.now();
  while (Date.now() - t5 < 20000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seenR.push({ top: scrollerTop(), index: p.index });
    if (pos2.index !== null && p.index !== null && p.index >= pos2.index + 2) break;
  }
  const rowEnd = await rowOf();
  const pp2 = JSON.parse(await d.pluginPlayer());
  const idx2 = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.step3.pauseResume = {
    jump: Math.abs(yResumed - yPaused),
    movedAfter: seenR.some((s2) => Math.abs(s2.top - yPaused) > 2),
    following: rowEnd?.following ?? null,
    playerAutomatic: pp2.readers?.[idx2]?.state?.automatic ?? null,
  };
  out.step3.pass = !!(out.step3.stoppedActive === false && !out.step3.playMovement.moved
    && out.step3.pauseResume.jump <= 2 && !out.step3.pauseResume.movedAfter
    && out.step3.pauseResume.following === false);
  out.pass = !!(out.step4.pass && out.step2.pass && out.step3.pass);
  return JSON.stringify(out);
})()
