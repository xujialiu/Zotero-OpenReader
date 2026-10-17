(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures.B.itemID;
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  const internal = reader._internalReader;
  const manager = () => internal._readAloudManager;
  // switch ON while paused-active (configured moves, effective stays false until reopen)
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.stripAngleBrackets', true);
  const midTs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const midIdx = (Zotero.Reader._readers || []).findIndex(r => r.itemID === itemID);
  const midRow = midTs[midIdx] ?? null;
  // close, reopen, play
  internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 50; i++) { if (!manager()?.active) break; await sleep(150); }
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
  internal.toggleReadAloudPopup(true);
  let active = false;
  for (let i = 0; i < 60; i++) { if (manager()?.active && manager()?._controller) { active = true; break; } await sleep(150); }
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  sandbox.fetch = function (input, init) {
    try {
      const b = init?.body;
      if (typeof b === 'string') { const body = JSON.parse(b); if (typeof body?.input === 'string') calls.push({ at: Date.now(), input: body.input }); }
    } catch (e) {}
    return originalFetch.apply(this, arguments);
  };
  let repositioned = null;
  try { manager()?.repositionTo(0); repositioned = true; } catch (e) { repositioned = String(e); }
  let waited = 0;
  while (!calls.length && waited < 8000) { await sleep(150); waited += 150; }
  await sleep(300);
  const tsAll = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const tsRow = tsAll[midIdx] ?? null;
  if (manager()?.active && !manager()?.paused) internal.toggleReadAloudPaused();
  for (let i = 0; i < 30; i++) { if (manager()?.paused) break; await sleep(120); }
  sandbox.fetch = originalFetch;
  state.brackets.session3 = { midRow, calls: calls.slice(0, 3), tsRow };
  return JSON.stringify({ midRow, active, repositioned, calls: calls.slice(0, 3), tsRow }, null, 1);
})()