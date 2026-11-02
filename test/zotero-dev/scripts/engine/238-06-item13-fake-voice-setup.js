// Issue #238, engine item 13 on Zotero 10.0.7: setup. A fresh fixture copy
// ("B") reading on a Local-provider voice served by the fake Kokoro-shaped
// server (238-05), so a request can be made to fail on cue by pointing
// local.baseURL at a port nothing listens on (133-12's method).
//   1. The fake server must answer and the "down" port must refuse.
//   2. webdav.syncState is snapshotted first: a change to a syncable setting
//      (local.baseURL, local.enabled, the volume, the document-voice pulse)
//      stamps it locally even with the WebDAV folder off (settings-sync-
//      transport.ts changed(), 238-253); 238-99 puts the touched keys' stamps back.
//   3. Fixture A (item 25) is closed; local.baseURL is set to the fake
//      server BEFORE local.enabled goes on, so nothing asks the owner's own
//      server; the fixture is opened (the popup starts a System voice, muted),
//      and the fake voice is picked WHILE it plays (a pick while playing is a
//      Handoff; 133-28's order: tier, a catalog reload if the voice is not
//      listed, the pick, wait until the session's voice is the fake one).
//   4. The session is paused on the fake voice.
// params: workingURL, downURL, fakeVoice ('af_fake'), tag, closeA (default true).
// state: reads baseline238, fixtures.A; writes syncState238, fixtures.B,
// item13Setup, segLens.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: '238-06-item13-fake-voice-setup', at: new Date().toISOString() };
  const fakeId = 'local::' + (P.fakeVoice || 'af_fake');
  const ZT = 'extensions.zotero.zotero-tts.';

  // --- 1. the two servers
  const probe = async (url) => { try { const r = await fetch(url + '/stats'); return 'answers ' + r.status; } catch (e) { return 'refused'; } };
  out.workingServer = await probe(P.workingURL);
  out.downServer = await probe(P.downURL);
  if (!out.workingServer.startsWith('answers')) throw new Error('the fake server is not answering at ' + P.workingURL);
  if (out.downServer !== 'refused') throw new Error('the "down" address is not closed: ' + P.downURL);

  // --- 2. the sync stamps, before local.* is touched
  if (!S.syncState238) {
    S.syncState238 = { hasUser: Services.prefs.prefHasUserValue(ZT + 'webdav.syncState'), value: Services.prefs.getStringPref(ZT + 'webdav.syncState', '') };
  }
  out.syncStateSnapshot = { hasUser: S.syncState238.hasUser, len: S.syncState238.value.length };

  // --- 3a. fixture A out of the way
  const a = S.fixtures && S.fixtures.A;
  const ra = a && (Zotero.Reader._readers || []).find((x) => x.itemID === a.itemID);
  if (ra && P.closeA !== false) {
    try { ra._internalReader.toggleReadAloudPopup(false); } catch (e) { out.closeAPopupErr = String(e); }
    await sleep(400);
    try { ra._window.Zotero_Tabs.close(ra.tabID); } catch (e) { out.closeATabErr = String(e); }
    await sleep(600);
    out.fixtureAClosed = !(Zotero.Reader._readers || []).some((x) => x.itemID === a.itemID);
  }

  // --- 3b. the Local provider on the fake server (address first, then the switch)
  Zotero.Prefs.set('zotero-tts.local.baseURL', P.workingURL);
  Zotero.Prefs.set('zotero-tts.local.enabled', true);
  out.prefsNow = { baseURL: Zotero.Prefs.get('zotero-tts.local.baseURL'), enabled: Zotero.Prefs.get('zotero-tts.local.enabled'), engine: Zotero.Prefs.get('zotero-tts.local.engine') };

  // --- 3c. fixture B, opened; the popup's own start
  const memId = (() => { try { return JSON.parse(S.baseline238.memory.value).voice.id; } catch (e) { return null; } })();
  if (!(typeof memId === 'string' && memId.includes('::'))) throw new Error('readAloud.memory is not a plugin voice');
  const file = PathUtils.join(P.fixturesDir, 'fixture-a.pdf');
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: `ztts-238 ${P.tag || '2026-11-02'} B` });
  const fx = { itemID: item.id, key: item.key, title: item.getField('title') };
  S.fixtures.B = fx;
  out.fixture = fx;
  await Zotero.Reader.open(fx.itemID);
  let r = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    r = (Zotero.Reader._readers || []).find((x) => x.itemID === fx.itemID) || null;
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('fixture B reader/manager never appeared');
  fx.tabID = r.tabID;
  const win = r._window;
  const ir = r._internalReader;
  const m = ir._readAloudManager;
  out.selectedTabIsFixture = win.Zotero_Tabs.selectedID === r.tabID;
  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);
  const tA = Date.now();
  while (Date.now() - tA < 30000 && !m.active) await sleep(40);
  if (!m.active) throw new Error('manager never activated');
  const startVoice = String(m.selectedVoiceID || '');
  out.startVoice = startVoice;
  if (!startVoice.includes('::')) { try { m.pause(); } catch (e) { /* reported */ } throw new Error('started on a voice without "::": ' + startVoice); }

  const engineFor = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers.find((x) => x.itemID === fx.itemID) || null;
  let e = null;
  const tP = Date.now();
  while (Date.now() - tP < 25000) {
    e = await engineFor();
    if (e && e.session && e.session.playing && e.audio && e.audio.state === 'running') break;
    await sleep(100);
  }
  out.playingBeforePick = !!(e && e.session && e.session.playing);

  // Segment text lengths (for mapping the server log's `chars` back to indices)
  const segs = m.segments; const lens = [];
  for (let i = 0; i < segs.length; i++) lens.push(String(segs[i].text).length);
  S.segLens = lens;
  out.segCount = lens.length;

  // --- 3d. the fake voice: listed? then tier, pick
  const listed = () => { const all = wu(m).allVoices; for (let i = 0; i < all.length; i++) if (wu(all[i]).id === fakeId) return true; return false; };
  out.listedAtOpen = listed();
  if (!out.listedAtOpen) { m.loadVoices(true); for (let i = 0; i < 40 && !listed(); i++) await sleep(200); out.listedAfterReload = listed(); }
  if (!listed()) throw new Error(fakeId + ' is not in the catalog');
  const engine = String(Zotero.Prefs.get('zotero-tts.local.engine') || '').trim();
  const tier = engine ? engine.toLowerCase() : 'local-engine';
  out.tier = tier;
  out.tiersOnManager = (() => { try { return Array.from(wu(m).tiers || []); } catch (err) { return String(err); } })();
  m.selectTier(tier);
  await sleep(300);
  out.selectedTierAfter = m.selectedTier;
  out.selectedVoiceAfterTier = String(m.selectedVoiceID || '');
  m.selectVoice(fakeId);
  const tC = Date.now();
  let committed = null;
  while (Date.now() - tC < 40000) {
    e = await engineFor();
    if (e && e.session && e.session.voice === fakeId && !e.session.handoff) { committed = e; break; }
    await sleep(60);
  }
  out.commitMs = committed ? Date.now() - tC : null;
  if (!committed) throw new Error('the session never moved to ' + fakeId);
  // Let the new voice speak a moment (a real clip played), then pause
  const tPlay = Date.now();
  while (Date.now() - tPlay < 15000) { e = await engineFor(); if (e && e.session.playing && e.session.voice === fakeId) break; await sleep(60); }
  m.pause();
  await sleep(400);
  e = await engineFor();
  out.afterPause = {
    mgr: { active: m.active, paused: m.paused, error: m.error || null, voice: String(m.selectedVoiceID || ''), tier: m.selectedTier },
    session: e.session && { voice: e.session.voice, position: e.session.position, currentIndex: e.session.currentIndex, paused: e.session.paused, playing: e.session.playing, error: e.session.error, speed: e.session.speed, store: e.session.store },
    controller: e.controller, audio: e.audio && e.audio.state, stats: e.stats,
  };
  out.ok = !!(e.session && e.session.voice === fakeId && e.session.paused && e.controller && e.controller.ours);
  S.item13Setup = out;
  return JSON.stringify(out, null, 1);
})();
