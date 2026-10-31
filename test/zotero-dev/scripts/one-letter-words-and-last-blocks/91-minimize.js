// Minimize the Zotero window again as soon as a rendering step is over (the workflow's default: minimized unless a
// step needs layout, highlight placement or focus). Touches nothing else; 20-open-reader restores it for the next
// reader. params: none.
(async () => {
  const out = { step: 'minimize' };
  const win = Zotero.getMainWindow();
  out.before = win.windowState;
  try { win.minimize(); } catch (e) { out.error = String(e); }
  for (let i = 0; i < 20 && win.windowState !== 2; i++) await new Promise((r) => setTimeout(r, 150));
  out.after = win.windowState;
  out.ok = out.after === 2;
  return JSON.stringify(out, null, 1);
})()
