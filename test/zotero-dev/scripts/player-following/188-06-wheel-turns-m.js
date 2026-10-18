// 188-06 — item 4: in A, a trusted wheel turns the Player to M at once (following false, reason wheel).
// The wheel goes through nsIDOMWindowUtils.sendWheelEvent on the view's content window: a synthetic
// (isTrusted false) wheel event is ignored by design (dom-follow.ts listens only to isTrusted !== false).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.snapshot);
  if (!reader) { out.error = 'snapshot reader gone'; return JSON.stringify(out); }

  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 400));
  // Back to A (a wheel may have left M in an earlier attempt), then resume
  try { reader._internalReader._readAloudManager.pause(); } catch (e) {}
  const rows0 = JSON.parse(await d.autoScroll());
  const idx0 = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.before = { following: rows0[idx0]?.following ?? null, kind: rows0[idx0]?.kind ?? null };
  if (out.before.following !== true) {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    Zotero.ZoteroTTS.diagnostics.manual ? null : null;
    // Shift+M from M returns to A; drive the plugin's own toggle path
    const Ci = globalThis.Ci || Components.interfaces;
    const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
    if (!tip.beginInputTransactionForTests(reader._iframeWindow)) { out.error = 'TIP refused'; return JSON.stringify(out); }
    const kd = (init) => tip.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
    const ku = (init) => tip.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
    kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    const r1 = kd({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
    ku({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
    ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    out.shiftM = { consumed: r1 };
    await new Promise((r) => setTimeout(r, 600));
  }
  // Resume playback (A, muted)
  try {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    reader._internalReader._readAloudManager.play();
  } catch (e) { out.playError = String(e); }
  await new Promise((r) => setTimeout(r, 800));

  const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
  const cw = reader._iframeWindow; // DOM views scroll the reader shell window itself
  out.scrollBefore = cw.scrollY;
  const x = Math.round((cw.innerWidth ?? 400) / 2), y = Math.round((cw.innerHeight ?? 600) / 2);
  const u = cw.windowUtils;
  if (typeof u.sendWheelEvent !== 'function') { out.error = 'no windowUtils.sendWheelEvent'; return JSON.stringify(out); }
  u.sendWheelEvent(x, y, 0, 240, 0, 0, 0, 0, 3, 0, null);
  await new Promise((r) => setTimeout(r, 900));

  const rows = JSON.parse(await d.autoScroll());
  const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  const pp = JSON.parse(await d.pluginPlayer());
  out.row = rows[idx] ?? null;
  out.playerAutomatic = pp.readers?.[idx]?.state?.automatic ?? null;
  out.scrollAfter = cw.scrollY;
  out.pass = !!(out.row && out.row.following === false && out.playerAutomatic === false && out.row.reason === 'wheel');
  return JSON.stringify(out);
})()
