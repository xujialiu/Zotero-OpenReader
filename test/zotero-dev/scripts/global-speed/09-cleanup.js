// Issue #82 item 7: cleanup. Restores the shared file as found, every snapshotted
// pref (readAloud.memory LAST, verbatim), erases the fixtures and closes their
// tabs, leaves globalSpeedMigrated/speedPercent in the state the installed beta
// produces for the owner's own speed (1.45 → 145), restores the host geometry and
// selected tab, then leaves the window minimized. The errors are read by the
// bridge afterwards; this script only records the counts it saw.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL', steps: {} };
  const setBool = (name, value) => { const k = prefix + name; if (value === null || value === undefined) { if (p.prefHasUserValue(k)) p.clearUserPref(k); } else p.setBoolPref(k, !!value); };

  try {
    // 1. The shared file back to its pre-run bytes (the stale file 01 removed)
    const auth = () => {
      const u = p.prefHasUserValue(prefix + 'webdav.username') ? p.getStringPref(prefix + 'webdav.username') : '';
      const w = p.prefHasUserValue(prefix + 'webdav.password') ? p.getStringPref(prefix + 'webdav.password') : '';
      if (!u) return {};
      const bytes = new TextEncoder().encode(u + ':' + w);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { Authorization: 'Basic ' + btoa(binary) };
    };
    const fileUrl = () => p.getStringPref(prefix + 'webdav.url').replace(/\/?$/, '/') + 'zotero-tts-shared-settings.json';
    if (state.sharedFileBefore !== null && state.sharedFileBefore !== undefined) {
      const r = await fetch(fileUrl(), { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: state.sharedFileBefore });
      if (!r.ok) throw new Error('restoring the pre-run shared file: HTTP ' + r.status);
      out.steps.sharedFile = 'restored pre-run bytes (' + state.sharedFileBefore.length + ' chars)';
    } else {
      const r = await fetch(fileUrl(), { method: 'DELETE', headers: auth() });
      out.steps.sharedFile = 'deleted (the folder held no file before the run; HTTP ' + r.status + ')';
    }

    // 2. Sync/backup switches and the connection back to the owner's state
    const b = state.baseline;
    setBool('webdav.syncSettings', b['webdav.syncSettings'].value);
    setBool('webdav.syncPositions', b['webdav.syncPositions'].value);
    setBool('webdav.autoUploadSettings', b['webdav.autoUploadSettings'].value);
    p.setStringPref(prefix + 'webdav.url', b['webdav.url'].value);
    if (b['webdav.syncState'].hasUser) p.setStringPref(prefix + 'webdav.syncState', b['webdav.syncState'].value);
    else if (p.prefHasUserValue(prefix + 'webdav.syncState')) p.clearUserPref(prefix + 'webdav.syncState');
    out.steps.webdav = { switches: { settings: b['webdav.syncSettings'].value, positions: b['webdav.syncPositions'].value, autoUpload: b['webdav.autoUploadSettings'].value }, urlChars: String(b['webdav.url'].value).length, syncStateRestored: b['webdav.syncState'].hasUser };

    // 3. Close the fixture players and tabs, erase the fixture items
    for (const which of ['readerA', 'readerB']) {
      const entry = state[which];
      const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === entry.itemID);
      if (reader) { try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {} }
    }
    await waitFor(() => (Zotero.Reader._readers ?? []).every(r => ![state.readerA.itemID, state.readerB.itemID].includes(r.itemID) || !r._internalReader?._readAloudManager?.active), 10000, 150);
    const host0 = Services.wm.getMostRecentWindow('navigator:browser');
    for (const which of ['readerA', 'readerB']) {
      const entry = state[which];
      if (host0?.Zotero_Tabs && entry.tabID) { try { host0.Zotero_Tabs.close(entry.tabID); } catch (e) {} }
    }
    await waitFor(() => (Zotero.Reader._readers ?? []).every(r => ![state.readerA.itemID, state.readerB.itemID].includes(r.itemID)), 10000, 150);
    for (const which of ['fixtureA', 'fixtureB']) {
      const item = Zotero.Items.get(state[which].itemID);
      if (item) await item.eraseTx();
    }
    await waitFor(() => !Zotero.Items.get(state.fixtureA.itemID) && !Zotero.Items.get(state.fixtureB.itemID), 10000, 150);
    const position = JSON.parse(await d.position());
    out.steps.fixtures = {
      erased: !Zotero.Items.get(state.fixtureA.itemID) && !Zotero.Items.get(state.fixtureB.itemID),
      tabsClosed: (Zotero.Reader._readers ?? []).every(r => ![state.readerA.itemID, state.readerB.itemID].includes(r.itemID)),
      positionRows: position?.database?.rows ?? null,
      legacyPref: position?.legacyPref ?? null,
    };

    // 4. Prefs back, in order; the global speed to the beta's state for the
    // owner's own speed; memory LAST, verbatim. The speedPercent write fires
    // the spread before the voices pref is restored, so its rewrite is undone.
    const fishBefore = state.fishEnabledBefore;
    if (fishBefore.user) setBool('fish.enabled', fishBefore.value); else if (p.prefHasUserValue(prefix + 'fish.enabled')) p.clearUserPref(prefix + 'fish.enabled');
    const vol = state.volumeBefore;
    if (vol.hasUser) p.setIntPref(prefix + 'readAloud.volume', Number(vol.value)); else if (p.prefHasUserValue(prefix + 'readAloud.volume')) p.clearUserPref(prefix + 'readAloud.volume');
    if (b['readAloud.globalSpeed'].hasUser) p.setBoolPref(prefix + 'readAloud.globalSpeed', !!b['readAloud.globalSpeed'].value);
    else if (p.prefHasUserValue(prefix + 'readAloud.globalSpeed')) p.clearUserPref(prefix + 'readAloud.globalSpeed');
    // The global speed the beta produces for the owner's recorded speed
    if (state.expectedSpeedPercent === null) { if (p.prefHasUserValue(prefix + 'readAloud.speedPercent')) p.clearUserPref(prefix + 'readAloud.speedPercent'); }
    else p.setIntPref(prefix + 'readAloud.speedPercent', Number(state.expectedSpeedPercent));
    await sleep(800); // the spread of the speed write lands (no players open)
    p.setStringPref('extensions.zotero.reader.readAloudVoices', b['reader.readAloudVoices'].value);
    await sleep(500);
    p.setStringPref(prefix + 'readAloud.memory', b['readAloud.memory'].value);
    await sleep(500);
    out.steps.prefs = {
      fishEnabledCleared: !p.prefHasUserValue(prefix + 'fish.enabled'),
      volume: { value: p.prefHasUserValue(prefix + 'readAloud.volume') ? p.getIntPref(prefix + 'readAloud.volume') : 100, hasUser: p.prefHasUserValue(prefix + 'readAloud.volume') },
      globalSpeed: p.getBoolPref(prefix + 'readAloud.globalSpeed'),
      speedPercent: p.prefHasUserValue(prefix + 'readAloud.speedPercent') ? p.getIntPref(prefix + 'readAloud.speedPercent') : null,
      globalSpeedMigratedLeft: p.getBoolPref(prefix + 'globalSpeedMigrated'),
      voicesByteIdentical: p.getStringPref('extensions.zotero.reader.readAloudVoices') === b['reader.readAloudVoices'].value,
      memoryByteIdentical: p.getStringPref(prefix + 'readAloud.memory') === b['readAloud.memory'].value,
    };

    // 5. Host geometry and selected tab back, then minimized (the owner's exception)
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host && state.hostBefore) {
      const hb = state.hostBefore;
      try {
        if (hb.selectedTab && host.Zotero_Tabs?._tabs?.some(t => t.id === hb.selectedTab)) host.Zotero_Tabs.select(hb.selectedTab);
        if (host.windowState === 2 || host.windowState !== hb.windowState) {
          if (hb.windowState === 1) host.restore();
          host.screenX = hb.screenX; host.screenY = hb.screenY; host.outerWidth = hb.outerWidth; host.outerHeight = hb.outerHeight;
        }
      } catch (e) { out.steps.hostError = String(e); }
      if (host.minimize) host.minimize();
      out.steps.host = { minimized: host.windowState === 2, selectedTabRestored: host.Zotero_Tabs?.selectedID === state.hostBefore.selectedTab };
    }

    // 6. What the beta leaves behind, and the error counters for the bridge read
    const mem = JSON.parse(await d.readAloudMemory());
    out.leftBehind = {
      speedMigrated: mem.speedMigrated,
      speedPercent: mem.speedPercent,
      memorySpeed: mem.memory?.speed ?? null,
      memoryVoice: mem.memory?.voice ?? null,
      zoteroSpeeds: Object.fromEntries(Object.entries(mem.zotero ?? {}).map(([k, v]) => [k, v.speed])),
    };
    let errorsNow = [];
    try { errorsNow = (Zotero.getErrors() ?? []).slice(0, 40); } catch (e) {}
    out.errors = { before: (state.errorsBefore ?? []).length, now: errorsNow.length };

    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    throw new Error(JSON.stringify(out));
  }
})()
