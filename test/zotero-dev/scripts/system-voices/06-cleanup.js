// Cleanup: fixture player closed and erased (rows back to baseline), settings window closed,
// System voices off through the pane's own switch, prefs restored in order —
// volume, azure.region, reader.readAloudVoices (after the tab is closed), readAloud.memory LAST —
// the WebDAV folder snapshot back and confirmed, debug store restored, host window minimized.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const base = state.baseline || {};
  const out = { steps: {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PREF = 'extensions.zotero.';
  const step = (name, fn) => { try { out.steps[name] = fn(); } catch (e) { out.steps[name] = 'ERR: ' + (e && e.message || e); } };
  const asyncStep = async (name, fn) => { try { out.steps[name] = await fn(); } catch (e) { out.steps[name] = 'ERR: ' + (e && e.message || e); } };
  const setTo = (name, value) => {
    if (value.type === 'bool') Services.prefs.setBoolPref(PREF + name, value.value);
    else if (value.type === 'int') Services.prefs.setIntPref(PREF + name, value.value);
    else if (value.type === 'string') Services.prefs.setStringPref(PREF + name, value.value);
    else Services.prefs.clearUserPref(PREF + name);
    return Services.prefs.prefHasUserValue(PREF + name) ? 'user-value' : 'default';
  };
  const eq = (name, value) => {
    const t = Services.prefs.getPrefType(PREF + name);
    if (value.type === 'bool' && t === Services.prefs.PREF_BOOL) return Services.prefs.getBoolPref(PREF + name) === value.value;
    if (value.type === 'int' && t === Services.prefs.PREF_INT) return Services.prefs.getIntPref(PREF + name) === value.value;
    if (value.type === 'string' && t === Services.prefs.PREF_STRING) return Services.prefs.getStringPref(PREF + name) === value.value;
    return t === 0; // both absent
  };

  // 1. Close the fixture's player, then the tab, then erase the item.
  await asyncStep('fixture', async () => {
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === state.fixtureItemID);
    let closed = 'already gone';
    if (reader && reader._internalReader) {
      const m = reader._internalReader._readAloudManager;
      const wasActive = !!(m && m.active);
      const wasPaused = !!(m && m.paused);
      if (reader._internalReader._readAloudPopupOpen || wasActive) {
        reader._internalReader.toggleReadAloudPopup(false);
        await sleep(400);
      }
      closed = { wasActive, wasPaused, popupClosed: true };
    }
    const tabID = state.fixtureTabID;
    if (tabID) { try { Zotero.getMainWindow().Zotero_Tabs.close(tabID); } catch (e) { closed.tabErr = String(e.message || e); } }
    await sleep(600);
    const item = Zotero.Items.get(state.fixtureItemID);
    if (item) await item.eraseTx();
    await sleep(800);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    return { ...closed, rowsNow: pos.database.rows, rowsBefore: state.rowsBefore, gone: !Zotero.Items.get(state.fixtureItemID) };
  });

  // 2. The fixture's documentVoices entry was created by this run's opens; clear it.
  step('fixtureDocVoice', () => {
    const name = state.fixtureDocVoicePref;
    if (!name) return 'none recorded';
    Services.prefs.clearUserPref(name);
    return { cleared: !Services.prefs.prefHasUserValue(name) };
  });

  // 3. reader.readAloudVoices — restored only after the tab is closed (an observer re-persists over a restore).
  step('readAloudVoices', () => base['reader.readAloudVoices'] ? (setTo('reader.readAloudVoices', base['reader.readAloudVoices']), eq('reader.readAloudVoices', base['reader.readAloudVoices'])) : 'no snapshot');

  // 4. System voices off through the pane's own switch, then byte-identical (the profile had no user value).
  await asyncStep('systemSwitch', async () => {
    const before = Services.prefs.getBoolPref(PREF + 'zotero-tts.system.enabled');
    if (before === true) {
      let win = Services.wm.getMostRecentWindow('zotero:pref');
      if (!win) {
        Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
        for (let i = 0; i < 40 && !Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(250);
        win = Services.wm.getMostRecentWindow('zotero:pref');
      }
      if (win) {
        await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
        for (let i = 0; i < 40; i++) { if (win.document.getElementById('ztts-enable-system')) break; await sleep(250); }
        const button = win.document.getElementById('ztts-enable-system');
        if (button) {
          button.click();
          for (let i = 0; i < 20 && Services.prefs.getBoolPref(PREF + 'zotero-tts.system.enabled') === true; i++) await sleep(250);
        }
      }
    }
    // Byte-identical: the profile kept the switch at its default (no user value).
    Services.prefs.clearUserPref(PREF + 'zotero-tts.system.enabled');
    return { off: Services.prefs.getBoolPref(PREF + 'zotero-tts.system.enabled') === false, userValue: Services.prefs.prefHasUserValue(PREF + 'zotero-tts.system.enabled') };
  });

  // 5. azure.region back exactly as found (already restored by the sample step's finally; verified here).
  step('azureRegion', () => {
    const snap = base['zotero-tts.azure.region'];
    if (!snap) return 'no snapshot';
    Services.prefs.clearUserPref(PREF + 'zotero-tts.azure.region');
    return { value: Services.prefs.getStringPref(PREF + 'zotero-tts.azure.region'), userValue: Services.prefs.prefHasUserValue(PREF + 'zotero-tts.azure.region'), asFound: snap.value };
  });

  // 6. The default voice the memory-sync applies — restored verbatim.
  step('defaultVoice', () => base['zotero-tts.readAloud.defaultVoice'] ? (setTo('zotero-tts.readAloud.defaultVoice', base['zotero-tts.readAloud.defaultVoice']), eq('zotero-tts.readAloud.defaultVoice', base['zotero-tts.readAloud.defaultVoice'])) : 'no snapshot');

  // 7. Volume back exactly as found.
  step('volume', () => base['zotero-tts.readAloud.volume'] ? (setTo('zotero-tts.readAloud.volume', base['zotero-tts.readAloud.volume']), eq('zotero-tts.readAloud.volume', base['zotero-tts.readAloud.volume'])) : 'no snapshot');

  // 8. readAloud.memory LAST, verbatim.
  step('memory', () => base['zotero-tts.readAloud.memory'] ? (setTo('zotero-tts.readAloud.memory', base['zotero-tts.readAloud.memory']), eq('zotero-tts.readAloud.memory', base['zotero-tts.readAloud.memory'])) : 'no snapshot');

  // 9. The WebDAV folder snapshot back and confirmed.
  await asyncStep('webdavFolder', async () => {
    const snap = base['zotero-tts.webdav.enabled'];
    Services.prefs.setBoolPref(PREF + 'zotero-tts.webdav.enabled', snap.value === true);
    const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    return { restoredValue: Services.prefs.getBoolPref(PREF + 'zotero-tts.webdav.enabled'), userValue: Services.prefs.prefHasUserValue(PREF + 'zotero-tts.webdav.enabled'), folderInDiagnostics: sync.folder };
  });

  // 10. Settings window closed; host window minimized (the owner's standing exception).
  step('windows', () => {
    const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (prefWin) prefWin.close();
    const w = Zotero.getMainWindow();
    if (w.windowState !== 2) w.windowState = 2;
    return { settingsClosed: !Services.wm.getMostRecentWindow('zotero:pref'), windowState: Zotero.getMainWindow().windowState };
  });

  // 11. Debug store back as found.
  step('debugStore', () => { Zotero.Debug.setStore(state.debugStoringBefore === true); return Zotero.Debug.storing; });

  // 12. Reader tabs back to the owner's selection where the fixture took it.
  step('selectedTab', () => {
    const w = Zotero.getMainWindow();
    const wanted = state.host && state.host.selectedTab;
    if (wanted && w.Zotero_Tabs && w.Zotero_Tabs.selectedID !== wanted) {
      try { w.Zotero_Tabs.select(wanted); return { back: w.Zotero_Tabs.selectedID === wanted }; } catch (e) { return 'ERR: ' + e.message; }
    }
    return { selectedID: w.Zotero_Tabs ? w.Zotero_Tabs.selectedID : null };
  });

  out.errorsRing = String(Zotero.getErrors ? (Zotero.getErrors() || []).length : 'n/a');
  return JSON.stringify(out);
})()
