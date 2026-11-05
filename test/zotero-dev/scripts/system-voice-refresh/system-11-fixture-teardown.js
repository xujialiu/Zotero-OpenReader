// system-voice-refresh 11: fixture teardown (#241 item 6, part 1). Close only the
// fixture reader tab, erase only the imported fixture, require the position rows back
// at the baseline, and remove the fixture document-voice entry.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    if (!state.fixture) throw new Error('fixture state missing');
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === state.fixture.itemID);
    let tabClosed = false;
    if (reader && reader.tabID) {
      win.Zotero_Tabs.close(reader.tabID);
      for (let i = 0; i < 30; i++) { await sleep(200); if (!(Zotero.Reader._readers || []).some((r) => r.itemID === state.fixture.itemID)) { tabClosed = true; break; } }
    } else if (!reader) { tabClosed = true; }
    // Restore the user's selected tab before any other work (recorded at baseline)
    let selectedRestored = false;
    try {
      if (win.Zotero_Tabs.selectedID !== state.selectedTabBefore.selectedID && win.Zotero_Tabs._tabs.some((t) => t.id === state.selectedTabBefore.selectedID)) {
        win.Zotero_Tabs.select(state.selectedTabBefore.selectedID);
        selectedRestored = win.Zotero_Tabs.selectedID === state.selectedTabBefore.selectedID;
      } else selectedRestored = win.Zotero_Tabs.selectedID === state.selectedTabBefore.selectedID;
    } catch (e) { selectedRestored = 'error: ' + String(e).slice(0, 80); }
    // Erase the imported fixture
    const item = Zotero.Items.get(state.fixture.itemID);
    let erased = false;
    if (item) { await item.eraseTx(); erased = !Zotero.Items.get(state.fixture.itemID); }
    await sleep(500);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const rowsNow = pos.database ? pos.database.rows : null;
    // Remove the fixture document-voice entry
    let entryRemoved = false;
    try { Services.prefs.clearUserPref(state.fixtureDocVoiceKey); entryRemoved = !Services.prefs.prefHasUserValue(state.fixtureDocVoiceKey); } catch (e) { entryRemoved = 'error: ' + String(e).slice(0, 80); }
    const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const recordsNow = docVoices.records || {};
    const recordsBefore = state.docVoicesBefore || {};
    const beforeKeys = Object.keys(recordsBefore).sort();
    const nowKeys = Object.keys(recordsNow).sort();
    return JSON.stringify({
      tabClosed, selectedRestored,
      erased, rowsBaseline: state.rowsBaseline, rowsNow, rowsBackAtBaseline: rowsNow === state.rowsBaseline,
      entryRemoved,
      docVoiceKeysMatchBaseline: JSON.stringify(beforeKeys) === JSON.stringify(nowKeys),
      docVoiceKeyCounts: { before: beforeKeys.length, now: nowKeys.length },
      readersNow: (Zotero.Reader._readers || []).map((r) => r.itemID),
      selectedTabNow: win.Zotero_Tabs.selectedID,
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
