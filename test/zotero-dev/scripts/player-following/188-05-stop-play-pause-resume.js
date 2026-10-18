// 188-05 — item 3: in M, stop and play again — no page movement from the first sentence on;
// pause with the sentence on screen and resume — still no movement, still M.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.snapshot);
  if (!reader) { out.error = 'snapshot reader gone'; return JSON.stringify(out); }
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 400));

  const rowOf = async () => {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    return rows[idx] ?? null;
  };
  const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
  const viewWin = () => {
    const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
    return Components.utils.waiveXrays(view.iframeWindow);
  };
  const cw = viewWin(); // the view's own window scrolls

  // Stop: close the Player (ends the session); Play: open it again (starts at the stored position)
  reader._internalReader.toggleReadAloudPopup(false);
  await new Promise((r) => setTimeout(r, 800));
  out.afterStop = { active: !!reader._internalReader._readAloudManager.active };
  const yAtStop = cw.scrollY;
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 900));
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); reader._internalReader._readAloudManager.play(); } catch (e) { out.playError = String(e); }
  await new Promise((r) => setTimeout(r, 500));
  out.afterPlay = { active: !!reader._internalReader._readAloudManager.active, paused: !!reader._internalReader._readAloudManager.paused };
  let row = await rowOf();
  out.playRow = { following: row?.following, kind: row?.kind };

  // From the first sentence on: no page movement over three sentences
  const posOf = async () => {
    const e = JSON.parse(await d.engine());
    const idx = (e.readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const s = e.readers?.[idx]?.session;
    return { position: s ? s.position : null, index: s ? s.currentIndex : null };
  };
  const seen = [];
  const pos0 = await posOf();
  const t2 = Date.now();
  while (Date.now() - t2 < 25000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seen.push({ y: cw.scrollY, position: p.position, index: p.index });
    if (pos0.index !== null && p.index !== null && p.index >= pos0.index + 3) break;
    if (p.position !== null && pos0.position !== null && p.position >= pos0.position + 3) break;
  }
  out.playMovement = { from: pos0, seen: seen.slice(0, 12), moved: seen.some((s) => Math.abs(s.y - (seen[0]?.y ?? cw.scrollY)) > 2) };

  // Pause with the sentence on screen, resume: still no movement, still M
  try { reader._internalReader._readAloudManager.pause(); } catch (e) { out.pauseError = String(e); }
  await new Promise((r) => setTimeout(r, 700));
  const yPaused = cw.scrollY;
  const rowPaused = await rowOf();
  try {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    reader._internalReader._readAloudManager.play();
  } catch (e) { out.resumeError = String(e); }
  await new Promise((r) => setTimeout(r, 2000));
  const yResumed = cw.scrollY;
  const seen2 = [];
  const pos1 = await posOf();
  const t3 = Date.now();
  while (Date.now() - t3 < 20000) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await posOf();
    seen2.push({ y: cw.scrollY, position: p.position, index: p.index });
    if (pos1.index !== null && p.index !== null && p.index >= pos1.index + 2) break;
  }
  const rowEnd = await rowOf();
  const pp = JSON.parse(await d.pluginPlayer());
  const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.pauseResume = {
    yPaused, yResumed,
    jump: Math.abs(yResumed - yPaused),
    movedAfter: seen2.some((s) => Math.abs(s.y - yPaused) > 2),
    following: rowEnd?.following ?? null,
    playerAutomatic: pp.readers?.[idx]?.state?.automatic ?? null,
    seen: seen2.slice(0, 10),
  };
  out.pass = !!(out.afterStop.active === false && out.playMovement.moved === false
    && out.pauseResume.jump <= 2 && out.pauseResume.movedAfter === false
    && out.pauseResume.following === false && out.pauseResume.playerAutomatic === false);
  return JSON.stringify(out);
})()
