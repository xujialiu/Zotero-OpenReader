// Kit cleanup: restore the Compatible section from 00's snapshot — values
// AND user-value presence — after closing Settings (its bindings flush
// over a restore) and settling any held stub request. Verifies equality
// only; discards the snapshot's secret values only after every field is
// verified. Leaves WebDAV to the run-level isolation owner (the kit only
// requires folder:false, never touches it).
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const PRE = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);
  const hasUV = (n) => Zotero.Prefs.prefHasUserValue(n, true);
  const clearUV = (n) => Services.prefs.clearUserPref(n);

  const out = {};
  const st = Zotero.ZoteroTTSRun.state || {};
  if (!st.pc || !st.pc.original) return JSON.stringify({ nothingToRestore: true });
  if (st.pc.restored === true) return JSON.stringify({ alreadyRestored: true, snapshotDiscarded: st.pc.discarded === true });
  const orig = st.pc.original;

  // Loopback guard for the settle call (harmless when the stub is gone).
  const STUB = st.pc.stubBase;
  if (STUB) {
    const host = new URL(STUB).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) throw new Error('stubBase must be loopback, got ' + host);
  }

  // Settle any held speech reply first: a deterministic failure, never a
  // stale success that could commit behind the restore.
  try {
    if (STUB) {
      const r = await (await fetch(STUB + '/control/release?mode=fail', { method: 'POST' })).json();
      out.settledHeld = r.released;
    }
  } catch (e) { out.settleError = String(e); }
  await sleep(400);

  // Close the settings window BEFORE restoring (pane bindings flush over a restore).
  let w = Services.wm.getMostRecentWindow('zotero:pref');
  if (w) {
    w.close();
    for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100);
  }
  out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

  // Restore each pref: value AND user-value presence, exactly as snapshotted.
  const restoreOne = (key) => {
    const name = PRE + 'compatible.' + key;
    const snap = orig[key];
    if (snap.hadUserValue) set(name, snap.value);
    else clearUV(name);
    return { valueEqual: get(name) === snap.value, presenceEqual: hasUV(name) === snap.hadUserValue };
  };
  const results = {};
  for (const key of ['enabled', 'baseURL', 'apiKey', 'model', 'voices', 'headers']) {
    results[key] = restoreOne(key);
  }
  out.restored = results;
  out.allVerified = Object.values(results).every((r) => r.valueEqual && r.presenceEqual);
  // Report lengths only for the secrets.
  out.secretLensAfter = { apiKey: (get(PRE + 'compatible.apiKey') || '').length, headers: (get(PRE + 'compatible.headers') || '').length };

  if (out.allVerified) {
    // Only now discard the secret values from the snapshot.
    orig.apiKey.value = null;
    orig.headers.value = null;
    st.pc.restored = true;
    st.pc.discarded = true;
  }
  out.snapshotDiscarded = st.pc.discarded === true;
  if (!out.allVerified) out.note = 'restoration incomplete; snapshot kept for a re-run of 99-cleanup-restore.js';
  return JSON.stringify(out);
})()
