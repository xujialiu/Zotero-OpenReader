(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures.B.itemID;
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  const internal = reader._internalReader;
  const manager = () => internal._readAloudManager;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  sandbox.fetch = function (input, init) {
    let info = { url: typeof input === 'string' ? input.slice(0, 80) : (input && input.url ? String(input.url).slice(0, 80) : String(input).slice(0, 80)), argType: typeof input, bodyType: typeof init?.body };
    try {
      const b = init?.body;
      if (typeof b === 'string') info.bodyHead = b.slice(0, 300);
      else if (b && typeof b === 'object') info.bodyCtor = b.constructor?.name ?? 'object';
    } catch (e) { info.bodyErr = String(e); }
    calls.push(info);
    return originalFetch.apply(this, arguments);
  };
  // resume playback to fire the next requests (paused mid-session, cache off)
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
  internal.toggleReadAloudPaused();
  let waited = 0;
  while (calls.length < 2 && waited < 8000) { await sleep(150); waited += 150; }
  await sleep(300);
  if (manager()?.active && !manager()?.paused) internal.toggleReadAloudPaused();
  sandbox.fetch = originalFetch;
  return JSON.stringify({ calls }, null, 1);
})()