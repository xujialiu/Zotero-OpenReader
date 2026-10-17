// 1.17 player list: import fixture-a, open it, open the Player in the selected tab (the default
// voice points at the free System Daniel since 02, so activation picks it and plays), pause at
// once, probe the audio device, then walk the manager's _allVoices by index — 193 ids starting
// system::, none twice.
return (async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => Components.utils.waiveXrays(v);
  try {
    if (!state.memoryVoice) throw new Error('run 02 first: the default voice must name a listed free voice before any popup opens');
    // Import as a standalone attachment (baseline: fixtures are imported per case).
    const item = await Zotero.Attachments.importFromFile({
      file: P.fixturesDir + '/fixture-a.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title: P.fixtureTitle
    });
    state.fixtureItemID = item.id;
    out.imported = { itemID: item.id, title: P.fixtureTitle };
    // Open and poll for the reader's internals (≤7 s polls, ~24 s ceiling).
    await Zotero.Reader.open(item.id);
    let reader = null;
    for (let i = 0; i < 4; i++) {
      await sleep(7000);
      reader = (Zotero.Reader._readers || []).find((r) => r.itemID === item.id);
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    }
    if (!reader || !reader._internalReader || !reader._internalReader._readAloudManager) {
      throw new Error('fixture reader not ready within the ceiling');
    }
    out.readerReady = true;
    state.fixtureTabID = Zotero.getMainWindow().Zotero_Tabs.selectedID;
    // Open the Player and pause in the SAME script (opening starts playback on the free voice).
    reader._internalReader.toggleReadAloudPopup(true);
    await sleep(800);
    const m = waive(reader._internalReader._readAloudManager);
    out.afterOpen = {
      active: !!m.active, paused: !!m.paused,
      selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
      tier: m.selectedTier ? String(m.selectedTier) : null,
      lang: m.lang ? String(m.lang) : null
    };
    // Audio probe: two engine reads ~500 ms apart while the session plays.
    const eng1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const mine1 = (eng1.readers || []).find((r) => r.itemID === item.id) || {};
    await sleep(500);
    const eng2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const mine2 = (eng2.readers || []).find((r) => r.itemID === item.id) || {};
    out.audioProbe = {
      state1: mine1.audio && mine1.audio.state, time1: mine1.session && mine1.session.playbackTime,
      state2: mine2.audio && mine2.audio.state, time2: mine2.session && mine2.session.playbackTime
    };
    // Pause the reading (idle from here).
    reader._internalReader.toggleReadAloudPaused();
    await sleep(300);
    out.afterPause = { active: !!m.active, paused: !!m.paused };
    // _allVoices: reader-realm array — walk by index, never find/filter from chrome.
    const all = m.allVoices;
    const ids = [];
    for (let i = 0; i < (all ? all.length : 0); i++) ids.push(String(all[i].id));
    out.allVoicesCount = ids.length;
    out.systemIds = ids.filter((id) => id.startsWith('system::')).length;
    const seen = new Map();
    for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
    const dups = [];
    for (const [id, n] of seen) if (n > 1) dups.push({ id, n });
    out.duplicateIds = dups;
    out.distinctIds = seen.size;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
