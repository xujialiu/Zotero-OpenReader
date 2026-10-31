// Save a PNG of the Zotero window with a reading paused on its sentence. The
// plugin's Player (iframe#ztts-player-frame in the reader document; Zotero's own
// .read-aloud-popup stays in the page, display none) floats over the first lines
// of a short EPUB page, so it is hidden for the capture (inline visibility on
// that one element only; put back in a finally) — the highlight is in the page,
// not the player. Two animation frames of the reader are awaited after the style
// change so the capture sees it.
// params: which, name (file stem), shotDir (absolute folder), hidePopup (default true).
// state: reads readers[which]. Result: the file path, its size in bytes, popupFound.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'screenshot', which: p.which, name: p.name };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rd = state.readers?.[p.which];
  const reader = rd ? (Zotero.Reader._readers || []).find((r) => r.itemID === rd.itemID) : null;
  if (!reader) throw new Error('reader not open: ' + p.which);
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) throw new Error('window is minimized; restore it for a screenshot');
  if (win.Zotero_Tabs.selectedID !== reader.tabID) { win.Zotero_Tabs.select(reader.tabID); await sleep(800); }
  const frames = () => new Promise((r) => reader._iframeWindow.requestAnimationFrame(() => reader._iframeWindow.requestAnimationFrame(() => r())));
  const doc = reader._iframeWindow.document;
  const popup = doc.getElementById('ztts-player-frame');
  out.popupFound = !!popup;
  const hide = !!popup && p.hidePopup !== false;
  const prior = popup ? popup.style.visibility : '';
  try {
    if (hide) popup.style.visibility = 'hidden';
    await frames();
    await sleep(300);
    const w = win.innerWidth, h = win.innerHeight;
    const bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(new win.DOMRect(0, 0, w, h), 1, 'rgb(255,255,255)');
    const canvas = new win.OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await IOUtils.makeDirectory(p.shotDir, { createAncestors: true, ignoreExisting: true });
    const path = PathUtils.join(p.shotDir, p.name + '.png');
    await IOUtils.write(path, bytes);
    out.path = path;
    out.bytes = bytes.byteLength;
    out.size = { width: bitmap.width, height: bitmap.height };
  } finally {
    if (hide) popup.style.visibility = prior;
    await frames();
  }
  out.popupRestored = popup ? popup.style.visibility === prior : null;
  out.ok = !!out.path && out.bytes > 1000 && out.popupRestored !== false;
  return JSON.stringify(out, null, 1);
})()
