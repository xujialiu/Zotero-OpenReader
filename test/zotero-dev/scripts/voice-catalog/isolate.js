(async () => {
  // active-round 01 — isolate the local provider while it is OFF, then enable
  // it against the loopback stub with cleared headers (case rule).
  const P = 'extensions.zotero.zotero-tts.';
  const params = Zotero.ZoteroTTSRun.params;
  const stubBase = params.stubBase;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(stubBase)) throw new Error('stubBase must be loopback: ' + stubBase);
  // 1. keep local disabled while repointing: force OFF first
  Services.prefs.setBoolPref(P + 'local.enabled', false);
  const offBefore = Services.prefs.getBoolPref(P + 'local.enabled');
  // 2. repoint to the stub
  Services.prefs.setStringPref(P + 'local.baseURL', stubBase);
  // 3. clear effective headers BEFORE the stub can see any request
  Services.prefs.setStringPref(P + 'local.headers', '');
  // 4. verify what was written while still off
  const baseURL = Services.prefs.getStringPref(P + 'local.baseURL');
  const headersLen = Services.prefs.getStringPref(P + 'local.headers').length;
  // 5. system provider on (fixture Document voice is a System voice), and the
  // other configured providers off for this run: the catalog asks every
  // enabled provider, so Fish/Compatible would fail on their real endpoints
  Services.prefs.setBoolPref(P + 'fish.enabled', false);
  Services.prefs.setBoolPref(P + 'compatible.enabled', false);
  Services.prefs.setBoolPref(P + 'system.enabled', true);
  const state = Zotero.ZoteroTTSRun.state;
  state.vc261.localRun = { stubBase, offBefore, baseURL, headersLen };
  // 6. reset stub counters so the plugin's first listing starts clean
  let stub = null;
    try {
    const r = await fetch(stubBase + '/control/hold-voices?mode=pass', { method: 'POST' });
    const s = await fetch(stubBase + '/control/reset', { method: 'POST' });
    stub = { holdArmed: (await r.json()).mode, reset: await s.json() };
  } catch (e) { stub = { error: String(e) }; }
  return JSON.stringify({ offWhileRepoint: offBefore, baseURLNow: baseURL, headersLenNow: headersLen, systemEnabled: Services.prefs.getBoolPref(P + 'system.enabled'), fishOff: !Services.prefs.getBoolPref(P + 'fish.enabled'), compatibleOff: !Services.prefs.getBoolPref(P + 'compatible.enabled'), stub });
})()
