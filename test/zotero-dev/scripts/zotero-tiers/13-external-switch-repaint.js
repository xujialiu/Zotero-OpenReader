// Case item 12 (issue #215): an external change of a Zotero tier's enabled
// pref reaches the open pane at once — Enable/Disable label, cleared stale
// success line, and the voice browser's tier list — both tiers, both
// directions, and again after closing and reopening Settings. The pref
// write is the exact one the refusal handler performs. A tier that is
// ALREADY ON gets its settled success line from Test connection (list/read
// only — no credits spent), not from an Enable click that would have
// turned it off. No credits are spent on any path. Safety: requires
// WebDAV folder off, never overwrites an unfinished snapshot, and the
// restore (values + user-value presence, Settings closed first) runs in a
// finally, on failure too.
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true); // the refusal handler's write

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
    for (let i = 0; i < 80 && !win.document.getElementById('ztts-provider-zotero-standard'); i++) await sleep(100);
    if (!win.document.getElementById('ztts-provider-zotero-standard')) throw new Error('pane did not load');
    return win;
  };

  const out = { tiers: {} };
  if ((Zotero.Reader._readers || []).length) throw new Error('a reader is open; item 12 needs no Player on the tested tier');
  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  if (ps.folder !== false) throw new Error('WebDAV folder must be off (run-level isolation) before kit mutations');

  if (!Zotero.ZoteroTTSRun.state) Zotero.ZoteroTTSRun.state = {};
  const st = Zotero.ZoteroTTSRun.state;
  let orig;
  if (st.tier12 && st.tier12.orig && st.tier12.restored !== true) {
    orig = st.tier12.orig;
    out.reusedUnfinishedSnapshot = true;
  } else {
    orig = {
      'zotero-standard': { value: get(PRE + 'zotero-standard.enabled'), hadUserValue: Zotero.Prefs.prefHasUserValue(PRE + 'zotero-standard.enabled', true) },
      'zotero-premium': { value: get(PRE + 'zotero-premium.enabled'), hadUserValue: Zotero.Prefs.prefHasUserValue(PRE + 'zotero-premium.enabled', true) },
    };
    st.tier12 = { orig, restored: false };
  }
  out.original = { standard: orig['zotero-standard'].value, premium: orig['zotero-premium'].value };

  const rowOf = (doc, tier) => ({
    toggle: doc.getElementById('ztts-enable-' + tier).getAttribute('label'),
    line: doc.getElementById('ztts-test-result-' + tier).textContent,
  });
  const browserText = (doc) => doc.getElementById('ztts-voices-tiers').textContent;
  const tierName = { 'zotero-standard': 'Zotero Standard', 'zotero-premium': 'Zotero Premium' };

  try {
    const win = await openPane();
    const doc = win.document;

    for (const tier of ['zotero-standard', 'zotero-premium']) {
      const rec = {};
      if (get(PRE + tier + '.enabled') === true) {
        // Already on: Test connection settles the success line (voices list /
        // credits read only — never a synthesis, never a disable).
        doc.getElementById('ztts-test-' + tier).click();
        for (let i = 0; i < 150; i++) {
          await sleep(100);
          const r = rowOf(doc, tier);
          if (r.line && !/Testing/.test(r.line)) break;
        }
        rec.via = 'test-connection (tier already on)';
      } else {
        doc.getElementById('ztts-enable-' + tier).click();
        let on = null;
        for (let i = 0; i < 150; i++) {
          await sleep(100);
          const dlg = doc.querySelector('dialog#ztts-notice');
          if (dlg && dlg.open) { rec.guardDialog = dlg.textContent.slice(0, 120); dlg.close(); break; }
          if (get(PRE + tier + '.enabled') === true) { on = true; break; }
        }
        if (!on) throw new Error(tier + ' did not enable' + (rec.guardDialog ? ' (guard: ' + rec.guardDialog + ')' : ''));
        rec.via = 'enable';
      }
      // Settle the success line before the external writes.
      const tSettle = Date.now();
      for (let i = 0; i < 120; i++) {
        await sleep(50);
        if (rowOf(doc, tier).line !== '') break;
      }
      rec.successLine = rowOf(doc, tier).line; // kept separately, never overwritten below
      rec.browserBeforeOff = browserText(doc).includes(tierName[tier]);
      if (!rec.successLine) throw new Error(tier + ': settled success line never appeared');

      // External write OFF.
      const t0 = Date.now();
      set(PRE + tier + '.enabled', false);
      let labelMs = null;
      for (let i = 0; i < 60; i++) {
        await sleep(50);
        if (rowOf(doc, tier).toggle === 'Enable') { labelMs = Date.now() - t0; break; }
      }
      rec.offLabelMs = labelMs;
      rec.offRow = rowOf(doc, tier);
      let lineClearMs = null;
      for (let i = 0; i < 40; i++) {
        await sleep(50);
        if (rowOf(doc, tier).line === '') { lineClearMs = Date.now() - t0; break; }
      }
      rec.offLineClearMs = lineClearMs;
      rec.offLineClearedFromSuccess = rec.offRow.line === '' && rec.successLine !== '';
      let browserMs = null;
      for (let i = 0; i < 160; i++) {
        await sleep(50);
        if (!browserText(doc).includes(tierName[tier])) { browserMs = Date.now() - t0; break; }
      }
      rec.offBrowserMs = browserMs;
      rec.offPref = get(PRE + tier + '.enabled');

      // External write ON.
      const t1 = Date.now();
      set(PRE + tier + '.enabled', true);
      let onMs = null;
      for (let i = 0; i < 60; i++) {
        await sleep(50);
        if (rowOf(doc, tier).toggle === 'Disable') { onMs = Date.now() - t1; break; }
      }
      rec.onLabelMs = onMs;
      rec.onRowAfterOn = rowOf(doc, tier);
      let browserOnMs = null;
      for (let i = 0; i < 160; i++) {
        await sleep(50);
        if (browserText(doc).includes(tierName[tier])) { browserOnMs = Date.now() - t1; break; }
      }
      rec.onBrowserMs = browserOnMs;
      out.tiers[tier] = rec;
    }

    // After closing and reopening Settings: one more cycle per tier.
    await closeSettings();
    const win2 = await openPane();
    const doc2 = win2.document;
    for (const tier of ['zotero-standard', 'zotero-premium']) {
      const rec = { pass: 'after-reopen' };
      const t0 = Date.now();
      set(PRE + tier + '.enabled', false);
      let labelMs = null;
      for (let i = 0; i < 60; i++) {
        await sleep(50);
        if (rowOf(doc2, tier).toggle === 'Enable') { labelMs = Date.now() - t0; break; }
      }
      rec.offLabelMs = labelMs;
      rec.offBrowserOk = await new Promise((res) => {
        const deadline = t0 + 8000;
        const iv = setInterval(() => {
          if (!browserText(doc2).includes(tierName[tier])) { clearInterval(iv); res(true); return; }
          if (Date.now() > deadline) { clearInterval(iv); res(false); }
        }, 50);
      });
      set(PRE + tier + '.enabled', true);
      const t1 = Date.now();
      let onMs = null;
      for (let i = 0; i < 60; i++) {
        await sleep(50);
        if (rowOf(doc2, tier).toggle === 'Disable') { onMs = Date.now() - t1; break; }
      }
      rec.onLabelMs = onMs;
      out.tiers[tier + 'Reopen'] = rec;
    }
  } finally {
    // Settings closes before the restore; the restore runs on failure too.
    out.settingsClosedBeforeRestore = await closeSettings();
    for (const tier of ['zotero-standard', 'zotero-premium']) {
      if (orig[tier].hadUserValue) set(PRE + tier + '.enabled', orig[tier].value);
      else Services.prefs.clearUserPref(PRE + tier + '.enabled');
    }
    await sleep(400);
    out.restored = {
      standard: get(PRE + 'zotero-standard.enabled') === orig['zotero-standard'].value && Zotero.Prefs.prefHasUserValue(PRE + 'zotero-standard.enabled', true) === orig['zotero-standard'].hadUserValue,
      premium: get(PRE + 'zotero-premium.enabled') === orig['zotero-premium'].value && Zotero.Prefs.prefHasUserValue(PRE + 'zotero-premium.enabled', true) === orig['zotero-premium'].hadUserValue,
    };
    out.allRestored = out.restored.standard && out.restored.premium;
    if (out.allRestored) st.tier12.restored = true;
  }
  if (!out.allRestored) out.note = 'restoration incomplete; snapshot kept (interrupted retries will reuse it)';
  return JSON.stringify(out);
})()
