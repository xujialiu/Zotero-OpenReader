// The reading session (issue #237, items 6-9's prerequisite): the Local
// provider pointed at the kit's fake Kokoro server (params.fakeBaseURL),
// the fixture's document voice planted on the idle manager (the recorded
// pattern — a pick on an idle manager does not survive activation), the
// fixture tab selected, a trusted Shift+Space (nsITextInputProcessor, the
// autoplay gate) opening the session, then paused for the window work.
// The voice must be listed: the fake server lists af_bella. Volume is 0
// (muted by 00). params: fakeBaseURL. state: reads fixture; writes session.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const P = 'extensions.zotero.zotero-tts.';
  const fakeBaseURL = Zotero.ZoteroTTSRun.params.fakeBaseURL;
  if (!fakeBaseURL) throw new Error('params.fakeBaseURL missing');
  // 1. the Local provider on, at the fake server
  Services.prefs.setBoolPref(P + 'local.enabled', true);
  Services.prefs.setStringPref(P + 'local.baseURL', fakeBaseURL);
  out.localPrefs = { enabled: Services.prefs.getBoolPref(P + 'local.enabled'), baseURL: Services.prefs.getStringPref(P + 'local.baseURL', null) };
  // 2. plant the document voice on the idle manager
  const dvPref = P + 'documentVoices.user/' + fx.key;
  Services.prefs.setStringPref(dvPref, JSON.stringify({ voice: { id: 'local::af_bella', lang: 'en' }, manual: true, ts: Date.now() }));
  out.planted = JSON.parse(Services.prefs.getStringPref(dvPref, null));
  // 3. select the fixture's tab
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  safe(() => win.Zotero_Tabs.select(reader.tabID));
  await sleep(600);
  out.selectedID = safe(() => win.Zotero_Tabs.selectedID);
  out.fixtureTabID = reader.tabID;
  // 4. trusted Shift+Space: the autoplay gate
  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  out.transactionBegan = tip.beginInputTransactionForTests(win);
  const key = (type, k, code, keyCode) => tip[type](new win.KeyboardEvent('', { key: k, code, keyCode }));
  const KE = win.KeyboardEvent;
  key('keydown', 'Shift', 'ShiftLeft', KE.DOM_VK_SHIFT);
  key('keydown', ' ', 'Space', KE.DOM_VK_SPACE);
  key('keyup', ' ', 'Space', KE.DOM_VK_SPACE);
  key('keyup', 'Shift', 'ShiftLeft', KE.DOM_VK_SHIFT);
  // 5. wait for the session, its voice, and the fake server's answers
  let engine = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const m = safe(() => reader._internalReader._readAloudManager);
    if (!m?.active) continue;
    engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const fxEngine = (engine.readers ?? [])[fx.readerIndex];
    if (fxEngine?.session && fxEngine.session.voice === 'local::af_bella' && (fxEngine.session.store?.requests ?? 0) >= 1) break;
  }
  out.engine = (() => {
    const fxEngine = (engine?.readers ?? [])[fx.readerIndex];
    return fxEngine ? { voice: fxEngine.session?.voice, position: fxEngine.session?.position, requests: fxEngine.session?.store?.requests, clips: fxEngine.session?.store?.clips, inflight: fxEngine.session?.store?.inflight, audioState: fxEngine.audio?.state ?? null, playing: fxEngine.session?.playing } : null;
  })();
  // 6. pause for the window work
  const m = safe(() => reader._internalReader._readAloudManager);
  if (m?.active && !m.paused) await Promise.resolve(m.pause());
  await sleep(400);
  out.paused = safe(() => reader._internalReader._readAloudManager.paused);
  // 7. what the fake server received so far
  const logPath = Zotero.ZoteroTTSRun.params.tmpDir + '/replacements/fake-kokoro.log';
  let logText = '';
  try { logText = await IOUtils.readUTF8(logPath); } catch (e) { /* none yet */ }
  out.serverRequests = logText.split('\n').filter((l) => l.trim()).map((l) => { try { const j = JSON.parse(l); return { path: j.path, voice: j.voice, input: j.input }; } catch (e) { return { raw: l.slice(0, 80) }; } });
  out.serverCounts = await (async () => { try { const r = await fetch(Zotero.ZoteroTTSRun.params.fakeBaseURL + '/stats'); return await r.json(); } catch (e) { return String(e); } })();
  state.session = { started: true, logPath };
  return JSON.stringify(out, null, 1);
})()
