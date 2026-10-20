// 1.6.2 bullet 3 (issue #214): close the settings window while an Enable
// reply is held, then release it. Expected: no late enable and no new
// plugin error; a reopened pane shows the prefs, not the abandoned check.
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = Zotero.ZoteroTTSRun.state.pc.stubBase;
  const reqLoop = (u, w) => { const h = new URL(u).hostname; if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error(w + ' must be loopback, got ' + h); };
  reqLoop(STUB, 'stubBase');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);

  const rowOf = (doc, id) => ({
    toggle: doc.getElementById('ztts-enable-' + id) ? doc.getElementById('ztts-enable-' + id).getAttribute('label') : null,
    line: doc.getElementById('ztts-test-result-' + id) ? doc.getElementById('ztts-test-result-' + id).textContent : null,
  });
  const errorsWithTag = () => (Zotero.getErrors(false) || []).filter((e) => /zotero-tts|ZoteroTTS/i.test(e));

  const out = {};
  if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible must be off at start');
  set(PRE + 'compatible.baseURL', STUB);
  await fetch(STUB + '/control/reset', { method: 'POST' });

  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || !win.document.getElementById('ztts-provider-compatible')) throw new Error('pane not open');
  const doc = win.document;

  const t0 = Date.now();
  doc.getElementById('ztts-enable-compatible').click();
  let held = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const s = await (await fetch(STUB + '/control/state')).json();
    if (s.held >= 1) { held = Date.now() - t0; break; }
  }
  out.heldAfterMs = held;
  if (!held) throw new Error('synthesis never held');
  out.rowWhileHeld = rowOf(doc, 'compatible');
  const errorsBefore = errorsWithTag().length;

  // Close the settings window while the check is pending.
  win.close();
  let closed = null;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    if (!Services.wm.getMostRecentWindow('zotero:pref')) { closed = Date.now() - t0; break; }
  }
  out.windowClosedAfterMs = closed;
  if (!closed) throw new Error('settings window did not close');

  // Release the reply the abandoned check was waiting for.
  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  await sleep(1500);
  out.prefAfterRelease = get(PRE + 'compatible.enabled');
  out.noLateEnable = out.prefAfterRelease === false;

  // A fresh pane reflects the prefs, not the abandoned check.
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let win2 = null;
  for (let i = 0; i < 60 && !win2; i++) { await sleep(100); win2 = Services.wm.getMostRecentWindow('zotero:pref'); }
  if (!win2) throw new Error('settings window did not reopen');
  await win2.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 80 && !win2.document.getElementById('ztts-provider-compatible'); i++) await sleep(100);
  const doc2 = win2.document;
  out.reopenedRow = rowOf(doc2, 'compatible');
  const fields2 = Array.from(doc2.querySelectorAll('#ztts-provider-compatible input')).map((el) => ({ d: !!el.disabled }));
  out.reopenedFieldsUnlocked = fields2.every((f) => !f.d);
  out.reopenedReflectsPrefs = out.reopenedRow.toggle === 'Enable' && !/Checking/.test(out.reopenedRow.line || '');

  out.newPluginErrors = errorsWithTag().length - errorsBefore;
  return JSON.stringify(out);
})()
