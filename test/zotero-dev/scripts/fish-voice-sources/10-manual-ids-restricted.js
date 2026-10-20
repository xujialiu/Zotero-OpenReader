// Case item 10 (issue #216): with Fish off and Manual voices off, the Model
// IDs field stays disabled through Test connection, a failed Enable and an
// account-only notification; an empty key makes both fail locally, with no
// request. Manual voices on permits edits only while the section is
// unlocked; the saved text is retained when the switch goes off again.
// Safety: loopback-free by construction (no stub), requires WebDAV folder
// off, never overwrites an unfinished snapshot (an interrupted run's
// originals are reused), and every mutation phase sits in try/finally so
// the restore runs on failure too: Settings closes BEFORE the pref
// restore, both value and user-value presence are verified, and the
// privately stored key value is discarded only after verified cleanup.
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);
  const hasUV = (n) => Zotero.Prefs.prefHasUserValue(n, true);
  const clearUV = (n) => Services.prefs.clearUserPref(n);

  const closeSettings = async () => {
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) {
      w.close();
      for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100);
    }
    return !Services.wm.getMostRecentWindow('zotero:pref');
  };

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
    for (let i = 0; i < 80 && !win.document.getElementById('ztts-provider-fish'); i++) await sleep(100);
    if (!win.document.getElementById('ztts-provider-fish')) throw new Error('pane did not load');
    return win;
  };

  const out = { mutationsStarted: false };
  if ((Zotero.Reader._readers || []).length) throw new Error('readers are open; guard path not exercised here');
  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  if (ps.folder !== false) throw new Error('WebDAV folder must be off (run-level isolation) before kit mutations');

  if (!Zotero.ZoteroTTSRun.state) Zotero.ZoteroTTSRun.state = {};
  const st = Zotero.ZoteroTTSRun.state;
  let orig;
  if (st.fish10 && st.fish10.orig && st.fish10.restored !== true) {
    // Interrupted earlier attempt: keep its originals, never re-snapshot
    // over mutations they may already describe.
    orig = st.fish10.orig;
    out.reusedUnfinishedSnapshot = true;
  } else {
    orig = {
      enabled: { value: get(PRE + 'fish.enabled'), hadUserValue: hasUV(PRE + 'fish.enabled') },
      apiKey: { value: get(PRE + 'fish.apiKey') || '', hadUserValue: hasUV(PRE + 'fish.apiKey') },
      voices: { value: get(PRE + 'fish.voices'), hadUserValue: hasUV(PRE + 'fish.voices') },
      includeManual: { value: get(PRE + 'fish.includeManual'), hadUserValue: hasUV(PRE + 'fish.includeManual') },
    };
    st.fish10 = { orig, restored: false };
  }
  out.snapshot = {
    enabled: orig.enabled.value,
    apiKeyLen: orig.apiKey.value.length,
    apiKeyHadUserValue: orig.apiKey.hadUserValue,
    voicesHadUserValue: orig.voices.hadUserValue,
    voicesLen: (orig.voices.value || '').length,
    includeManual: orig.includeManual.value,
  };

  const verify = () => ({
    enabled: get(PRE + 'fish.enabled') === orig.enabled.value && hasUV(PRE + 'fish.enabled') === orig.enabled.hadUserValue,
    apiKey: (get(PRE + 'fish.apiKey') || '') === orig.apiKey.value && hasUV(PRE + 'fish.apiKey') === orig.apiKey.hadUserValue,
    voices: get(PRE + 'fish.voices') === orig.voices.value && hasUV(PRE + 'fish.voices') === orig.voices.hadUserValue,
    includeManual: get(PRE + 'fish.includeManual') === orig.includeManual.value && hasUV(PRE + 'fish.includeManual') === orig.includeManual.hadUserValue,
  });
  const restore = () => {
    if (orig.voices.hadUserValue) set(PRE + 'fish.voices', orig.voices.value); else clearUV(PRE + 'fish.voices');
    if (orig.includeManual.hadUserValue) set(PRE + 'fish.includeManual', orig.includeManual.value); else clearUV(PRE + 'fish.includeManual');
    if (orig.apiKey.hadUserValue) set(PRE + 'fish.apiKey', orig.apiKey.value); else clearUV(PRE + 'fish.apiKey');
    if (orig.enabled.hadUserValue) set(PRE + 'fish.enabled', orig.enabled.value); else clearUV(PRE + 'fish.enabled');
  };

  try {
    const win = await openPane();
    const doc = win.document;
    const modelIds = () => doc.getElementById('ztts-fish-model-ids');
    const ordinary = () => Array.from(doc.querySelectorAll('#ztts-provider-fish input, #ztts-provider-fish menulist'))
      .filter((el) => el.id !== 'ztts-fish-model-ids')
      .map((el) => ({ f: (el.getAttribute('preference') || el.id || el.tagName).replace(PRE, ''), d: !!el.disabled }));
    const row = () => ({
      toggle: doc.getElementById('ztts-enable-fish').getAttribute('label'),
      line: doc.getElementById('ztts-test-result-fish').textContent,
    });

    out.mutationsStarted = true;

    // Fish off, through the button (guard must not fire; no readers).
    if (get(PRE + 'fish.enabled') === true) {
      doc.getElementById('ztts-enable-fish').click();
      for (let i = 0; i < 60; i++) {
        await sleep(100);
        const dlg = doc.querySelector('dialog#ztts-notice');
        if (dlg && dlg.open) { out.guardDialog = dlg.textContent.slice(0, 120); dlg.close(); break; }
        if (get(PRE + 'fish.enabled') === false) break;
      }
      if (get(PRE + 'fish.enabled') !== false) throw new Error('fish did not turn off' + (out.guardDialog ? ' (guard: ' + out.guardDialog + ')' : ''));
    }
    if (get(PRE + 'fish.includeManual') !== false) set(PRE + 'fish.includeManual', false);
    await sleep(200);
    out.fishOff = get(PRE + 'fish.enabled') === false;
    out.manualOff = get(PRE + 'fish.includeManual') === false;
    out.idsDisabledBefore = modelIds().disabled === true;

    // Empty key for a local failure (no request).
    set(PRE + 'fish.apiKey', '');
    await sleep(200);

    doc.getElementById('ztts-test-fish').click();
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      const r = row();
      if (r.line && !/Testing/.test(r.line)) break;
    }
    out.testRow = row();
    out.testFailedLocally = out.testRow.line === 'No API key set for this provider.';
    out.afterTestOrdinaryEditable = ordinary().every((f) => !f.d);
    out.afterTestIdsStillDisabled = modelIds().disabled === true;

    doc.getElementById('ztts-enable-fish').click();
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      const r = row();
      if (r.line && !/Checking/.test(r.line)) break;
    }
    out.enableRow = row();
    out.enableFailedLocally = out.enableRow.line === 'No API key set for this provider.';
    out.enableLeftOff = get(PRE + 'fish.enabled') === false;
    out.afterEnableOrdinaryEditable = ordinary().every((f) => !f.d);
    out.afterEnableIdsStillDisabled = modelIds().disabled === true;

    Zotero.Notifier.trigger('modify', 'api-key', []);
    await sleep(500);
    out.afterNotifyIdsStillDisabled = modelIds().disabled === true;
    out.afterNotifyOrdinaryEditable = ordinary().every((f) => !f.d);

    doc.getElementById('ztts-fish-include-manual').click();
    await sleep(300);
    out.manualOnPref = get(PRE + 'fish.includeManual') === true;
    out.idsEditableWhenManualOn = modelIds().disabled === false;
    const PROBE = 'manual-retention-probe-123';
    modelIds().value = PROBE;
    modelIds().dispatchEvent(new win.Event('input', { bubbles: true }));
    modelIds().dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(200);
    out.prefTookProbe = get(PRE + 'fish.voices') === PROBE;

    doc.getElementById('ztts-fish-include-manual').click();
    await sleep(300);
    out.manualOffAgain = get(PRE + 'fish.includeManual') === false;
    out.idsDisabledWhenManualOff = modelIds().disabled === true;
    out.fieldRetainedProbe = modelIds().value === PROBE;
    out.prefRetainedProbe = get(PRE + 'fish.voices') === PROBE;
  } finally {
    // Settings closes before the restore; the restore runs on failure too.
    out.settingsClosedBeforeRestore = await closeSettings();
    restore();
    await sleep(300);
    out.restored = verify();
    out.allRestored = Object.values(out.restored).every(Boolean);
    out.restoredKeyLen = (get(PRE + 'fish.apiKey') || '').length;
    if (out.allRestored) {
      // Discard the privately stored key only after verified cleanup.
      orig.apiKey.value = null;
      st.fish10.restored = true;
      st.fish10.discarded = true;
    }
  }
  if (!out.allRestored) out.note = 'restoration incomplete; snapshot kept (interrupted retries will reuse it)';
  return JSON.stringify(out);
})()
