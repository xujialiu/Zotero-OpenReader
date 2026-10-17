(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures.B.itemID;
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  const internal = reader._internalReader;
  const manager = () => internal._readAloudManager;
  // close session 1
  internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 50; i++) { if (!manager()?.active) break; await sleep(150); }
  const closed = !manager()?.active;
  // switch OFF while the tab has no active session
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.stripAngleBrackets', false);
  const configuredNow = Services.prefs.getBoolPref('extensions.zotero.zotero-tts.readAloud.stripAngleBrackets');
  // reopen in the same tab and play
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
  // back to the anchor segment
  let repositioned = null;
  try { manager()?.repositionTo(0); repositioned = true; } catch (e) { repositioned = String(e); }
  let waited = 0;
  while (!calls.length && waited < 8000) { await sleep(150); waited += 150; }
  await sleep(400);
  const tsAll = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const idx = (Zotero.Reader._readers || []).findIndex(r => r.itemID === itemID);
  const tsRow = tsAll[idx] ?? null;
  if (manager()?.active && !manager()?.paused) internal.toggleReadAloudPaused();
  for (let i = 0; i < 30; i++) { if (manager()?.paused) break; await sleep(120); }
  const after = { active: !!manager()?.active, paused: !!manager()?.paused };
  sandbox.fetch = originalFetch;
  state.brackets.session2 = { closed, configuredNow, active, repositioned, calls: calls.slice(0, 4), tsRow };
  return JSON.stringify({ closed, configuredNow, active, repositioned, calls: calls.slice(0, 4), tsRow, after, restoreFetch: sandbox.fetch === originalFetch }, null, 1);
})()