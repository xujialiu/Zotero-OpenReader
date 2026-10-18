// 188-03 — item 1b: Reading Mode switched on in the PDF fixture from the reader's Appearance popup,
// with the Player open; within one sentence the row reads kind "reading-mode", patched true, no reopen.
// The toggle is the popup's #reading-mode-enabled switch (reader.js AppearancePopup, onChange).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();

  // PDF fixture: open, poll, select, open its Player (A default), pause
  await Zotero.Reader.open(S.fix4Items.pdf);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.pdf);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader || !reader._internalReader) { out.error = 'pdf reader not ready in 24 s'; return JSON.stringify(out); }
  S.fix4PdfTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 700));
  try { reader._internalReader._readAloudManager.pause(); } catch (e) { out.pauseError = String(e); }

  // Appearance popup -> Reading Mode on (real popup controls)
  const doc = reader._iframeWindow.document;
  const appearanceButton = doc.getElementById('appearance');
  if (!appearanceButton) { out.error = 'no #appearance button'; return JSON.stringify(out); }
  appearanceButton.click();
  let popup = null;
  const p0 = Date.now();
  while (Date.now() - p0 < 4000) {
    popup = doc.querySelector('.appearance-popup');
    if (popup) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!popup) { out.error = 'appearance popup did not open'; return JSON.stringify(out); }
  const toggle = doc.getElementById('reading-mode-enabled');
  if (!toggle) { out.error = 'no #reading-mode-enabled switch'; return JSON.stringify(out); }
  const beforeChecked = toggle.checked;
  toggle.click();
  await new Promise((r) => setTimeout(r, 300));
  out.toggle = { before: beforeChecked, after: doc.getElementById('reading-mode-enabled') ? doc.getElementById('reading-mode-enabled').checked : 'popup closed' };

  // Resume reading and poll the row: kind flips within one sentence
  try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
  try { reader._internalReader._readAloudManager.play(); } catch (e) { out.playError = String(e); }
  const r0 = Date.now();
  let saw = null;
  while (Date.now() - r0 < 15000) {
    const rows = JSON.parse(await d.autoScroll());
    const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const row = rows[idx];
    if (row && row.patched && row.kind === 'reading-mode') { saw = { row, afterMs: Date.now() - r0 }; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  out.flip = saw ? { kind: saw.row.kind, patched: saw.row.patched, following: saw.row.following, afterMs: saw.afterMs } : null;
  if (saw) S.fix4PdfRMRow = saw.row;

  // The Player was not reopened
  const pp = JSON.parse(await d.pluginPlayer());
  const idx = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === reader.itemID);
  out.playerOpen = pp.readers?.[idx]?.open ?? null;
  out.popupInDom = !!reader._iframeWindow.document.querySelector('#ztts-player-frame');
  out.pass = !!(out.flip && out.flip.patched === true && out.playerOpen === true);
  return JSON.stringify(out);
})()
