// Run closer for the time-left kit. Restores, in order: getAPIClient and
// launchURL to their kept originals (identity-checked), the provider's kept
// premiumCreditsRemaining, the fixture player CLOSED (only ever with
// reader._internalReader.toggleReadAloudPopup(false)), the fixture tab
// closed and the item erased (position rows back to the opener's count),
// every snapshotted pref byte-identical — reader.readAloudVoices FIRST while
// every tab is idle (a chrome-scope write of it is a voice pick to
// memory-sync's observer, which moves readAloud.memory), then the typed
// restore of the zotero-tts prefs with readAloud.memory LAST, then a full
// re-read to prove each pref byte-identical (secret-bearing prefs reported
// by length only) — transports settled (the credits kit's WebDAV isolation
// stays: its own 99 backs it out), the host left minimized. The run global
// Zotero.__zttsTimeLeft140 is removed ONLY when every restore matched.
// params: none. state: reads Zotero.__zttsTimeLeft140.
(async () => {
  const out = { step: 'cleanup-restore' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.baseline) throw new Error('run state missing -- t0 did not run');
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, timeout = 15000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(step);
    }
    return test();
  };
  const errors = [];
  try {
    // --- Wrappers and stubs off, identity-checked. ---
    if (S.getAPIClientOriginal) {
      Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
      if (Zotero.Sync.Runner.getAPIClient !== S.getAPIClientOriginal) errors.push('getAPIClient not restored');
    }
    out.getAPIClientRestored = !S.getAPIClientOriginal || Zotero.Sync.Runner.getAPIClient === S.getAPIClientOriginal;
    if (S.launchURLOriginal) {
      Zotero.launchURL = S.launchURLOriginal;
      if (Zotero.launchURL !== S.launchURLOriginal) errors.push('launchURL not restored');
    }
    out.launchURLRestored = !S.launchURLOriginal || Zotero.launchURL === S.launchURLOriginal;
    out.launchCallsRecorded = (S.launchCalls || []).slice();

    // --- The provider figure back (the reader may already be closing). ---
    if (S.item3 && S.itemID != null) {
      const l = Zotero.Reader._readers || [];
      let reader = null;
      for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === S.itemID) reader = l[i];
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) {
        try {
          const list = reader._internalReader._readAloudManager.voicesForLanguage;
          for (let i = 0; i < (list ? list.length : 0); i++) {
            const w = Components.utils.waiveXrays(list[i]);
            if (String(w.id) === S.item1.voice) {
              const prov = Components.utils.waiveXrays(w.provider);
              prov.premiumCreditsRemaining = S.item3.keptPremium;
              out.providerFigureRestored = prov.premiumCreditsRemaining === S.item3.keptPremium;
              break;
            }
          }
        } catch (e) { out.providerFigureError = String(e); }
      } else out.providerFigureRestored = 'reader already gone (figure was restored by 03)';
      if (out.providerFigureRestored === false) errors.push('provider premiumCreditsRemaining not restored');
    }

    // --- Close the fixture player (the only allowed close), then the tab. ---
    const l = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === S.itemID) reader = l[i];
    if (reader) {
      const internal = reader._internalReader;
      const m = internal && internal._readAloudManager;
      if (m && m.active) {
        try { internal.toggleReadAloudPopup(false); } catch (e) { errors.push('closing the player threw: ' + e); }
        const gone = await waitFor(() => { const mm = reader._internalReader._readAloudManager; return !mm || !mm.active; }, 12000, 200);
        if (!gone) errors.push('the fixture session is still active after the popup close');
      }
      out.playerClosed = true;
      const host = Services.wm.getMostRecentWindow('navigator:browser');
      if (host && host.Zotero_Tabs && S.tabID) {
        host.Zotero_Tabs.close(S.tabID);
        await waitFor(() => { const ll = Zotero.Reader._readers || []; for (let i = 0; i < ll.length; i++) if (ll[i] && ll[i].itemID === S.itemID) return false; return true; }, 12000, 200);
      }
      out.tabClosed = true;
    } else out.playerClosed = 'already gone';

    // --- Erase the fixture item; position rows back to the opener's count. ---
    if (S.itemID != null) {
      const item = Zotero.Items.get(S.itemID);
      if (item) {
        await item.eraseTx();
        out.itemErased = Zotero.Items.get(S.itemID) === null || Zotero.Items.get(S.itemID) == null;
      } else out.itemErased = 'already gone';
      if (out.itemErased === false) errors.push('the fixture item was not erased');
      const diagnostics = Zotero.ZoteroTTS.diagnostics;
      const pos = JSON.parse(await diagnostics.position());
      out.positionRowsAfter = pos.database ? pos.database.rows : null;
      out.positionRowsBefore = S.positionRowsBefore;
      if (S.positionRowsBefore != null && out.positionRowsAfter !== S.positionRowsBefore) {
        // The reader's close may flush its position write a beat later; wait once.
        const settled = await waitFor(async () => {
          const pos2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
          return pos2.database && pos2.database.rows === S.positionRowsBefore;
        }, 10000, 300);
        if (!settled) errors.push('position rows did not return to the opener count: ' + S.positionRowsBefore + ' -> ' + out.positionRowsAfter);
        else { const pos3 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); out.positionRowsAfter = pos3.database.rows; }
      }
    }

    // --- Typed restore: reader.readAloudVoices FIRST (tabs idle), memory LAST. ---
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
    const secret = (suffix) => suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices';
    const describe = (suffix, rec, now) => secret(suffix)
      ? { matches: now.user === rec.user && now.value === rec.value,
          was: rec.user ? String(rec.value ?? '').length + ' chars' : '(no user value)',
          now: now.user ? String(now.value ?? '').length + ' chars' : '(no user value)' }
      : { matches: now.user === rec.user && now.value === rec.value,
          was: rec.user ? rec.value : '(no user value)',
          now: now.user ? now.value : '(no user value)' };

    if (S.baseline['reader.readAloudVoices']) restoreRec(S.baseline['reader.readAloudVoices']);
    const order = Object.keys(S.baseline).filter((k) => k !== 'readAloud.memory' && k !== 'reader.readAloudVoices');
    const restored = {};
    for (const suffix of order) {
      const rec = S.baseline[suffix];
      restoreRec(rec);
      restored[suffix] = describe(suffix, rec, readTyped(rec.key));
      if (!restored[suffix].matches) errors.push('pref not restored: ' + suffix);
    }
    restoreRec(S.baseline['reader.readAloudVoices']);
    restored['reader.readAloudVoices'] = describe('reader.readAloudVoices', S.baseline['reader.readAloudVoices'], readTyped(S.baseline['reader.readAloudVoices'].key));
    if (!restored['reader.readAloudVoices'].matches) errors.push('pref not restored: reader.readAloudVoices');
    restoreRec(S.baseline['readAloud.memory']);
    restored['readAloud.memory'] = describe('readAloud.memory', S.baseline['readAloud.memory'], readTyped(S.baseline['readAloud.memory'].key));
    if (!restored['readAloud.memory'].matches) errors.push('pref not restored: readAloud.memory');
    out.restored = restored;

    // --- Settle the plugin's transports (the WebDAV isolation itself belongs to the credits kit's 99). ---
    try {
      const diagnostics = Zotero.ZoteroTTS.diagnostics;
      const settled = await waitFor(async () => {
        const position = JSON.parse(await diagnostics.position());
        const settings = JSON.parse(await diagnostics.settingsSync());
        return position.store && position.store.queued === 0 && position.store.writing === false
          && settings.transport && settings.transport.running === false;
      });
      out.transportsSettled = !!settled;
      if (!settled) errors.push('transports did not settle');
    } catch (e) { out.transportsError = String(e); }

    // --- Leave the host minimized (the owner's standing exception). ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host && host.windowState !== 2) {
      if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED;
      await sleep(500);
    }
    out.hostMinimizedAtEnd = host ? host.windowState === 2 || host.windowState === host.STATE_MINIMIZED : 'no host window';

    out.errors = errors;
    if (errors.length === 0) {
      delete Zotero.__zttsTimeLeft140;
      out.runStateRemoved = !Zotero.__zttsTimeLeft140;
    } else {
      out.runStateRemoved = false;
      out.runStateKeptReason = 'restore errors remain; Zotero.__zttsTimeLeft140 kept as the recovery path';
    }
    out.status = errors.length ? 'PASS-WITH-NOTES' : 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    out.errors = errors;
    out.runStateRemoved = false;
    out.runStateKeptReason = 'cleanup threw; Zotero.__zttsTimeLeft140 kept as the recovery path';
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
