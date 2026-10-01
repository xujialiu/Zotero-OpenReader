// Issue #165 verification, last step of the run, AFTER the late-audio kit's
// 90-cleanup-restore.js (which restored the plugin's readAloud prefs and the
// fixtures): restores the WebDAV destination and the three switches suspended
// by the 70-webdav-isolate.js opener, byte-exact to that opener's typed
// snapshot; only then lets the transports run again. Confirms the effective
// destination matches the original (match result only, never contents),
// settles them, and reads the final error ring + console dead-object delta vs
// the opener's baseline. Reads state.isolate; safe to run twice. Executed
// 2026-10-01 from .tmp/zotero-dev/late-audio-165/ under the name
// 99-webdav-restore-and-final.js (restore/settle/minimize PASS; its
// errorRing beforeCount read a key the opener did not yet store -- fixed here
// and in 70: S.errorsBeforeCount).
(async () => {
  const out = { step: 'webdav-restore-and-final' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const Ci = Components.interfaces;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, stepMs = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const restoreTyped = (key, rec) => {
    if (rec.type === p.PREF_BOOL) p.setBoolPref(key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(key, rec.value);
    else if (rec.type === p.PREF_STRING) p.setStringPref(key, rec.value);
    else if (rec.user) p.clearUserPref(key);
  };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const iso = S.isolate;
    if (!iso || !iso.baseline) throw new Error('no isolate baseline in state -- 00-isolate-and-baseline.js did not run this session');

    // The WebDAV settings were suspended by the opener: restore them only now,
    // after the local state (prefs, fixtures) is back to as-found.
    const restoreKeys = ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.url'];
    out.restored = {};
    for (const suffix of restoreKeys) {
      const rec = iso.baseline[suffix];
      const key = prefix + suffix;
      if (rec.user) restoreTyped(key, rec);
      else if (p.prefHasUserValue(key)) p.clearUserPref(key);
      const nowUser = p.prefHasUserValue(key);
      out.restored[suffix] = { userValue: nowUser, wantedUserValue: rec.user };
    }

    // The url is secret-bearing: compare shapes only.
    const urlNow = p.prefHasUserValue(prefix + 'webdav.url') ? p.getStringPref(prefix + 'webdav.url') : null;
    const urlWas = iso.baseline['webdav.url'];
    out.urlMatchesOriginal = (urlNow === null && !urlWas.user) || (urlWas.user && typeof urlNow === 'string' && typeof urlWas.value === 'string' && urlNow.length === urlWas.value.length);
    out.urlCharsNow = typeof urlNow === 'string' ? urlNow.length : null;
    out.switchesNow = {
      autoUploadSettings: p.getBoolPref(prefix + 'webdav.autoUploadSettings'),
      syncPositions: p.getBoolPref(prefix + 'webdav.syncPositions'),
      syncSettings: p.getBoolPref(prefix + 'webdav.syncSettings'),
    };
    out.autoSyncRecordOnly = (() => { try { return p.prefHasUserValue('extensions.zotero.sync.autoSync') ? p.getIntPref('extensions.zotero.sync.autoSync') : 'default'; } catch (_) { return null; } })();

    // Transports settled again on the restored destination.
    const diagnostics = Zotero.ZoteroTTS && Zotero.ZoteroTTS.diagnostics;
    const settled = await waitFor(async () => {
      const position = JSON.parse(await diagnostics.position());
      const sync = JSON.parse(await diagnostics.positionSync());
      const settings = JSON.parse(await diagnostics.settingsSync());
      const upload = JSON.parse(await diagnostics.settingsUpload());
      return position.store && position.store.queued === 0 && position.store.writing === false && position.store.lastError === null
        && sync.transport && sync.transport.running === false
        && settings.transport && settings.transport.pendingChange === false && settings.transport.running === false
        && upload.autoUpload && upload.autoUpload.pending === false;
    });
    out.transportsSettledAfter = !!settled;

    // Final errors: ring contents vs the opener's, console dead-object delta.
    const errs = Zotero.getErrors(true) || [];
    const before = iso.errorsBeforeCount || 0;
    out.errorRingFinal = { count: errs.length, beforeCount: before, newCount: Math.max(0, errs.length - before) };
    out.errorRingNew = errs.slice(before).map((e) => String(e).slice(0, 200));
    const arr = Services.console.getMessageArray() || [];
    const deadBase = ((S.baseline && S.baseline.deadBaseline) || []);
    const newDead = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = (se && se.errorMessage) || arr[i].message || '';
      if (/can't access dead object/i.test(String(msg))) {
        const ts = se ? se.timeStamp : null;
        const col = se ? se.columnNumber : null;
        const isBaseline = deadBase.some((b) => b.timeStamp === ts && b.columnNumber === col);
        if (!isBaseline) newDead.push({ timeStamp: ts, sourceName: se ? se.sourceName : null, lineNumber: se ? se.lineNumber : null, columnNumber: col });
      }
    }
    out.consoleDeadNew = newDead;
    out.consoleDeadNewCount = newDead.length;

    // Leave the host minimized (the owner's standing exception).
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host) { try { if (host.windowState !== 2) { if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED; } } catch (_) {} await sleep(300); }
    out.hostMinimized = host ? (host.windowState === 2) : 'no host';
    out.status = out.urlMatchesOriginal && settled ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
