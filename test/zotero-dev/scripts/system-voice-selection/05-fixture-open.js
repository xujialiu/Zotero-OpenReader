// Case: system-voice-selection, items 2+4 — fixture preparation, corrected
// revision (the first attempt of 2026-11-05 failed: the popup was opened
// before the reader iframe was ready and without a planted document choice,
// so the session died on the azure tier with no voice — a test-method
// failure, not a product one). Corrected per the proven system-voice-refresh
// method: import fixture-a.pdf, plant the fixture's OWN document choice
// (documentVoices.user/<key>, a listed free System voice) BEFORE the reader
// opens, restore the window, wait for the iframe, open the Player and pause
// in the SAME script. Fails closed before any playback unless the session's
// voice is proven free from the run's initial catalog.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, ms, step = 250) => {
    const end = Date.now() + ms;
    let v = test();
    while (!v && Date.now() < end) { await sleep(step); v = test(); }
    return v;
  };
  const waive = (v) => Components.utils.waiveXrays(v);
  const HD = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const win = Zotero.getMainWindow();
  const prefix = 'extensions.zotero.zotero-tts.';

  // 1. Free-proof from the run's initial catalog BEFORE anything plays;
  //    without a retained catalog (e.g. a focused mini-pass that skipped 02),
  //    list the System records directly — a listing, never a synthesis
  let catalog = S.svsCatalogInitial || null;
  if (!catalog) {
    const prov = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    catalog = prov.voicesError ? [] : (prov.voices || []);
    S.svsCatalogInitial = catalog;
    out.catalogListedFresh = { count: catalog.length, error: prov.voicesError ?? null };
  }
  const listed = catalog.some((v) => 'system::' + v.id === HD);
  out.freeChoiceProven = listed;
  if (!listed) throw new Error('fail-closed: planted voice is not in the listed System catalog');

  // 2. Import the fixture
  const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
  const item = await Zotero.Attachments.importFromFile({
    file: PathUtils.join(fixturesDir, 'fixture-a.pdf'),
    libraryID: Zotero.Libraries.userLibraryID,
    title: Zotero.ZoteroTTSRun.params.fixtureTitle,
  });
  S.svsFixtureItemID = item.id;
  S.svsFixtureKey = item.key;
  out.fixture = { itemID: item.id, key: item.key };

  // 3. Plant ONLY the fixture's own document choice (the supported path)
  const docVoiceKey = prefix + 'documentVoices.user/' + item.key;
  Services.prefs.setStringPref(docVoiceKey, JSON.stringify({ voice: { id: HD, lang: 'en' }, manual: true, ts: Date.now() }));
  S.svsFixtureDocVoiceKey = docVoiceKey;
  out.docVoicePlanted = Services.prefs.prefHasUserValue(docVoiceKey);

  // 4. Restore the window (popup mount + rendering) BEFORE the reader opens
  const wasMinimized = win.windowState === 2;
  if (wasMinimized) { win.restore(); await sleep(600); }
  out.windowRestored = true;

  // 5. Open the reader; poll internals (install rule), then the iframe
  await Zotero.Reader.open(item.id);
  const reader = await waitFor(() => (Zotero.Reader._readers || []).find((r) => r.itemID === item.id && r._internalReader && r._internalReader._readAloudManager), 24000, 1000);
  if (!reader) throw new Error('fixture reader/manager did not appear within 24 s');
  await waitFor(() => reader._iframeWindow && !reader._iframeWindow.document.hidden, 8000, 300);
  out.readerReady = true;

  // 6. Select the fixture tab (the player mounts only in the selected tab)
  let tabID = reader.tabID;
  if (!tabID) {
    const t = (win.Zotero_Tabs._tabs || []).find((t) => t.data && t.data.itemID === item.id);
    tabID = t ? t.id : null;
  }
  S.svsFixtureTabID = tabID;
  win.Zotero_Tabs.select(tabID);
  await sleep(500);
  out.tabSelected = win.Zotero_Tabs.selectedID === tabID;

  // 7. Open the Player — it starts playing at once; pause in the SAME script
  await reader._internalReader.toggleReadAloudPopup(true);
  const popupMounted = await waitFor(() => reader._iframeWindow.document.querySelector('.read-aloud-popup') || reader._iframeWindow.document.querySelector('#ztts-player-frame'), 8000, 200);
  const m = () => waive(reader._internalReader._readAloudManager);
  let applied = await waitFor(() => m().selectedVoiceID === HD, 10000, 300);
  out.voiceAppliedByEntry = applied;
  if (!applied && m().active) {
    try { await m().selectTier('system'); } catch (e) { out.tierError = String(e).slice(0, 100); }
    try { await m().selectVoice(HD); } catch (e) { out.voiceError = String(e).slice(0, 100); }
    applied = await waitFor(() => m().selectedVoiceID === HD, 8000, 300);
  }
  // Fail closed: no session voice, no continuation
  if (!(m().selectedVoiceID === HD && m().active)) {
    try { if (m().active && !m().paused) m().pause(); } catch (e) { /* stop what we started */ }
    await reader._internalReader.toggleReadAloudPopup(false);
    throw new Error('fail-closed: fixture session did not land on the free System voice (selectedVoiceID=' + String(m().selectedVoiceID) + ')');
  }
  if (m().active && !m().paused) m().pause();
  out.pausedAfterOpen = await waitFor(() => m().paused === true, 5000, 200);
  out.session = { selectedVoiceID: m().selectedVoiceID ?? null, tier: m()._selectedTier ?? m().selectedTier ?? null, active: !!m().active, paused: !!m().paused, controllerPaused: m()._controller ? !!m()._controller.paused : null, popupMounted: !!popupMounted };

  // 8. The engine view of the paused session
  const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  out.engine = (eng.readers || []).find((r) => r.itemID === item.id) || null;
  out.mainWindowState = win.windowState;
  return JSON.stringify(out, null, 1);
})()
