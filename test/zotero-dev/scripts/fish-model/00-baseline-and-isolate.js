// Baseline and isolation, BEFORE the xpi install, on the release 1.16.10 (issues #181, #182).
// Not a WebDAV test: the folder's switch (webdav.enabled) is snapshotted and switched off after
// the position store and every transport have settled; "folder": false is confirmed in the three
// diagnostics that report it. The named prefs are snapshotted (raw copy in state and in a private,
// gitignored .tmp file; the API key is only measured, never held), the debug store turned on, the
// volume muted, the readers and position counts recorded, the host minimized.
// params: root. state: writes snap, docs, host, positionBefore, errorsBefore, debugBefore, readersBefore.
(async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, params = run.params || {};
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 12000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const typeName = t => t === p.PREF_BOOL ? 'bool' : t === p.PREF_INT ? 'int' : t === p.PREF_STRING ? 'string' : 'unset';
  const read = key => {
    const type = p.getPrefType(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch (_) {}
    return { key, type, typeName: typeName(type), hasUser: p.prefHasUserValue(key), value };
  };
  const d = Zotero.ZoteroTTS?.diagnostics;
  if (!d) throw new Error('plugin diagnostics missing');
  const startup = JSON.parse(d.startup());
  if (startup.version !== '1.16.10') throw new Error('the profile does not run the 1.16.10 release: ' + startup.version);

  // --- Snapshot (private). Strings that may hold more than ids are reported by length only. ---
  const mine = [
    'fish.enabled', 'fish.model', 'fish.freeOnly', 'fish.voices', 'fish.includeOfficial', 'fish.includeOwn', 'fish.includeManual',
    'readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice', 'documentVoiceMigrated', 'documentVoiceChanged', 'cacheAudio',
    'webdav.enabled', 'webdav.enabledMigrated', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings',
  ];
  const snap = {};
  for (const name of mine) snap[name] = read(prefix + name);
  snap['reader.readAloudVoices'] = read('extensions.zotero.reader.readAloudVoices');
  const key = read(prefix + 'fish.apiKey');
  state.apiKey = { hasUser: key.hasUser, length: String(key.value || '').length };
  const docs = {};
  try {
    const branch = p.getBranch(prefix + 'documentVoices.');
    for (const child of branch.getChildList('')) { try { docs[child] = branch.getStringPref(child); } catch (_) {} }
  } catch (_) {}
  state.snap = snap; state.docs = docs; state.runStart = Date.now();
  const dir = PathUtils.join(params.root, '.tmp', 'zotero-dev', 'fish-model');
  await IOUtils.makeDirectory(dir, { createAncestors: true });
  await IOUtils.writeUTF8(PathUtils.join(dir, 'snapshot.json'), JSON.stringify({ takenAt: new Date().toISOString(), snap, docs }));

  // --- WebDAV first (not about WebDAV): settle, then the folder off. ---
  const idle = async () => {
    const pos = JSON.parse(await d.position()), sync = JSON.parse(await d.positionSync());
    const set = JSON.parse(await d.settingsSync()), up = JSON.parse(await d.settingsUpload());
    return {
      pos, sync, set, up,
      idle: pos.store?.queued === 0 && pos.store?.writing === false && pos.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && set.transport?.pendingChange === false && set.transport?.running === false && up.autoUpload?.pending === false,
    };
  };
  if (!(await waitFor(async () => (await idle()).idle))) throw new Error('the position store or a transport did not settle before the folder was switched off');
  p.setBoolPref(prefix + 'webdav.enabled', false);
  if (!(await waitFor(async () => (await idle()).idle))) throw new Error('transports did not settle after the folder was switched off');
  const after = await idle();
  const folder = { positionSync: after.sync.folder, settingsUpload: after.up.folder, settingsSync: after.set.folder };
  if (folder.positionSync !== false || folder.settingsUpload !== false || folder.settingsSync !== false) throw new Error('the folder is not off: ' + JSON.stringify(folder));
  state.positionBefore = {
    rows: after.pos.database?.rows ?? null, loaded: after.pos.store?.loaded ?? null, deletions: after.pos.store?.deletions ?? null,
    localEntries: after.sync.localEntries ?? null, sharedDocuments: after.sync.shared?.documents ?? null,
  };

  // --- Debug store on for the run (restored at the end); mute; errors baseline. ---
  state.debugBefore = !!Zotero.Debug.storing;
  if (!state.debugBefore) Zotero.Debug.setStore(true);
  const volumeKey = prefix + 'readAloud.volume';
  if (p.getPrefType(volumeKey) === p.PREF_INT && p.getIntPref(volumeKey) !== 0) p.setIntPref(volumeKey, 0);
  const messages = Services.console.getMessageArray() || [];
  let maxTimeStamp = 0;
  for (const m of messages) { try { const e = m.QueryInterface(Ci.nsIScriptError); if (e.timeStamp > maxTimeStamp) maxTimeStamp = e.timeStamp; } catch (_) {} }
  state.errorsBefore = { consoleMessages: messages.length, maxTimeStamp, zoteroErrors: (Zotero.getErrors(true) || []).map(s => String(s).slice(0, 100)) };

  // --- Readers (the owner's are left alone), the settings window, the host. ---
  const readersBefore = [];
  const readers = Zotero.Reader?._readers || [];
  for (let i = 0; i < readers.length; i++) {
    const r = readers[i], m = r?._internalReader?._readAloudManager;
    let title = null;
    try { const it = Zotero.Items.get(r.itemID); title = (it?.parentItem ?? it)?.getField('title'); } catch (_) {}
    readersBefore.push({ itemID: r.itemID, tabID: r.tabID, title, active: !!m?.active, paused: m ? !!m.paused : null, voice: m?.selectedVoiceID ? String(m.selectedVoiceID).slice(0, 14) + '…' : null, popupOpen: !!r?._internalReader?._state?.readAloudState?.popupOpen });
  }
  state.readersBefore = readersBefore;
  const prefWindow = Services.wm.getMostRecentWindow('zotero:pref');
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  state.host = host ? { windowState: host.windowState, x: host.screenX, y: host.screenY, w: host.outerWidth, h: host.outerHeight, selectedTab: host.Zotero_Tabs?.selectedID ?? null } : null;
  if (host && host.windowState !== host.STATE_MINIMIZED) host.minimize();
  await sleep(500);

  const shown = name => { const r = snap[name]; return { type: r.typeName, hasUser: r.hasUser, ...(r.typeName === 'string' ? { length: String(r.value || '').length } : { value: r.value }) }; };
  return JSON.stringify({
    status: 'PASS', phase: 'baseline and WebDAV folder off (pre-install)',
    build: startup.version, startupFailed: startup.failed, startupSteps: startup.steps.length,
    folder, folderSnapshot: { enabled: snap['webdav.enabled'].value, hasUser: snap['webdav.enabled'].hasUser, enabledMigrated: snap['webdav.enabledMigrated'].value },
    prefs: Object.fromEntries(Object.keys(snap).map(n => [n, shown(n)])),
    apiKey: state.apiKey, documentRecords: Object.keys(docs).length,
    positionBefore: state.positionBefore,
    debugStoreBefore: state.debugBefore, debugStoreNow: !!Zotero.Debug.storing,
    volumeNow: p.getIntPref(volumeKey),
    errorsBefore: { consoleMessages: messages.length, zoteroErrors: state.errorsBefore.zoteroErrors.length },
    readersBefore, settingsWindowOpen: !!prefWindow,
    host: state.host, hostMinimized: !!host && host.windowState === host.STATE_MINIMIZED,
  }, null, 1);
})()
