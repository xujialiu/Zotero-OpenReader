// Run closer. Restores, in order: every snapshotted pref byte-identical
// (typed restore honoring user-value state, readAloud.memory last — this
// includes both tier switches, whose baseline on this run's owner profile is
// USER VALUES false: an earlier revision toggled them back ON through the
// pane and then excluded them from the typed restore, which left the run's
// test state behind; the end state must EQUAL the baseline), the settings
// window closed, transports settled, the test WebDAV destination backed out
// (the three switches back to no-user-value, webdav.url to the owner's), the
// debug store back to its pre-run state after reading the run's
// [zotero-tts] lines, the host left minimized. The run's own global
// Zotero.__zttsCredits159 is removed ONLY when every restore matched (the
// baseline inside it is the recovery path if cleanup fails). Reports the
// error ring's contents. params: none. state: reads Zotero.__zttsCredits159.
(async () => {
  const out = { step: 'cleanup-restore' };
  const S = Zotero.__zttsCredits159;
  if (!S || !S.baseline) throw new Error('run state missing -- 00-isolate-and-baseline.js did not run');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, timeout = 20000, stepMs = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const errors = [];
  try {
    // --- Settings window closed before the pref restore (the pane writes prefs). ---
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) {
      win.close();
      await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 10000);
    }
    out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

    // --- Typed, byte-identical restore; memory LAST. ---
    const readTyped = (key) => {
      const type = p.getPrefType(key);
      let value = null;
      try {
        if (type === p.PREF_BOOL) value = p.getBoolPref(key);
        else if (type === p.PREF_INT) value = p.getIntPref(key);
        else if (type === p.PREF_STRING) value = p.getStringPref(key);
      } catch (_) {}
      return { type, user: p.prefHasUserValue(key), value };
    };
    const restoreRec = (rec) => {
      if (!rec || !rec.key) return;
      if (!rec.user) { if (p.prefHasUserValue(rec.key)) p.clearUserPref(rec.key); return; }
      if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value);
      else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value));
      else if (rec.type === p.PREF_STRING) p.setStringPref(rec.key, String(rec.value ?? ''));
    };
    const order = Object.keys(S.baseline).filter((k) => k !== 'readAloud.memory' && k !== 'sync.autoSync');
    // A pref that may hold a credential is reported by LENGTH only, mapped
    // inside the script before the value can reach a tool result (the 00
    // rule; found live 2026-09-29: the first revision printed webdav.*
    // values in `was`/`now`).
    const secret = (suffix) => suffix === 'readAloud.memory'
      || /(?:password|username|url|machineId|syncState)$/.test(suffix);
    const describeRec = (rec, now) => secret(rec.key.slice(prefix.length))
      ? { matches: now.user === rec.user && now.value === rec.value,
          was: rec.user ? rec.value.length + ' chars' : '(no user value)',
          now: now.user ? now.value.length + ' chars' : '(no user value)' }
      : { matches: now.user === rec.user && now.value === rec.value,
          was: rec.user ? rec.value : '(no user value)',
          now: now.user ? now.value : '(no user value)' };
    const restored = {};
    for (const suffix of order) {
      const rec = S.baseline[suffix];
      restoreRec(rec);
      const now = readTyped(rec.key);
      restored[suffix] = describeRec(rec, now);
      if (!restored[suffix].matches) errors.push('pref not restored: ' + suffix);
    }
    restoreRec(S.baseline['readAloud.memory']);
    const memNow = readTyped(S.baseline['readAloud.memory'].key);
    restored['readAloud.memory'] = {
      matches: memNow.user === S.baseline['readAloud.memory'].user && memNow.value === S.baseline['readAloud.memory'].value,
      was: S.baseline['readAloud.memory'].user ? S.baseline['readAloud.memory'].value.length + ' chars' : '(no user value)',
      now: memNow.user ? memNow.value.length + ' chars' : '(no user value)',
    };
    if (!restored['readAloud.memory'].matches) errors.push('pref not restored: readAloud.memory');
    restored['sync.autoSync'] = { recordedOnly: true, value: readTyped('extensions.zotero.sync.autoSync').value };
    out.restored = restored;

    // --- Settle transports, then confirm the isolation is backed out. ---
    const diagnostics = Zotero.ZoteroTTS && Zotero.ZoteroTTS.diagnostics;
    const settled = await waitFor(async () => {
      const position = JSON.parse(await diagnostics.position());
      const sync = JSON.parse(await diagnostics.positionSync());
      const settings = JSON.parse(await diagnostics.settingsSync());
      const upload = JSON.parse(await diagnostics.settingsUpload());
      return position.store && position.store.queued === 0 && position.store.writing === false
        && sync.transport && sync.transport.running === false
        && settings.transport && settings.transport.running === false
        && upload.autoUpload && upload.autoUpload.pending === false;
    });
    out.transportsSettled = !!settled;
    if (!settled) errors.push('transports did not settle; WebDAV suspension LEFT IN PLACE');
    if (settled) {
      // Destination back to the owner's (typed restore already ran in `order`);
      // re-verify it no longer matches the test config. Compared, never printed.
      const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
      let testConfig = '';
      try { testConfig = (await IOUtils.readUTF8(PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt'))).trim(); } catch (_) {}
      const trimSlash = (v) => { let s = String(v); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
      const current = p.getStringPref(prefix + 'webdav.url');
      out.webdavDestinationBackToOwner = !!testConfig && trimSlash(current) !== trimSlash(testConfig);
      out.webdavUrlMatchesBaseline = current === (S.baseline['webdav.url'].user ? S.baseline['webdav.url'].value : null);
      if (!out.webdavDestinationBackToOwner || !out.webdavUrlMatchesBaseline) errors.push('webdav.url not back to the owner configuration');
    }

    // --- Errors: debug store read, then restored. ---
    try {
      const debugText = await Zotero.Debug.get();
      const lines = String(debugText).split('\n');
      const ours = lines.filter((l) => /\[zotero-tts\]|zotero-tts\.js|can't access dead object/i.test(l));
      out.debugLog = {
        totalLines: lines.length,
        ourLineCount: ours.length,
        sample: ours.slice(0, 12).map((l) => l.slice(0, 240)),
      };
    } catch (e) { out.debugLogError = String(e); }
    if (S.debugStoringBefore === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
    out.debugStoringRestored = !!Zotero.Debug.storing === S.debugStoringBefore;

    const errs = Zotero.getErrors(true) || [];
    out.errorsAfter = { count: errs.length, contents: errs.slice(-12).map(String) };
    out.errorsBaselineCount = S.errorsBefore ? S.errorsBefore.length : null;

    // --- Leave the host minimized. ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host && host.windowState !== host.STATE_MINIMIZED) {
      if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED;
      await sleep(500);
    }
    out.hostMinimizedAtEnd = host ? host.windowState === host.STATE_MINIMIZED : 'no host window';

    out.errors = errors;
    // The run's own global goes ONLY after a successful restore: the baseline
    // inside it is the recovery path while anything is left unrestored.
    if (errors.length === 0) {
      delete Zotero.__zttsCredits159;
      out.runStateRemoved = !Zotero.__zttsCredits159;
    } else {
      out.runStateRemoved = false;
      out.runStateKeptReason = 'restore errors remain; Zotero.__zttsCredits159 kept as the recovery path';
    }
    out.status = errors.length ? 'PASS-WITH-NOTES' : 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    out.errors = errors;
    out.runStateRemoved = false;
    out.runStateKeptReason = 'cleanup threw; Zotero.__zttsCredits159 kept as the recovery path';
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
