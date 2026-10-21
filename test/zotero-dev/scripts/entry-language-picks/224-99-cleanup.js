// Issue #224 cleanup: close and erase the fixture, restore every saved pref and
// user-value flag byte-identically (memory last), the fixture's document voice
// record, the documentVoiceChanged pulse, the owner's selected tab, the debug
// store, and confirm the WebDAV folder is still off. Leaves the host minimized
// (the workflow's final state).
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', steps: {}, errors: [] };
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Close the fixture's player if it is still active, then the reader tab.
    // Zotero 11: Zotero.Reader.close is missing — close the tab through Zotero_Tabs.close.
    try {
      const list = Zotero.Reader._readers ?? [];
      for (let i = 0; i < list.length; i++) {
        if (list[i]?.itemID === S.itemID) {
          const internal = list[i]._internalReader;
          if (internal?._readAloudManager?.active) internal.toggleReadAloudPopup(false);
          await sleep(300);
          try { Zotero_Tabs.close(list[i].tabID); } catch (e) { out.errors.push('close tab: ' + String(e)); }
        }
      }
    } catch (e) { out.errors.push('player close: ' + String(e)); }
    await sleep(500);

    // Erase the fixture item (Zotero 11: Zotero.Items.eraseTx is missing).
    if (S.itemID) {
      const item = Zotero.Items.get(S.itemID);
      if (item) { await Zotero.Items.erase([S.itemID]); out.steps.fixtureErased = true; } else out.steps.fixtureErased = 'already gone';
    }
    await sleep(500);
    const left = (Zotero.Reader._readers ?? []).filter((r) => r.itemID === S.itemID).length;
    out.steps.fixtureReadersLeft = left;

    // Restore the fixture's document voice record and the pulse byte-identically.
    // The record lives on the ep224 state (documentVoiceBefore), not in prefSnapshot.
    const snap = S.prefSnapshot ?? {};
    const rec = S.documentVoiceBefore;
    const keyFull = prefix + 'documentVoices.user/' + S.itemKey;
    if (rec === null || rec === undefined) { try { p.clearUserPref(keyFull); } catch (e) {} }
    else p.setStringPref(keyFull, rec);
    if (snap.documentVoiceChangedPulse) {
      if (snap.documentVoiceChangedPulse.absent) { try { p.clearUserPref(prefix + 'documentVoiceChanged'); } catch (e) {} }
      else p.setStringPref(prefix + 'documentVoiceChanged', snap.documentVoiceChangedPulse.value);
    }
    out.steps.recordCleared = (() => { try { return !p.getStringPref(keyFull); } catch (e) { return true; } })(); // a cleared pref with no default throws on read

    // Prefs back in order: readAloudVoices, then volume/globalSpeed bits, memory LAST.
    if (snap['extensions.zotero.reader.readAloudVoices']) {
      const s = snap['extensions.zotero.reader.readAloudVoices'];
      if (s.hasUserValue) p.setStringPref('extensions.zotero.reader.readAloudVoices', s.value);
      else { try { p.clearUserPref('extensions.zotero.reader.readAloudVoices'); } catch (e) {} }
    }
    if (snap['readAloud.volume']) {
      const s = snap['readAloud.volume'];
      if (s.hasUserValue) p.setIntPref(prefix + 'readAloud.volume', s.value);
      else { try { p.clearUserPref(prefix + 'readAloud.volume'); } catch (e) {} }
    }
    if (snap['readAloud.speed'] && !snap['readAloud.speed'].absent) {
      const s = snap['readAloud.speed'];
      if (s.hasUserValue) p.setIntPref(prefix + 'readAloud.speed', s.value);
      else { try { p.clearUserPref(prefix + 'readAloud.speed'); } catch (e) {} }
    }
    if (snap['readAloud.globalSpeed'] && !snap['readAloud.globalSpeed'].absent) {
      const s = snap['readAloud.globalSpeed'];
      if (s.hasUserValue) p.setBoolPref(prefix + 'readAloud.globalSpeed', s.value);
      else { try { p.clearUserPref(prefix + 'readAloud.globalSpeed'); } catch (e) {} }
    }
    if (snap['readAloud.openExpanded'] && !snap['readAloud.openExpanded'].absent) {
      const s = snap['readAloud.openExpanded'];
      if (s.hasUserValue) p.setBoolPref(prefix + 'readAloud.openExpanded', s.value);
      else { try { p.clearUserPref(prefix + 'readAloud.openExpanded'); } catch (e) {} }
    }
    if (snap['readAloud.memory']) {
      const s = snap['readAloud.memory'];
      if (s.hasUserValue) p.setStringPref(prefix + 'readAloud.memory', s.value);
      else { try { p.clearUserPref(prefix + 'readAloud.memory'); } catch (e) {} }
    }
    out.steps.memoryRestored = (() => { try { return p.getStringPref(prefix + 'readAloud.memory') === (snap['readAloud.memory']?.value ?? null); } catch (e) { return false; } })();
    out.steps.volumeNow = snap['readAloud.volume']?.hasUserValue ? p.getIntPref(prefix + 'readAloud.volume') : '(default)';
    out.steps.readAloudVoicesRestored = p.getStringPref('extensions.zotero.reader.readAloudVoices') === snap['extensions.zotero.reader.readAloudVoices']?.value;

    // The owner's tab back.
    if (S.host?.ownerTabID) {
      try { Zotero.getMainWindow().Zotero_Tabs.select(S.host.ownerTabID); } catch (e) { out.errors.push('tab: ' + String(e)); }
    }
    await sleep(400);

    // Debug store back; WebDAV check; minimize (the workflow's final state).
    if (S.debugStoringBefore === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
    out.steps.debugStoring = Zotero.Debug.storing;
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.steps.webdavFolder = pos.folder;
    out.steps.errors = Zotero.getErrors(true).filter((e) => /zotero-tts|ztts/i.test(e));
    try { Zotero.getMainWindow().minimize(); out.steps.minimized = true; } catch (e) { out.errors.push('minimize: ' + String(e)); }
    out.status = (out.steps.fixtureErased === true || out.steps.fixtureErased === 'already gone') && out.steps.recordCleared && out.steps.webdavFolder === false
      && out.steps.memoryRestored && out.steps.readAloudVoicesRestored && left === 0 ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
