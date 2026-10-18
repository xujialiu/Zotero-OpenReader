// 188-07 — item 5: in A, every scroll style places the sentence at the reading line as on a scrolled
// EPUB (the row's `last` carries reason and target; the view window physically moves). `outside` is
// given a sentence off the view first — it places only when the sentence is outside. The docked Top
// bar (layout 'top') covers 34 px; the reading line sits at 30% of ~833 px, below it.
// Needs the host window restored: visible() refuses placement at windowState 2 (dom-follow.ts:71).
(async () => {
  const out = { styles: {} };
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.snapshot);
  if (!reader) { out.error = 'snapshot reader gone'; return JSON.stringify(out); }
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 400));

  // A again (the probing wheels left M)
  const Ci = Components.interfaces;
  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(reader._iframeWindow)) { out.error = 'TIP refused'; return JSON.stringify(out); }
  const kd = (init) => tip.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  const ku = (init) => tip.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  const r1 = kd({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
  ku({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
  ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  out.shiftM = { consumed: r1 };
  await new Promise((r) => setTimeout(r, 1200));
  try {
    reader._iframeWindow.document.notifyUserGestureActivation?.();
    reader._internalReader._readAloudManager.play();
  } catch (e) { out.playError = String(e); }

  const rowOf = async () => {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    return rows[idx] ?? null;
  };
  const viewWin = () => {
    const view = Components.utils.waiveXrays(reader._internalReader._lastView ?? reader._internalReader._primaryView);
    return Components.utils.waiveXrays(view.iframeWindow);
  };

  const checkStyle = async (style) => {
    const entry = {};
    Zotero.Prefs.set('zotero-tts.readAloud.autoScrollMode', style);
    await new Promise((r) => setTimeout(r, 700));
    const m = reader._internalReader._readAloudManager;
    if (style === 'outside') {
      // Put the spoken sentence well outside the view; the style then places on the next sentence
      viewWin().scrollTo(0, Math.max(0, viewWin().scrollY - 2500));
      await new Promise((r) => setTimeout(r, 500));
    }
    try { m.skipAhead('sentence'); } catch (e) { entry.skipError = String(e); }
    await new Promise((r) => setTimeout(r, 1600));
    try { m.skipAhead('sentence'); } catch (e) { entry.skipError2 = String(e); }
    await new Promise((r) => setTimeout(r, 1600));
    const row = await rowOf();
    const vw = viewWin();
    entry.mode = row?.mode ?? null;
    entry.following = row?.following ?? null;
    entry.reason = row?.reason ?? null;
    entry.last = row?.last ?? null;
    entry.line = row?.line ?? null;
    entry.covered = row?.covered ?? null;
    entry.scrollY = Math.round(vw.scrollY);
    entry.viewportH = vw.innerHeight;
    entry.placed = !!(row && row.last && typeof row.last.top === 'number' && typeof row.last.reason === 'string');
    if (entry.placed) {
      // followTarget requests the scroll position itself: options.top = target.top
      entry.scrollDelta = Math.round(entry.scrollY - row.last.top);
      entry.atTarget = Math.abs(entry.scrollDelta) <= 3;
    }
    return entry;
  };

  // assert A before the style loop; if a wheel/lock turned M again, once more via Shift+M
  let rowPre = await rowOf();
  out.pre = { following: rowPre?.following ?? null, reason: rowPre?.reason ?? null, mode: rowPre?.mode ?? null };
  if (!rowPre || rowPre.following !== true) {
    kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    const r1b = kd({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
    ku({ key: 'M', code: 'KeyM', keyCode: 77, shiftKey: true });
    ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
    out.shiftMRetry = { consumed: r1b };
    await new Promise((r) => setTimeout(r, 1200));
    rowPre = await rowOf();
    out.pre2 = { following: rowPre?.following ?? null, reason: rowPre?.reason ?? null };
  }
  if (!rowPre || rowPre.following !== true) { out.error = 'reader not in A after Shift+M'; return JSON.stringify(out); }

  for (const style of ['line', 'sentence', 'outside']) {
    out.styles[style] = await checkStyle(style);
  }
  const original = S.fix4Prefs['readAloud.autoScrollMode'];
  if (original.hadUser) Zotero.Prefs.set('zotero-tts.readAloud.autoScrollMode', original.value);
  else Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.autoScrollMode');

  const pp = JSON.parse(await d.pluginPlayer());
  out.playerLayout = pp.layout ?? null;
  out.stylesPass = ['line', 'sentence', 'outside'].every((s) => out.styles[s].placed && out.styles[s].atTarget);
  return JSON.stringify(out);
})()
