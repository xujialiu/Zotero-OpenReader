// Restore-only mini-pass setup for one execution of the current
// 62-cleanup-prefs-restore.js on the CURRENT user state — no import, no
// reinstall, no server contact, no playback, no reader modification, no
// baseline 10. Guards first (folder off, four transports quiet, no active
// session), then snapshots privately exactly what 62 reads
// (baselinePrefs / documentVoicesBefore / debugStoringAtStart / host /
// baselineTabs), verifies the prior run's 60/61 data+server cleanup receipts
// on disk, sets the vacuous no-data-mutating cleanupVerified, and finally
// changes ONLY readAloud.volume to 0 (retaining the pre-write syncState and
// the original volume value/user flag in the snapshot) so the reading-pref
// observer restamp of webdav.syncState is reproduced for 62 to restore.
(async () => {
  const out = { step: 'restore-minipass-setup' };
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // --- Guards: never alter the user's activity. ---
    const sync = JSON.parse(await d.positionSync());
    if (sync.folder !== false) throw new Error('folder is not OFF; stop/ask rather than alter');
    const position = JSON.parse(await d.position());
    const settings = JSON.parse(await d.settingsSync());
    const upload = JSON.parse(await d.settingsUpload());
    out.quiet = {
      positions: position.store?.queued === 0 && position.store?.writing === false && !sync.transport?.running,
      shared: !sync.shared?.transport?.running,
      settingsSync: !settings.transport?.running && settings.transport?.pendingChange === false,
      autoUpload: !upload.autoUpload?.pending,
    };
    if (!Object.values(out.quiet).every(Boolean)) throw new Error('a transport is not quiet; stop/ask');
    out.readers = (Zotero.Reader._readers || []).map((r) => ({ itemID: r.itemID, tabID: r.tabID, active: !!r._internalReader?._readAloudManager?.active, paused: !!r._internalReader?._readAloudManager?.paused }));
    if (out.readers.some((r) => r.active)) throw new Error('a session is active; stop/ask rather than alter');

    // --- Private snapshot: exactly the state 62 reads. ---
    const names = ['webdav.enabled', 'webdav.enabledMigrated', 'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings', 'readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice', 'reader.readAloudVoices', 'documentVoiceChanged'];
    const full = (name) => (name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name);
    const get = (name) => {
      const key = full(name), type = p.getPrefType(key), user = p.prefHasUserValue(key);
      let value = null;
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
      return { key, type, user, value };
    };
    const secret = (name) => /password|username|machineId/i.test(name);
    const baseline = {}, masked = {};
    for (const name of names) {
      baseline[name] = get(name);
      masked[name] = secret(name)
        ? { user: baseline[name].user, set: typeof baseline[name].value === 'string' && baseline[name].value.length > 0, chars: typeof baseline[name].value === 'string' ? baseline[name].value.length : null }
        : { user: baseline[name].user, value: baseline[name].value };
    }
    state.baselinePrefs = baseline;
    const docPrefix = prefix + 'documentVoices.';
    state.documentVoicesBefore = Object.fromEntries(p.getBranch(docPrefix).getChildList('').sort().map((name) => [name, {
      value: p.getStringPref(docPrefix + name), user: p.prefHasUserValue(docPrefix + name),
    }]));
    state.documentVoicesCount = Object.keys(state.documentVoicesBefore).length;
    state.debugStoringAtStart = !!Zotero.Debug?.storing;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    state.host = host ? {
      windowState: host.windowState,
      bounds: { x: host.screenX, y: host.screenY, width: host.outerWidth, height: host.outerHeight },
      selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
    } : null;
    state.baselineTabs = out.readers.map((r) => ({ itemID: r.itemID, active: r.active, paused: r.paused }));
    out.snapshotNames = names.length;
    // Values stay private, including URLs that may themselves contain auth.
    out.snapshotFlags = Object.fromEntries(Object.entries(baseline).map(([name, snap]) => [name, { user: snap.user, type: snap.type }]));
    out.docVoiceCount = state.documentVoicesCount;
    out.debugStoringAtStart = state.debugStoringAtStart;
    out.selectedTabID = state.host?.selectedTabID ?? null;
    out.windowStateAtStart = state.host?.windowState ?? null;

    // --- Prior run's data/server cleanup receipts, verified on disk. ---
    const root = P.root;
    const priorDir = root + '/.tmp/zotero-dev/' + P.priorRunId + '/results';
    const readReceipt = async (file) => JSON.parse(await IOUtils.readUTF8(priorDir + '/' + file));
    const r60 = await readReceipt('60-cleanup-teardown.js.json');
    const j60 = JSON.parse(r60.result);
    const r61 = await readReceipt('61-cleanup-verify-and-server.js.json');
    const j61 = JSON.parse(r61.result);
    out.receipts = {
      teardown: { ok: r60.error === null && j60.ok === true, hashesMatchSnapshot: j60.hashesMatchSnapshot === true, documentVoicesMatchBaseline: j60.documentVoicesMatchBaseline === true, fixtureItemGone: j60.fixtureItemGone === true },
      serverAndData: { ok: r61.error === null && j61.ok === true, countsMatchBaseline: j61.countsMatchBaseline === true, hashesMatchSnapshot: j61.hashesMatchSnapshot === true, fixtureRowsAllZero: Object.values(j61.fixtureRowsLeft ?? {}).every((v) => v === 0), nativeByteIdentical: j61.nativeRestore?.byteIdentical === true, sharedByteIdentical: j61.sharedRestore?.byteIdentical === true, noFixtureInFiles: j61.noFixtureInFiles === true, stableAfterSettle: j61.stableAfterSettle === true },
    };
    const receiptsOk = Object.values(out.receipts.teardown).every(Boolean) && Object.values(out.receipts.serverAndData).every(Boolean);
    if (!receiptsOk) throw new Error('prior 60/61 receipts not green on disk; refusing the vacuous data gate');
    // This mini-pass performs no fixture, store-table, or server operation:
    // the data/server gate is vacuously satisfied for this restore-only run.
    state.cleanupVerified = true;
    out.dataGate = 'vacuous: no-data-mutating mini-pass; prior teardown/server receipts verified on disk';
    out.cleanupVerifiedSet = state.cleanupVerified === true;

    // --- The one mutation: readAloud.volume -> 0 (observers restamp syncState). ---
    const vol = baseline['readAloud.volume'];
    if (vol.type !== p.PREF_INT) throw new Error('volume pref is not an int; aborting without mutation');
    out.volumeBefore = { value: vol.value, user: vol.user };
    state.syncStateBefore = { user: baseline['webdav.syncState'].user, chars: typeof baseline['webdav.syncState'].value === 'string' ? baseline['webdav.syncState'].value.length : null };
    p.setIntPref(vol.key, 0);
    out.volumeNowZero = p.getIntPref(vol.key) === 0;
    await sleep(1200);
    const syncCharsNow = typeof p.getStringPref(prefix + 'webdav.syncState') === 'string' ? p.getStringPref(prefix + 'webdav.syncState').length : null;
    out.syncStateRestamped = syncCharsNow !== null && syncCharsNow !== state.syncStateBefore.chars;
    out.ok = out.volumeNowZero && out.cleanupVerifiedSet;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
