// The run's cleanup, last step (items 6.22–6.26, 1.16.12-beta2): restores, in
// order and with a read-back for each — (1) the local prefs the run touched
// (volume, azure.apiKey/enabled, fishspeech.*) from the opener's typed
// snapshot; (2) settles the restores' change syncs against the test folder;
// (3) the test folder's shared file back to its exact baseline text (or gone,
// had the run created it); (4) webdav.syncState byte-exact; (5) the owner's
// WebDAV configuration and the suspended switches, so automatic sync/backup
// resumes only after everything else is as found. Then: effective destination
// match result, transports settled on the owner's configuration, debug store
// restored, error ring delta, host left minimized, runner state reset.
// Reads state.isolate / state.fileBaselineText. Safe to run twice.
(async () => {
  const out = { step: 'restore-and-final' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const Ci = Components.interfaces;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 30000, stepMs = 250) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
  const secret = (suffix) => /(?:password|username|url|machineId|syncState|apiKey|headers)$/.test(suffix);
  try {
    const iso = S.isolate;
    if (!iso || !iso.baseline) throw new Error('no isolate baseline in state -- the opener did not run this session');
    const B = iso.baseline;
    const restoreTyped = (suffix) => {
      const rec = B[suffix];
      const key = prefix + suffix;
      if (rec.user) {
        if (rec.type === p.PREF_BOOL) p.setBoolPref(key, !!rec.value);
        else if (rec.type === p.PREF_INT) p.setIntPref(key, rec.value);
        else if (rec.type === p.PREF_STRING) p.setStringPref(key, rec.value);
        else if (rec.user) p.clearUserPref(key);
      } else if (p.prefHasUserValue(key)) p.clearUserPref(key);
    };
    const readBack = (suffix) => {
      const rec = B[suffix];
      const key = prefix + suffix;
      const type = p.getPrefType(key);
      let value = null;
      try {
        if (type === p.PREF_BOOL) value = p.getBoolPref(key);
        else if (type === p.PREF_INT) value = p.getIntPref(key);
        else if (type === p.PREF_STRING) value = p.getStringPref(key);
      } catch (_) {}
      const user = p.prefHasUserValue(key);
      const valueOk = rec.user ? JSON.stringify(value) === JSON.stringify(rec.value) : !user;
      return { suffix, user, wantedUser: rec.user, ok: user === rec.user && valueOk };
    };

    // --- (1) Local prefs, snapshot values back. ---
    out.localPrefs = [];
    for (const suffix of ['readAloud.volume', 'azure.enabled', 'azure.apiKey', 'fishspeech.enabled', 'fishspeech.baseURL', 'fishspeech.headers']) {
      restoreTyped(suffix);
      const rb = readBack(suffix);
      out.localPrefs.push(secret(suffix)
        ? { suffix: rb.suffix, user: rb.user, wantedUser: rb.wantedUser, chars: typeof p.getStringPref(prefix + suffix) === 'string' ? p.getStringPref(prefix + suffix).length : null, ok: rb.ok }
        : rb);
    }

    // --- (2) Settle the restores' change syncs (still on the test folder). ---
    const settled1 = await waitFor(async () => {
      const settings = JSON.parse(await diagnostics.settingsSync());
      const t = settings.transport;
      return t && t.running === false && t.pendingChange === false;
    });
    out.transportsSettledOnTest = !!settled1;
    const testSync = JSON.parse(await diagnostics.settingsSync()).transport;
    out.finalTestSync = { lastTrigger: testSync.lastTrigger, lastOutcome: testSync.lastOutcome, pushed: testSync.pushed, uploaded: testSync.uploaded };

    // --- (3) The test folder's shared file back to its baseline text. ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    if (typeof S.fileBaselineText === 'string') {
      const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: S.fileBaselineText });
      if (!putResp.ok) throw new Error(`baseline PUT ${putResp.status}`);
    } else {
      const delResp = await fetch(fileUrl, { method: 'DELETE', headers: auth });
      if (!delResp.ok && delResp.status !== 404) throw new Error(`baseline DELETE ${delResp.status}`);
    }
    const backText = await (await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } })).text();
    out.fileRestored = { mode: typeof S.fileBaselineText === 'string' ? 'put-baseline' : 'deleted', byteIdentical: backText === S.fileBaselineText, chars: backText.length };

    // --- (4) webdav.syncState byte-exact. ---
    p.setStringPref(prefix + 'webdav.syncState', B['webdav.syncState'].value);
    const stateBack = p.getStringPref(prefix + 'webdav.syncState');
    out.syncStateRestored = { byteIdentical: stateBack === B['webdav.syncState'].value, chars: stateBack.length };
    const stateNow = JSON.parse(stateBack);
    out.syncStateNow = { stamps: Object.keys(stateNow.stamps || {}).length, held: Object.keys(stateNow.held || {}).sort(), seeded: stateNow.seeded };

    // --- (5) The owner's WebDAV configuration and the switches, last. ---
    out.webdavConfig = [];
    for (const suffix of ['webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncSettings', 'webdav.syncPositions', 'webdav.autoUploadSettings']) {
      restoreTyped(suffix);
      const rb = readBack(suffix);
      out.webdavConfig.push(secret(suffix)
        ? { suffix: rb.suffix, user: rb.user, wantedUser: rb.wantedUser, chars: typeof p.getStringPref(prefix + suffix) === 'string' ? p.getStringPref(prefix + suffix).length : null, ok: rb.ok }
        : rb);
    }
    // The effective destination is the owner's again (match result only).
    const files = JSON.parse(await diagnostics.settingsFiles());
    out.effectiveDestinationMatchesOriginal = !files.error && typeof files.url === 'string'
      && trimSlash(files.url) === trimSlash(p.getStringPref(prefix + 'webdav.url'));

    // --- Settled on the owner's configuration. ---
    const settled2 = await waitFor(async () => {
      const settings = JSON.parse(await diagnostics.settingsSync());
      const t = settings.transport;
      return t && t.running === false && t.pendingChange === false;
    });
    out.transportsSettledOnOriginal = !!settled2;
    const origSync = JSON.parse(await diagnostics.settingsSync()).transport;
    out.finalOriginalSync = { lastTrigger: origSync.lastTrigger, lastOutcome: origSync.lastOutcome, lastError: origSync.lastError };

    // --- Debug store back, error ring delta, host minimized. ---
    if (S.debugStoringBefore === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
    out.debugStoringNow = !!Zotero.Debug.storing;
    const errs = Zotero.getErrors(true) || [];
    const newErrors = errs.slice(S.errorsBeforeCount || 0).map((e) => String(e).slice(0, 220));
    out.errorRing = { before: S.errorsBeforeCount || 0, now: errs.length, newCount: newErrors.length, newEntries: newErrors.filter((e) => /zotero-tts|OpenReader/i.test(e)) };
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host) { try { if (host.windowState !== 2) { if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED; } } catch (_) {} await sleep(300); }
    out.hostMinimized = host ? host.windowState === 2 : 'no host';

    const prefsOk = out.localPrefs.every((r) => r.ok) && out.webdavConfig.every((r) => r.ok);
    out.allRestored = prefsOk && out.fileRestored.byteIdentical && out.syncStateRestored.byteIdentical
      && out.effectiveDestinationMatchesOriginal && settled2;
    out.status = out.allRestored ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
