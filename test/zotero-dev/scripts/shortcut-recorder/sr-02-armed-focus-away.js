// sr-02 — item 3 (#211): a recording left armed ends when the focus goes elsewhere, and a key
// aimed at a text field reaches the field. Arm Slower, click into OpenAI Compatible's Base URL:
// the row stops showing `Press the new keys…`; Backspace and Cmd+A reach the field (its text
// changes; snapshotted and restored); Slower still reads Shift+X and its pref is unchanged.
// Again with Zotero's settings search box; then a combination on the armed button still records.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const full = 'extensions.zotero.zotero-tts.shortcuts.speedDown';
  S.srSpeedDownBefore = { value: Zotero.Prefs.get('zotero-tts.shortcuts.speedDown', true), hadUser: Services.prefs.prefHasUserValue(full) };

  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) { out.error = 'no settings window (sr-01 opens it)'; return JSON.stringify(out); }
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
  // the pane locks a provider's fields while it is on; unlock via the pane's own toggle
  // (a raw pref write does not repaint). compatible is on for the stub runs -> this disables it.
  Zotero.Prefs.set('zotero-tts.compatible.enabled', false);
  const toggleBtn = win.document.getElementById('ztts-enable-compatible');
  if (toggleBtn) { toggleBtn.click(); await new Promise((r) => setTimeout(r, 600)); }
  S.srCompatibleWasReenabledByTest = true;
  const w1 = Date.now();
  while (Date.now() - w1 < 8000 && !win.document.getElementById('ztts-key-speedDown')) await new Promise((r) => setTimeout(r, 200));
  const doc = win.document;
  const slower = doc.getElementById('ztts-key-speedDown');
  const slowerClear = doc.getElementById('ztts-key-clear-speedDown');
  const baseUrl = doc.querySelector('input[preference="extensions.zotero.zotero-tts.compatible.baseURL"]');
  if (!slower || !baseUrl) { out.error = 'rows not found'; return JSON.stringify(out); }

  const tipOf = () => {
    const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(win);
    return tip;
  };
  const press = (tip, init) => {
    const kd = (i) => tip.keydown(new win.KeyboardEvent('', i));
    const ku = (i) => tip.keyup(new win.KeyboardEvent('', i));
    kd(init); ku(init);
  };
  const slPref = () => Zotero.Prefs.get('extensions.zotero.zotero-tts.shortcuts.speedDown', true);
  const slLabel = () => slower.getAttribute('label');

  // --- Base URL: arm Slower, click into the field
  slower.click();
  await new Promise((r) => setTimeout(r, 250));
  out.armed = { label: slLabel() };
  baseUrl.focus();
  await new Promise((r) => setTimeout(r, 350));
  out.afterFocus = { label: slLabel(), stillRecording: /Press the new keys/.test(slLabel()) };
  const valueBefore = baseUrl.value;
  // Backspace then Cmd+A (Meta+A) aimed at the focused field
  const tip = tipOf();
  press(tip, { key: 'Backspace', code: 'Backspace', keyCode: 8 });
  await new Promise((r) => setTimeout(r, 250));
  const afterBackspace = baseUrl.value;
  press(tip, { key: 'a', code: 'KeyA', keyCode: 65, metaKey: true });
  await new Promise((r) => setTimeout(r, 250));
  out.baseUrl = { before: String(valueBefore).slice(0, 40), afterBackspace: String(afterBackspace).slice(0, 40), afterCmdA: String(baseUrl.value).slice(0, 40) };
  out.slowerAfterKeys = { label: slLabel(), pref: slPref() };
  // restore the field's text
  baseUrl.value = valueBefore;
  baseUrl.dispatchEvent(new win.Event('change', { bubbles: true }));
  out.passBaseUrl = !!(out.afterFocus.label && !/Press the new keys/.test(out.afterFocus.label)
    && afterBackspace !== valueBefore && slPref() === S.srSpeedDownBefore.value);

  // --- settings search box: arm Slower again, click the search box, type Backspace + Cmd+A
  const search = doc.getElementById('prefs-search');
  out.searchFound = !!search;
  if (search) {
    slower.click();
    await new Promise((r) => setTimeout(r, 250));
    out.armed2 = { label: slLabel() };
    search.focus();
    await new Promise((r) => setTimeout(r, 350));
    out.afterFocus2 = { label: slLabel(), stillRecording: /Press the new keys/.test(slLabel()) };
    const svBefore = search.value;
    const tip2 = tipOf();
    press(tip2, { key: 'Backspace', code: 'Backspace', keyCode: 8 });
    press(tip2, { key: 'z', code: 'KeyZ', keyCode: 90 });
    await new Promise((r) => setTimeout(r, 300));
    out.search = { before: String(svBefore).slice(0, 30), after: String(search.value).slice(0, 30) };
    out.slowerAfterSearch = { label: slLabel(), pref: slPref() };
    try { search.value = ''; search.dispatchEvent(new win.Event('change', { bubbles: true })); } catch (e) {}
    out.passSearch = !!(out.afterFocus2.label && !/Press the new keys/.test(out.afterFocus2.label)
      && String(search.value).length !== String(svBefore).length && slPref() === S.srSpeedDownBefore.value);
  }

  // --- a combination on the armed button still records
  slower.click();
  await new Promise((r) => setTimeout(r, 250));
  out.armed3 = { label: slLabel() };
  const tip3 = tipOf();
  press(tip3, { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true });
  const rc = tip3.keydown(new win.KeyboardEvent('', { key: 'V', code: 'KeyV', keyCode: 86, shiftKey: true }));
  tip3.keyup(new win.KeyboardEvent('', { key: 'V', code: 'KeyV', keyCode: 86, shiftKey: true }));
  tip3.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 400));
  out.combo = { consumed: rc, label: slLabel(), pref: slPref() };

  // restore the Slower pref
  if (S.srSpeedDownBefore.hadUser) Zotero.Prefs.set('zotero-tts.shortcuts.speedDown', S.srSpeedDownBefore.value);
  else Services.prefs.clearUserPref(full);
  await new Promise((r) => setTimeout(r, 300));
  out.slowerLabelRestored = slLabel();

  out.pass = !!(out.passBaseUrl && (!search || out.passSearch) && out.combo.pref === 'Shift+V');
  return JSON.stringify(out);
})()
