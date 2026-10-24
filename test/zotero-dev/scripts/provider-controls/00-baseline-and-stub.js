// Baseline for the #214 checks: open the pane fresh, snapshot the whole
// Compatible section — INCLUDING the actual apiKey/headers values, kept
// only inside Zotero's run state, never returned — then turn Compatible
// off through its button (no readers may exist; the guard must not fire)
// and point the section at the local loopback stub with no key, no
// headers, no model. Refuses to overwrite an unfinished snapshot, so an
// interrupted run's originals survive for 99-cleanup-restore.js.
// Requires loopback stub params and WebDAV folder off (run-level isolation).
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = P.stubBase;
  const ALT = P.altBase;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);
  const hasUV = (n) => Zotero.Prefs.prefHasUserValue(n, true);

  const loopback = (u, what) => {
    const host = new URL(u).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
      throw new Error(what + ' must be a loopback address, got ' + host);
    }
  };
  loopback(STUB, 'params.stubBase');
  if (ALT) loopback(ALT, 'params.altBase');

  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  if (ps.folder !== false) throw new Error('WebDAV folder must be off (run-level isolation) before kit mutations');

  // Snapshot protection: an unfinished snapshot is never overwritten — the
  // originals inside it are the only copy of the owner's values.
  if (!Zotero.ZoteroTTSRun.state) Zotero.ZoteroTTSRun.state = {};
  const st = Zotero.ZoteroTTSRun.state;
  if (st.pc && st.pc.original && st.pc.restored !== true) {
    throw new Error('an unfinished Compatible snapshot exists; run 99-cleanup-restore.js first');
  }

  const openPane = async () => {
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) {
      w.close();
      for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    for (let i = 0; i < 60 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); }
    if (!win) throw new Error('settings window did not open');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    for (let i = 0; i < 80 && !win.document.getElementById('ztts-provider-compatible'); i++) await sleep(100);
    if (!win.document.getElementById('ztts-provider-compatible')) throw new Error('pane did not load');
    return win;
  };

  const out = {};
  // The case closes only the affected Players (baseline rules): an open reader tab with no active
  // Read Aloud session cannot fire the guard, so the kit refuses on an ACTIVE session, not on tabs.
  const activeOn = [];
  const readersNow = Zotero.Reader._readers || [];
  for (let i = 0; i < readersNow.length; i++) {
    if (readersNow[i]?._internalReader?._readAloudManager?.active) activeOn.push(readersNow[i].tabID);
  }
  if (activeOn.length) throw new Error('a Read Aloud session is active on tab(s) ' + activeOn.join(', ') + '; close it under the baseline rules first');
  out.activeSessionsAtStart = 0;
  const win = await openPane();
  const doc = win.document;

  // Full-value snapshot; secret VALUES stay inside Zotero (lengths only below).
  const original = {
    enabled: { value: get(PRE + 'compatible.enabled'), hadUserValue: hasUV(PRE + 'compatible.enabled') },
    baseURL: { value: get(PRE + 'compatible.baseURL'), hadUserValue: hasUV(PRE + 'compatible.baseURL') },
    apiKey: { value: get(PRE + 'compatible.apiKey') || '', hadUserValue: hasUV(PRE + 'compatible.apiKey') },
    model: { value: get(PRE + 'compatible.model'), hadUserValue: hasUV(PRE + 'compatible.model') },
    voices: { value: get(PRE + 'compatible.voices'), hadUserValue: hasUV(PRE + 'compatible.voices') },
    headers: { value: get(PRE + 'compatible.headers') || '', hadUserValue: hasUV(PRE + 'compatible.headers') },
  };
  st.pc = { original, stubBase: STUB, altBase: ALT, restored: false };
  out.snapshotRecorded = true;
  out.snapshot = {
    enabled: original.enabled.value,
    baseURL: original.baseURL.value,
    apiKeyLen: original.apiKey.value.length,
    apiKeyHadUserValue: original.apiKey.hadUserValue,
    model: original.model.value,
    headersLen: original.headers.value.length,
  };

  // Compatible off, through the button (a dialog would name the owner's tabs — refuse).
  if (original.enabled.value === true) {
    doc.getElementById('ztts-enable-compatible').click();
    let dialogSeen = null;
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      const dlg = doc.querySelector('dialog#ztts-notice');
      if (dlg && dlg.open) { dialogSeen = dlg.textContent.slice(0, 120); dlg.close(); break; }
      if (get(PRE + 'compatible.enabled') === false) break;
    }
    if (dialogSeen) throw new Error('reading guard dialog appeared: ' + dialogSeen);
    if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible did not turn off');
  }
  out.disabledForTest = get(PRE + 'compatible.enabled') === false;

  // Point the section at the stub; no key, no headers, no model.
  set(PRE + 'compatible.baseURL', STUB);
  set(PRE + 'compatible.apiKey', '');
  set(PRE + 'compatible.headers', '');
  set(PRE + 'compatible.model', '');
  out.baseURLNow = get(PRE + 'compatible.baseURL');
  out.keyLenNow = (get(PRE + 'compatible.apiKey') || '').length;

  const byField = (suffix) => Array.from(doc.querySelectorAll('#ztts-provider-compatible input')).find((el) => (el.getAttribute('preference') || '').endsWith(suffix));
  out.fieldFollowsPref = byField('compatible.baseURL') ? byField('compatible.baseURL').value === STUB : 'no field';

  try { await fetch(STUB + '/control/reset', { method: 'POST' }); out.stubReset = true; } catch (e) { out.stubReset = String(e); }
  return JSON.stringify(out);
})()
