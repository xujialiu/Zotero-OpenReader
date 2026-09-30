// Reading guard runs, fixtures (2026-09-30, run r46; revises the old 01-fixtures-kokoro.js).
// Enables the configured Kokoro (local) and the System voices through the settings pane,
// imports two disposable fixtures, opens X paused on a listed local voice and Y paused on
// a listed system voice, and leaves Y's tab in the background. No player is open while the
// switches flip, so the reading guard is not involved.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, P = run.params;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const path = (...parts) => PathUtils.join(String(P.fixturesDir || ''), ...parts);
  const prefKey = name => 'extensions.zotero.zotero-tts.' + name;
  const findReader = itemID => {
    for (const r of Zotero.Reader._readers || []) if (r?.itemID === itemID) return r;
    return null;
  };
  const titleOf = itemID => {
    try { const item = Zotero.Items.get(itemID); return item?.parentItem?.title || item?.getField?.('title') || String(itemID); } catch { return String(itemID); }
  };
  const getPane = async () => {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!win) throw new Error('settings window did not open');
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    for (let i = 0; i < 100; i++) {
      if (win.document.getElementById('ztts-enable-local')) return win;
      await sleep(100);
    }
    throw new Error('Zotero-TTS settings pane did not initialize');
  };
  const enableViaPane = async (doc, id, ms = 30000) => {
    const button = doc.getElementById('ztts-enable-' + id);
    if (!button) throw new Error('switch is missing: ' + id);
    const before = { enabled: Services.prefs.getBoolPref(prefKey(id + '.enabled')), label: button.getAttribute('label') };
    let sawNotice = false, sawChecking = false;
    if (!before.enabled) {
      button.click();
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const label = button.getAttribute('label') || '';
        const result = doc.getElementById('ztts-test-result-' + id)?.textContent || '';
        if (/checking|testing/i.test(label + ' ' + result)) sawChecking = true;
        if (doc.getElementById('ztts-notice')) { sawNotice = true; break; }
        if (Services.prefs.getBoolPref(prefKey(id + '.enabled')) === true && !/checking|testing/i.test(label)) break;
        await sleep(200);
      }
    }
    const after = {
      enabled: Services.prefs.getBoolPref(prefKey(id + '.enabled')),
      label: button.getAttribute('label'),
      result: doc.getElementById('ztts-test-result-' + id)?.textContent || '',
      blocked: !!button.disabled,
      sawNotice,
    };
    if (!after.enabled) throw new Error('provider could not be enabled through the pane: ' + id + ' ' + JSON.stringify({ before, after }));
    if (sawNotice) throw new Error('unexpected reading-guard notice while enabling ' + id);
    return { before, after, sawChecking };
  };
  const waitNoListing = async doc => {
    for (let i = 0; i < 160; i++) {
      const text = doc.getElementById('ztts-voices-status')?.textContent || '';
      if (!/listing voices/i.test(text)) return text;
      await sleep(100);
    }
    return doc.getElementById('ztts-voices-status')?.textContent || '';
  };
  const pane = await getPane();
  try { pane.focus(); } catch {}
  const doc = pane.document;
  const local = await enableViaPane(doc, 'local');
  const system = await enableViaPane(doc, 'system');
  await waitNoListing(doc);

  // Independent choices for the two fixtures while no tab reads yet; restored at teardown.
  // Recorded once: a revised run must not snapshot an already-changed value.
  const sameVoiceKey = prefKey('readAloud.sameForAllDocuments');
  if (state.sameVoiceBefore === undefined) state.sameVoiceBefore = Services.prefs.getBoolPref(sameVoiceKey);
  if (state.sameVoiceBefore) Services.prefs.setBoolPref(sameVoiceKey, false);

  const stamp = Date.now();
  const specs = [
    { kind: 'pdf', file: path('fixture-a.pdf'), title: `Zotero-TTS #160 PDF ${stamp}` },
    { kind: 'epub', file: path('return-key', 'return-key.epub'), title: `Zotero-TTS #160 EPUB ${stamp}` },
  ];
  const fixtures = [];
  for (const spec of specs) {
    const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title: spec.title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item for ' + spec.kind);
    fixtures.push({ kind: spec.kind, itemID: item.id, key: item.key, title: spec.title });
  }
  state.fixtures = fixtures;

  // X reads a listed local voice. Kokoro's configured default is af_bella; the
  // browser list confirms the encoded id before the memory names it.
  let localVoice = null;
  const listRows = doc.querySelectorAll('#ztts-voices-list [data-voice-id], #ztts-voices-list [data-id]');
  for (const row of listRows) {
    const encoded = row.getAttribute('data-voice-id') || row.getAttribute('data-id') || '';
    if (/^local::/.test(encoded)) { localVoice = encoded; break; }
  }
  if (!localVoice) localVoice = 'local::af_bella';
  const memoryKey = prefKey('readAloud.memory');
  let memory = {};
  try { memory = JSON.parse(Services.prefs.getStringPref(memoryKey)); } catch {}
  memory.voice = { id: localVoice, lang: 'en' };
  Services.prefs.setStringPref(memoryKey, JSON.stringify(memory));
  state.fixtureVoice = localVoice;

  const openPaused = async (fixture, wantedPrefix, tier) => {
    let reader = findReader(fixture.itemID);
    if (!reader) Zotero.Reader.open(fixture.itemID);
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = findReader(fixture.itemID);
      if (reader?._internalReader?._readAloudManager) break;
      await sleep(150);
    }
    if (!reader?._internalReader?._readAloudManager) throw new Error('reader manager not ready for ' + fixture.kind);
    const main = Zotero.getMainWindow?.();
    try { main?.Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch {}
    const ir = reader._internalReader, manager = ir._readAloudManager;
    try { ir.toggleReadAloudPopup(true); } catch (e) { throw new Error('popup open failed for ' + fixture.kind + ': ' + String(e)); }
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
      if (manager.active && manager._allVoices?.length && manager._controller) break;
      await sleep(100);
    }
    const startsWanted = typeof manager.selectedVoiceID === 'string' && manager.selectedVoiceID.startsWith(wantedPrefix);
    if (!startsWanted) {
      // The tier id is the voice entry's own tier (the local provider's tier is
      // engine-named); a selectVoice outside the selected tier is dropped.
      let picked = null, pickedTier = null;
      for (let i = 0; i < (manager._allVoices?.length || 0); i++) {
        const v = manager._allVoices[i];
        if (typeof v?.id === 'string' && v.id.startsWith(wantedPrefix) && /en/i.test(v.id)) { picked = v.id; pickedTier = v.tier || tier; break; }
      }
      if (!picked) for (let i = 0; i < (manager._allVoices?.length || 0); i++) {
        const v = manager._allVoices[i];
        if (typeof v?.id === 'string' && v.id.startsWith(wantedPrefix)) { picked = v.id; pickedTier = v.tier || tier; break; }
      }
      if (!picked) throw new Error('no ' + wantedPrefix + ' voice in the list for ' + fixture.kind);
      try { manager.selectTier(pickedTier); manager.selectVoice(picked); } catch (e) { throw new Error('could not select voice for ' + fixture.kind + ' (tier ' + pickedTier + '): ' + String(e)); }
      const t2 = Date.now();
      while (Date.now() - t2 < 15000) {
        if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
        if (manager.active && manager.paused && manager.selectedVoiceID === picked) break;
        await sleep(100);
      }
      // One retry: the first pick can race the tier list still loading.
      if (manager.selectedVoiceID !== picked) {
        try { manager.selectTier(pickedTier); manager.selectVoice(picked); } catch (e) {}
        const t2b = Date.now();
        while (Date.now() - t2b < 15000) {
          if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
          if (manager.active && manager.paused && manager.selectedVoiceID === picked) break;
          await sleep(100);
        }
      }
    }
    const t3 = Date.now();
    while (Date.now() - t3 < 15000) {
      if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
      if (manager.active && manager.paused && String(manager.selectedVoiceID || '').startsWith(wantedPrefix)) break;
      await sleep(100);
    }
    if (!manager.active || !manager.paused || !String(manager.selectedVoiceID || '').startsWith(wantedPrefix)) {
      throw new Error('fixture did not reach paused state on ' + wantedPrefix + ': ' + JSON.stringify({ kind: fixture.kind, active: !!manager.active, paused: !!manager.paused, voice: manager.selectedVoiceID || null }));
    }
    return { itemID: fixture.itemID, tabID: reader.tabID, title: titleOf(fixture.itemID), reader, manager, internal: ir,
      popupOpen: !!ir._state?.readAloudState?.popupOpen, selectedVoice: manager.selectedVoiceID || null,
      controller: manager._controller, voices: manager._allVoices?.length ?? 0 };
  };
  const opened = [];
  opened.push(await openPaused(fixtures[0], 'local::', 'local'));
  opened.push(await openPaused(fixtures[1], 'system::', 'system'));
  state.opened = opened;
  if (opened[0]?.selectedVoice) state.fixtureVoice = opened[0].selectedVoice;
  // Y's tab goes to the background; X's tab stays selected.
  const main = Zotero.getMainWindow?.();
  try { main?.Zotero_Tabs?.select(opened[0].tabID); } catch {}
  await sleep(200);
  try { pane.minimize?.(); } catch {}
  const lists = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
  return JSON.stringify({
    status: 'PASS',
    local: { before: local.before, after: local.after },
    system: { before: system.before, after: system.after },
    fixtures: opened.map(x => ({ kind: fixtures.find(f => f.itemID === x.itemID)?.kind, itemID: x.itemID, tabID: x.tabID, title: x.title,
      active: !!x.manager.active, paused: !!x.manager.paused, popupOpen: x.popupOpen, selectedVoice: x.selectedVoice, voices: x.voices })),
    fixtureVoice: state.fixtureVoice,
    selectedTab: main?.Zotero_Tabs?.selectedID || null,
    liveVoiceList: lists,
  }, null, 1);
})()
