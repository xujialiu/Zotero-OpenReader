// sr-01 — item 2 (#210): Faster records Shift+IntlBackslash (not "(invalid)"), the pref holds the
// same text, and the key fires Faster on a fixture reader. Trusted presses through
// nsITextInputProcessor. Needs the settings window (opened here) and a fixture reader (pr-01's,
// with its Player paused). Restores the Faster pref at the end.
(async () => {
  const out = {};
  const d = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const full = 'extensions.zotero.zotero-tts.shortcuts.speedUp';
  S.srSpeedUpBefore = { value: Zotero.Prefs.get('zotero-tts.shortcuts.speedUp', true), hadUser: Services.prefs.prefHasUserValue(full) };

  // settings window on the plugin pane
  const existing = Services.wm.getMostRecentWindow('zotero:pref');
  if (existing) { existing.close(); const w0 = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - w0 < 5000) await new Promise((r) => setTimeout(r, 200)); }
  await Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let win = null;
  const w0 = Date.now();
  while (Date.now() - w0 < 10000) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) break; await new Promise((r) => setTimeout(r, 200)); }
  if (!win) { out.error = 'no settings window'; return JSON.stringify(out); }
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) { out.navErr = String(e); }
  const w1 = Date.now();
  while (Date.now() - w1 < 8000 && !win.document.getElementById('ztts-key-speedUp')) await new Promise((r) => setTimeout(r, 200));
  const btn = win.document.getElementById('ztts-key-speedUp');
  if (!btn) { out.error = 'no Faster row'; return JSON.stringify(out); }
  S.srWin = true;

  // arm the recording, press trusted Shift+IntlBackslash on the settings window
  btn.click();
  await new Promise((r) => setTimeout(r, 300));
  out.armedLabel = btn.getAttribute('label');
  const Ci = Components.interfaces;
  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(win)) { out.error = 'TIP refused (settings)'; return JSON.stringify(out); }
  const kd = (init) => tip.keydown(new win.KeyboardEvent('', init));
  const ku = (init) => tip.keyup(new win.KeyboardEvent('', init));
  kd({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  const r1 = kd({ key: '\\', code: 'IntlBackslash', keyCode: 0, shiftKey: true });
  ku({ key: '\\', code: 'IntlBackslash', keyCode: 0, shiftKey: true });
  ku({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  out.tipConsumed = r1;
  await new Promise((r) => setTimeout(r, 500));
  out.labelAfter = btn.getAttribute('label');
  out.prefAfter = Zotero.Prefs.get('extensions.zotero.zotero-tts.shortcuts.speedUp', true);
  out.recorded = out.labelAfter === 'Shift+IntlBackslash' && out.prefAfter === 'Shift+IntlBackslash';

  // the key fires Faster on a fixture reader (import one if none is open)
  let itemID = S.srFixture || (S.prItems && S.prItems.a);
  let reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === itemID);
  if (!reader) {
    const P2 = Zotero.ZoteroTTSRun.params;
    const t = 'ztts 2026-10-18 sr';
    const se = new Zotero.Search();
    se.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
    se.addCondition('title', 'is', t);
    const old = await se.search();
    if (old.length) await Zotero.Items.erase(old);
    const it = await Zotero.Attachments.importFromFile({ file: (P2.fixtureSr || P2.fixturePr1), libraryID: Zotero.Libraries.userLibraryID, title: t });
    S.srFixture = it.id;
    itemID = it.id;
    await Zotero.Reader.open(it.id);
    const tr0 = Date.now();
    while (Date.now() - tr0 < 20000) {
      reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === itemID);
      if (reader && reader._internalReader) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!reader) { out.fasterError = 'no fixture reader'; out.pass = out.recorded; return JSON.stringify(out); }
  const eng = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
  const i = (eng().readers ?? []).findIndex((r) => r.itemID === itemID);
  const speedBefore = eng().readers?.[i]?.session?.speed ?? null;
  const tip2 = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip2.beginInputTransactionForTests(reader._iframeWindow)) { out.error = 'TIP refused (reader)'; return JSON.stringify(out); }
  const kd2 = (init) => tip2.keydown(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  const ku2 = (init) => tip2.keyup(new reader._iframeWindow.KeyboardEvent('', Components.utils.cloneInto(init, reader._iframeWindow)));
  kd2({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  const r2 = kd2({ key: '\\', code: 'IntlBackslash', keyCode: 0, shiftKey: true });
  ku2({ key: '\\', code: 'IntlBackslash', keyCode: 0, shiftKey: true });
  ku2({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  await new Promise((r) => setTimeout(r, 900));
  const speedAfter = eng().readers?.[i]?.session?.speed ?? null;
  const el = reader._iframeWindow.document.getElementById('ztts-speed-toast');
  out.faster = { consumed: r2, speedBefore, speedAfter, toast: el ? String(el.textContent).slice(0, 40) : null };
  out.globalSpeed = Zotero.Prefs.get('zotero-tts.readAloud.speedPercent', true);
  S.srGlobalSpeedBefore = S.fix4Prefs['readAloud.speedPercent'];

  // restore the Faster pref
  if (S.srSpeedUpBefore.hadUser) Zotero.Prefs.set('zotero-tts.shortcuts.speedUp', S.srSpeedUpBefore.value);
  else Services.prefs.clearUserPref(full);
  await new Promise((r) => setTimeout(r, 300));
  out.labelRestored = btn.getAttribute('label');
  out.pass = !!(out.recorded && out.faster && (out.faster.speedAfter !== out.faster.speedBefore || /1\.\d+×/.test(out.faster.toast || '')));
  return JSON.stringify(out);
})()
