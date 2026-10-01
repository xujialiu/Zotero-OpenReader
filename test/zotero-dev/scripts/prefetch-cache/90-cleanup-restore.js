// Cleanup for the issue #166 run: fixture readers closed, fixture items
// erased, every touched pref restored byte-identical in order (readAloud.memory
// last), test WebDAV replaced by the owner's configuration only after local
// state is clean and transports settled, then the sync switches restored, the
// debug store and the host window state put back. Adapted from
// voice-switch/163-99-cleanup-and-restore.js (executed 2026-10-01). Safe to
// run twice; if cleanup is not clean, the WebDAV switches stay suspended and
// the result says so.
// params: none. state: reads baseline + fixtures from Zotero.__ztts166.
(async () => {
  const session = Zotero.__ztts166;
  if (!session?.baseline) throw new Error('166 baseline is missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const errors = [];
  const waitFor = async (test, timeout = 15000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readTyped = key => {
    const type = p.getPrefType(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch (_) {}
    return { type, user: p.prefHasUserValue(key), value };
  };
  const restore = rec => {
    if (!rec?.key) return;
    const key = rec.key;
    if (!rec.user) { if (p.prefHasUserValue(key)) p.clearUserPref(key); return; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(key, Number(rec.value));
    else if (rec.type === p.PREF_STRING) p.setStringPref(key, String(rec.value ?? ''));
  };
  const readerFor = itemID => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const closeFixture = async itemID => {
    const reader = readerFor(itemID);
    if (!reader) return { itemID, closed: false, gone: true };
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { errors.push('fixture popup close: ' + String(e)); }
    try { const pending = reader.close?.(); if (pending && typeof pending.then === 'function') await pending; } catch (e) { errors.push('fixture close: ' + String(e)); }
    const gone = await waitFor(() => !readerFor(itemID), 10000, 100);
    return { itemID, closed: true, gone: !!gone };
  };

  const seenIDs = [...new Set((session.fixtures || []).map(f => f.itemID))];
  const readersClosed = [];
  for (const itemID of seenIDs) readersClosed.push(await closeFixture(itemID));
  const erased = [];
  for (const itemID of seenIDs) {
    try {
      const item = Zotero.Items.get(itemID);
      if (item) { await item.eraseTx(); erased.push({ itemID, erased: true }); }
      else erased.push({ itemID, erased: false, absent: true });
    } catch (e) { erased.push({ itemID, erased: false, error: String(e) }); errors.push('fixture erase: ' + String(e)); }
  }
  for (let i = (Zotero.Reader?._readers || []).length - 1; i >= 0; i--) {
    const r = Zotero.Reader._readers[i];
    try {
      if (!seenIDs.includes(r?.itemID)) continue;
      let bad = false;
      try { void r?._internalReader?._readAloudManager; } catch (_) { bad = true; }
      if (bad) Zotero.Reader._readers.splice(i, 1);
    } catch (_) {}
  }
  const fixtureReadersRemaining = (Zotero.Reader?._readers || []).filter(r => seenIDs.includes(r?.itemID)).length;
  const fixtureItemsRemaining = seenIDs.filter(id => !!Zotero.Items.get(id)).length;

  // Per-document voice records the run may have added: back to the baseline set.
  const baselineDocs = session.documentRecords || {};
  try {
    const branch = p.getBranch(prefix + 'documentVoices.');
    const names = branch.getChildList('', {});
    for (let i = 0; i < names.length; i++) {
      const full = 'documentVoices.' + names[i];
      if (!Object.prototype.hasOwnProperty.call(baselineDocs, full)) branch.clearUserPref(names[i]);
    }
  } catch (e) { errors.push('document record cleanup: ' + String(e)); }
  for (const [name, value] of Object.entries(baselineDocs)) {
    try { p.setStringPref(prefix + name, value); } catch (e) { errors.push('document record restore: ' + name + ': ' + String(e)); }
  }

  const settle = async () => await waitFor(async () => {
    try {
      const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
      const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.pendingChange === false && settings.transport?.running === false
        && upload.autoUpload?.pending === false;
    } catch (_) { return false; }
  }, 15000, 150);
  const pendingClean = await settle();
  let positionNow = null;
  try { positionNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (_) {}
  const positionRowsNow = positionNow?.database?.rows ?? null;

  // Restore all ordinary prefs while WebDAV writes remain suspended; memory LAST.
  const deferred = new Set(['webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings', 'readAloud.memory', 'reader.readAloudVoices']);
  for (const [suffix, rec] of Object.entries(session.baseline)) {
    if (deferred.has(suffix)) continue;
    try { restore(rec); } catch (e) { errors.push('named pref restore ' + suffix + ': ' + String(e)); }
  }
  try { restore(session.extra?.documentVoiceMigrated); } catch (e) { errors.push('extra restore 1: ' + String(e)); }
  try { restore(session.extra?.documentVoiceChanged); } catch (e) { errors.push('extra restore 2: ' + String(e)); }
  try { restore(session.baseline['reader.readAloudVoices']); } catch (e) { errors.push('native voice restore: ' + String(e)); }
  try { restore(session.baseline['readAloud.memory']); } catch (e) { errors.push('memory restore: ' + String(e)); }

  const localClean = errors.length === 0 && fixtureReadersRemaining === 0 && fixtureItemsRemaining === 0 && pendingClean;
  let webdavConnectionRestored = false;
  let syncRestored = false;
  if (localClean) {
    for (const suffix of ['webdav.machineId', 'webdav.syncState', 'webdav.url', 'webdav.username', 'webdav.password']) {
      try { restore(session.baseline[suffix]); } catch (e) { errors.push('WebDAV connection restore ' + suffix + ': ' + String(e)); }
    }
    webdavConnectionRestored = errors.length === 0;
    if (webdavConnectionRestored) {
      for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) {
        try { restore(session.baseline[suffix]); } catch (e) { errors.push('WebDAV switch restore ' + suffix + ': ' + String(e)); }
      }
      syncRestored = errors.length === 0;
    }
  } else {
    errors.push('cleanup not clean; automatic WebDAV switches remain suspended');
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) { try { p.setBoolPref(prefix + suffix, false); } catch (_) {} }
  }
  if (session.debugBefore !== undefined && !!Zotero.Debug.storing !== !!session.debugBefore) { try { Zotero.Debug.setStore(!!session.debugBefore); } catch (e) { errors.push('debug-store restore: ' + String(e)); } }
  const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
  try {
    if (host?.Zotero_Tabs?.select && session.hostBefore?.selectedTab) host.Zotero_Tabs.select(session.hostBefore.selectedTab);
    if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
    await sleep(700);
  } catch (e) { errors.push('host minimize/selection restore: ' + String(e)); }

  // Verification reads.
  const mem = readTyped(prefix + 'readAloud.memory');
  const nav = readTyped('extensions.zotero.reader.readAloudVoices');
  const final = {
    volume: readTyped(prefix + 'readAloud.volume'),
    localEnabled: readTyped(prefix + 'local.enabled'),
    defaultVoiceMatchesBaseline: readTyped(prefix + 'readAloud.defaultVoice').value === session.baseline['readAloud.defaultVoice']?.value,
    sameForAll: readTyped(prefix + 'readAloud.sameForAllDocuments'),
    prefetchCustom: readTyped(prefix + 'readAloud.prefetchCustom'),
    prefetchSentences: readTyped(prefix + 'readAloud.prefetchSentences'),
    prefetchRequests: readTyped(prefix + 'readAloud.prefetchRequests'),
    cacheAudio: readTyped(prefix + 'cacheAudio'),
    oldPrefetch: readTyped(prefix + 'prefetch'),
    oldPrefetchEnabled: readTyped(prefix + 'prefetchEnabled'),
    memory: { chars: mem.value?.length ?? null, user: mem.user, equalToBaseline: mem.value === session.baseline['readAloud.memory']?.value },
    nativeVoices: { chars: nav.value?.length ?? null, user: nav.user, equalToBaseline: nav.value === session.baseline['reader.readAloudVoices']?.value },
    webdavUrlMatchesBaseline: readTyped(prefix + 'webdav.url').value === session.baseline['webdav.url']?.value,
    webdavSwitches: {
      autoUploadSettings: readTyped(prefix + 'webdav.autoUploadSettings'),
      syncPositions: readTyped(prefix + 'webdav.syncPositions'),
      syncSettings: readTyped(prefix + 'webdav.syncSettings'),
    },
    readersNow: (Zotero.Reader?._readers || []).map(r => r.itemID),
    hostMinimized: host ? host.windowState === host.STATE_MINIMIZED : null,
  };
  const out = {
    step: 'cleanup-restore',
    fixtureItemsSeen: seenIDs, readersClosed, erased,
    fixtureReadersRemaining, fixtureItemsRemaining,
    pendingClean, positionRowsBefore: session.positionRowsBefore, positionRowsNow,
    localClean, webdavConnectionRestored, syncRestored,
    errors,
    final,
  };
  session.cleanup = out;
  return JSON.stringify(out, null, 1);
})();
