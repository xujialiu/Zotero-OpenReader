// Final restore: verified data gate -> all four idle -> non-network prefs and
// destination -> memory last among reading prefs -> switches -> folder LAST.
// Audit every snapshotted value AND user flag; return no preference values.
(async () => {
  const out = { step: 'cleanup-prefs-restore', ok: false };
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const d = Zotero.ZoteroTTS.diagnostics;
  const prefix = 'extensions.zotero.zotero-tts.';
  const switches = ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings'];
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let enabling = false;
  const read = key => {
    const type = p.getPrefType(key);
    return type === p.PREF_BOOL ? p.getBoolPref(key) : type === p.PREF_INT ? p.getIntPref(key) : type === p.PREF_STRING ? p.getStringPref(key) : null;
  };
  const idle = async () => {
    const position = JSON.parse(await d.position());
    const sync = JSON.parse(await d.positionSync());
    const settings = JSON.parse(await d.settingsSync());
    const upload = JSON.parse(await d.settingsUpload());
    return position.store?.queued === 0 && position.store?.writing === false
      && sync.transport?.running === false && sync.shared?.transport?.running === false
      && settings.transport?.running === false && settings.transport?.pendingChange === false
      && upload.autoUpload?.pending === false;
  };
  const settle = async () => {
    const until = Date.now() + 20000;
    do { if (await idle()) return true; await sleep(300); } while (Date.now() < until);
    return false;
  };
  try {
    if (state.cleanupVerified !== true) throw new Error('data/server cleanup gate not verified');
    const baseline = state.baselinePrefs;
    if (!baseline || !state.documentVoicesBefore) throw new Error('baseline missing');
    const docPrefix = prefix + 'documentVoices.';
    const voicesNow = Object.fromEntries(p.getBranch(docPrefix).getChildList('').sort().map(name => [name, {
      value: p.getStringPref(docPrefix + name), user: p.prefHasUserValue(docPrefix + name),
    }]));
    out.documentVoicesMatchBaseline = JSON.stringify(voicesNow) === JSON.stringify(state.documentVoicesBefore);
    if (!out.documentVoicesMatchBaseline) throw new Error('document voice records changed; refusing to overwrite independent state');
    for (const [name, snap] of Object.entries(baseline)) {
      const key = name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
      if (snap.key !== key) throw new Error('snapshot has an unexpected preference namespace');
    }
    for (const name of ['webdav.enabled', ...switches, 'webdav.url', 'readAloud.memory']) {
      if (!baseline[name]) throw new Error('required snapshot missing');
    }
    if (JSON.parse(await d.positionSync()).folder !== false || switches.some(name => read(prefix + name) !== false)) {
      throw new Error('folder and switches must remain suspended until restoration');
    }
    if (!await settle()) throw new Error('four transports did not settle');

    const restore = name => {
      const snap = baseline[name];
      if (!snap.user) {
        if (p.prefHasUserValue(snap.key)) p.clearUserPref(snap.key);
      } else if (read(snap.key) !== snap.value || !p.prefHasUserValue(snap.key)) {
        if (snap.type === p.PREF_BOOL) p.setBoolPref(snap.key, snap.value);
        else if (snap.type === p.PREF_INT) p.setIntPref(snap.key, snap.value);
        else if (snap.type === p.PREF_STRING) p.setStringPref(snap.key, snap.value);
        else throw new Error('unsupported snapshot type');
      }
    };
    const verify = names => Object.fromEntries(names.map(name => {
      const snap = baseline[name];
      return [name, { valueEqual: read(snap.key) === snap.value, userFlagEqual: p.prefHasUserValue(snap.key) === snap.user }];
    }));
    const equal = records => Object.values(records).every(value => value.valueEqual && value.userFlagEqual);
    const ordinary = Object.keys(baseline).filter(name => name !== 'webdav.enabled' && !switches.includes(name) && name !== 'readAloud.memory' && name !== 'webdav.syncState');
    for (const name of ordinary) restore(name);
    restore('readAloud.memory');
    // Reading-pref observers stamp settings-sync bookkeeping even with the
    // folder off. Restore that metadata AFTER those observers have settled;
    // webdav.* fields are neverSynced and do not stamp themselves again.
    if (!await settle()) throw new Error('restoration observers did not settle');
    if (baseline['webdav.syncState']) restore('webdav.syncState');
    const beforeEnable = verify([...ordinary, 'readAloud.memory', ...(baseline['webdav.syncState'] ? ['webdav.syncState'] : [])]);
    out.beforeEnable = beforeEnable;
    if (!equal(beforeEnable)) throw new Error('preference restoration mismatch before enabling');
    if (!await settle()) throw new Error('restoration observers did not settle');

    // Folder remains off while restoring each switch, so neither the test
    // destination nor partly restored credentials can be used for a request.
    enabling = true;
    for (const name of switches) restore(name);
    restore('webdav.enabled');
    out.settledAfterDestinationRestore = await settle();
    out.verify = verify(Object.keys(baseline));
    out.prefsAllEqual = equal(out.verify);
    if (!out.settledAfterDestinationRestore || !out.prefsAllEqual) throw new Error('final restoration audit failed');

    Zotero.Debug.setStore(state.debugStoringAtStart === true);
    out.debugStoreRestored = !!Zotero.Debug.storing === (state.debugStoringAtStart === true);
    const win = Zotero.getMainWindow();
    if (state.host?.selectedTabID && win.Zotero_Tabs.selectedID !== state.host.selectedTabID) win.Zotero_Tabs.select(state.host.selectedTabID);
    out.tabSelectionRestored = !state.host?.selectedTabID || win.Zotero_Tabs.selectedID === state.host.selectedTabID;
    if (win.windowState !== 2) win.minimize();
    out.hostMinimized = win.windowState === 2;
    const live = (Zotero.Reader._readers || []).map(reader => {
      const manager = reader._internalReader?._readAloudManager;
      return { itemID: reader.itemID, active: !!manager?.active, paused: !!manager?.paused };
    });
    const original = (state.baselineTabs || []).map(reader => ({ itemID: reader.itemID, active: reader.active, paused: reader.paused }));
    out.readersMatchBaseline = JSON.stringify(live) === JSON.stringify(original);
    out.diagnostics = { folder: JSON.parse(await d.positionSync()).folder };
    out.ok = out.debugStoreRestored && out.tabSelectionRestored && out.hostMinimized && out.readersMatchBaseline;
    if (!out.ok) throw new Error('reader/window/debug restoration mismatch');
  } catch (error) {
    out.error = String(error);
    out.ok = false;
    // A failed final audit must not leave automatic sync running. Earlier
    // guard failures make no writes: the snapshot may itself be invalid.
    if (enabling) p.setBoolPref(prefix + 'webdav.enabled', false);
  }
  return JSON.stringify(out, null, 1);
})()
