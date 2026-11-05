// system-voice-refresh 05: fixture-a.pdf Player, paused, on a free local Desktop System voice
// (#241 item 2). Volume is already 0 (script 01, after isolation). Restores the window for the
// popup mount, opens the player in the selected tab, pauses at once, records identities +
// applied count, plants the fixture document-voice entry first. Minimizes again at the end.
// liveVoiceList is read BY ITEMID — the executed 2026-11-05 revision took the first
// non-null entry, which is the CLOSED owner reader, not the fixture.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const params = Zotero.ZoteroTTSRun.params || {};
  // The fixtures directory comes from the runner's params: params.fixturesDir as set by
  // run.start, else derived from params.root. No machine-specific path is hard-coded.
  const fixturesDir = params.fixturesDir || (params.root ? params.root + '/test/fixtures' : null);
  if (!fixturesDir) throw new Error('fixturesDir missing: pass fixturesDir or root in run.start params');
  const DAVID = 'system::sapi5/TTS_MS_EN-US_DAVID_11.0';
  const ANDREW = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, ms, step = 250) => {
    const end = Date.now() + ms;
    let value = test();
    while (!value && Date.now() < end) { await sleep(step); value = test(); }
    return value;
  };
  const waived = (v) => Components.utils.waiveXrays(v);
  // One entry per reader, in Zotero.Reader._readers order: match the fixture by itemID
  const liveEntryFor = (live, itemID) => {
    const readers = Zotero.Reader._readers || [];
    const index = readers.findIndex((r) => r.itemID === itemID);
    return index >= 0 ? live[index] : null;
  };
  const idsOf = (list) => {
    const out = [];
    try {
      const w = waived(list);
      const n = w ? w.length : 0;
      for (let i = 0; i < n; i++) if (typeof w[i]?.id === 'string') out.push(w[i].id);
    } catch (e) { out.push('walk-error: ' + String(e).slice(0, 80)); }
    return out;
  };
  try {
    // 1. Import the fixture as a standalone attachment
    const item = await Zotero.Attachments.importFromFile({
      file: fixturesDir.replace(/\//g, '\\') + '\\fixture-a.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title: 'ztts 2026-11-05 Andrew HD A',
    });
    state.fixture = { itemID: item.id, key: item.key, libraryID: item.libraryID };
    // 2. Plant the document-voice entry: David Desktop (free local Desktop System voice)
    const docVoiceKey = prefix + 'documentVoices.user/' + item.key;
    const entry = { voice: { id: DAVID, lang: 'en' }, manual: true, ts: Date.now() };
    Services.prefs.setStringPref(docVoiceKey, JSON.stringify(entry));
    state.fixtureDocVoiceKey = docVoiceKey;
    // 3. Restore the main window for the popup mount (report why: markup mounts
    //    only in the selected tab; verify readiness rather than trusting hidden)
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    state.mainWinRestoredForPlayer = true;
    if (win.windowState === 2) win.restore();
    await sleep(400);
    // 4. Open the reader (polled per the rulebook: _internalReader and _readAloudManager)
    await Zotero.Reader.open(item.id);
    const reader = await waitFor(() => (Zotero.Reader._readers || []).find((r) => r.itemID === item.id && r._internalReader && r._internalReader._readAloudManager), 24000, 1000);
    if (!reader) throw new Error('reader did not reach _internalReader/_readAloudManager within 24 s');
    await waitFor(() => reader._iframeWindow && !reader._iframeWindow.document.hidden, 8000, 300);
    // 5. Open the popup; it starts playing at once — pause in the SAME script
    await reader._internalReader.toggleReadAloudPopup(true);
    const mounted = await waitFor(() => reader._iframeWindow.document.querySelector('.read-aloud-popup') || reader._iframeWindow.document.querySelector('#ztts-player-frame'), 8000, 200);
    const manager = () => waived(reader._internalReader._readAloudManager);
    // Wait briefly for the document voice to be applied from the loaded list
    let voiceApplied = await waitFor(() => manager().selectedVoiceID === DAVID, 10000, 300);
    if (!voiceApplied && manager().active) {
      try { await manager().selectTier('system'); } catch (e) { /* tier name may differ */ }
      try { await manager().selectVoice(DAVID); } catch (e) { /* verified below */ }
      voiceApplied = await waitFor(() => manager().selectedVoiceID === DAVID, 8000, 300);
    }
    if (manager().active && !manager().paused) manager().togglePaused();
    await waitFor(() => manager().paused === true, 5000, 200);
    // 6. Record everything the check will be compared against
    const liveList = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const myEngine = (engine.readers || []).find((r) => r.itemID === item.id) || null;
    const allVoiceIds = idsOf(manager()._allVoices);
    state.fixtureManager = {
      selectedVoiceID: manager().selectedVoiceID ?? null,
      selectedTier: manager()._selectedTier ?? manager().selectedTier ?? null,
      active: !!manager().active,
      paused: !!manager().paused,
      voiceRef: manager()._voice ?? null,
      controllerRef: manager()._controller ?? null,
      controllerPaused: manager()._controller ? !!manager()._controller.paused : null,
      allVoiceCount: allVoiceIds.length,
      andrewInList: allVoiceIds.includes(ANDREW),
      davidInList: allVoiceIds.includes(DAVID),
      popupMounted: !!mounted,
    };
    state.fixtureLiveListBefore = liveEntryFor(liveList, item.id);
    state.fixtureAudio = myEngine ? { audioState: myEngine.audio ? myEngine.audio.state : null, playing: myEngine.playing ?? null } : null;
    // The owner's reader, for the no-other-reader-changed comparison
    const other = (Zotero.Reader._readers || []).find((r) => r.itemID !== item.id);
    state.otherReaderBefore = other ? { itemID: other.itemID, selectedVoiceID: waived(other._internalReader?._readAloudManager)?.selectedVoiceID ?? null } : null;
    const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const mine = (docVoices.readers || []).find((r) => r.key && r.key.endsWith(item.key)) || null;
    state.fixtureDocVoiceSaved = mine ? mine.saved : null;
    // 7. Minimize again — the mount evidence is in
    if (win.windowState !== 2) win.minimize ? win.minimize() : null;
    await sleep(300);
    return JSON.stringify({
      fixture: state.fixture,
      docVoiceKey: docVoiceKey,
      docVoiceSaved: state.fixtureDocVoiceSaved,
      popupMounted: state.fixtureManager.popupMounted,
      selectedVoiceID: state.fixtureManager.selectedVoiceID,
      voiceAppliedByEntry: voiceApplied,
      selectedTier: state.fixtureManager.selectedTier,
      active: state.fixtureManager.active, paused: state.fixtureManager.paused,
      controllerPaused: state.fixtureManager.controllerPaused,
      allVoiceCount: state.fixtureManager.allVoiceCount,
      davidInList: state.fixtureManager.davidInList,
      andrewInListBefore: state.fixtureManager.andrewInList,
      liveListBefore: state.fixtureLiveListBefore,
      audio: state.fixtureAudio,
      otherReaderBefore: state.otherReaderBefore,
      windowStateNow: Services.wm.getMostRecentWindow('navigator:browser').windowState,
    });
  } catch (e) {
    try { const win = Services.wm.getMostRecentWindow('navigator:browser'); if (win && win.windowState !== 2 && win.minimize) win.minimize(); } catch (_) {}
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 500) });
  }
})()
