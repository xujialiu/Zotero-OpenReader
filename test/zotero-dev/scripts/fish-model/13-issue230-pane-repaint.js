// Issue #230, the paragraphs of 1c.1, through the real settings pane (the window 05 left open,
// Fish still at the owner's switch from 00's snapshot): the Provider group now owns the Model and
// voice-source controls, so (A) Disable through the button, (B) a pick while off writes the chosen
// pref, (C) an external Model pref write repaints the selected entry WITHOUT a connection check,
// (D) an external source pref write repaints the Manual-voices restriction without one, (E) an
// account (api-key) notification refresh keeps the choice and the restriction, and (F) the
// enabled-state lock is observed by a controlled EXTERNAL pref transition with the key EMPTY —
// explicitly an external switch observation, NOT a real Enable: no Enable click, no check, no
// synthesis request (every POST to fish.audio fails the row; keyless listing GETs are permitted).
// Leaves the window open and Fish OFF for 12; the kit's 99 restores the owner's switch.
// params: none. state: reads snap; writes issue230.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 6000, step = 50) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return null;
  };
  if (!state.snap) throw new Error('run 00-baseline-and-isolate.js first');
  const win = Services.wm.getMostRecentWindow('zotero:pref'), doc = win?.document;
  const menu = doc?.getElementById('ztts-fish-model'), button = doc?.getElementById('ztts-enable-fish');
  if (!menu || !button) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  const modelKey = prefix + 'fish.model', enabledKey = prefix + 'fish.enabled', manualKey = prefix + 'fish.includeManual';
  const keyKey = prefix + 'fish.apiKey', voicesKey = prefix + 'fish.voices';
  const view = () => {
    const kids = menu.menupopup.children, labels = [], values = [];
    for (let i = 0; i < kids.length; i++) { labels.push(kids[i].getAttribute('label')); values.push(kids[i].getAttribute('value')); }
    const sel = menu.selectedItem;
    return {
      labels, values, value: menu.value, selectedIndex: menu.selectedIndex,
      selectedLabel: sel ? sel.getAttribute('label') : null, shown: menu.label, disabled: !!menu.disabled,
      pref: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, prefHasUser: p.prefHasUserValue(modelKey),
      button: button.getAttribute('label'), buttonDisabled: button.disabled,
      testDisabled: doc.getElementById('ztts-test-fish').disabled,
      line: doc.getElementById('ztts-test-result-fish').textContent,
      idsDisabled: doc.getElementById('ztts-fish-model-ids').disabled,
      idsValueLen: (doc.getElementById('ztts-fish-model-ids').value || '').length,
      ordinaryInputsDisabled: Array.from(doc.querySelectorAll('#ztts-provider-fish input'))
        .filter(el => el.id !== 'ztts-fish-model-ids').map(el => !!el.disabled),
      fishEnabled: p.getBoolPref(enabledKey),
    };
  };
  const pick = value => {
    const kids = menu.menupopup.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].getAttribute('value') !== value) continue;
      menu.selectedItem = kids[i];
      kids[i].doCommand();
      return true;
    }
    return false;
  };
  const entries = async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    return body ? body.split('\n\n') : [];
  };
  const watchHttp = () => {
    const seen = [];
    const observer = { observe(subject) { try { const ch = subject.QueryInterface(Ci.nsIHttpChannel); if (/(^|\.)fish\.audio$/.test(ch.URI.host)) seen.push({ method: ch.requestMethod, path: ch.URI.filePath }); } catch (_) {} } };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return { stop() { try { Services.obs.removeObserver(observer, 'http-on-modify-request'); } catch (_) {} return seen; } };
  };
  const guardDialog = async () => {
    const dlg = doc.querySelector('dialog#ztts-notice');
    if (dlg && dlg.open) { const t = dlg.textContent.slice(0, 140); dlg.close(); return t; }
    return null;
  };
  const snapModel = state.snap['fish.model'], snapManual = state.snap['fish.includeManual'], snapVoices = state.snap['fish.voices'];
  // 00 keeps the key OUT of snap (it is measured, never held): state.apiKey is { hasUser, length }.
  const keyMeasure = state.apiKey;

  const watch = watchHttp();
  const logBefore = (await entries()).length;
  const out = { phases: {}, error: null };
  const mark = (name, v) => { out.phases[name] = v; };
  let keyHeld = null, restoreError = null;
  try {
    // No active Read Aloud session (closed under the baseline rules before the kit ran); a guard
    // dialog would name the owner's tabs and must abort this script.
    const readers = Zotero.Reader._readers || [];
    for (let i = 0; i < readers.length; i++) {
      if (readers[i]?._internalReader?._readAloudManager?.active) throw new Error('a Read Aloud session is active; close it under the baseline rules first');
    }

    // (A) Fish off, through the button.
    const a0 = view();
    if (a0.fishEnabled === true) {
      button.click();
      const off = await waitFor(() => p.getBoolPref(enabledKey) === false && button.getAttribute('label') === 'Enable', 8000, 100);
      const dlg = await guardDialog();
      if (dlg) throw new Error('reading guard dialog refused Disable with no active session: ' + dlg);
      if (!off) throw new Error('fish did not turn off through its button');
    }
    await sleep(300);
    mark('disabledByButton', view());

    // (B) A pick while off writes the chosen pref (a pick only writes the pref: ui/fish-model-rows.ts).
    const pickFound = pick('s2.1-pro');
    await sleep(300);
    mark('pickWhileOff', { pickFound, ...view() });

    // (C) External Model pref write repaints the selection without a connection check.
    const beforeC = (await entries()).length;
    const tC = Date.now();
    Zotero.Prefs.set('zotero-tts.fish.model', 'drama-3');
    const repainted = await waitFor(() => { const v = view(); return v.value === 'drama-3' && v.selectedLabel === 'drama-3 — paid' ? v : null; }, 3000);
    mark('externalModelWrite', { ms: Date.now() - tC, found: !!repainted, ...(repainted || view()), debugLinesBefore: beforeC });

    // (D) External source pref write repaints the Manual-voices restriction.
    const idsBefore = view().idsDisabled;
    Zotero.Prefs.set('zotero-tts.fish.includeManual', true);
    const idsOn = await waitFor(() => view().idsDisabled === false ? view() : null, 3000);
    const manualPref = p.getBoolPref(manualKey);
    Zotero.Prefs.set('zotero-tts.fish.includeManual', false);
    const idsOff = await waitFor(() => view().idsDisabled === true ? view() : null, 3000);
    mark('externalSourceWrite', {
      idsDisabledBefore: idsBefore, manualPrefWhenOn: manualPref,
      idsEditableWhenManualOn: !!idsOn, idsValueLenWhenOn: idsOn ? idsOn.idsValueLen : null,
      idsDisabledWhenManualOff: !!idsOff, idsValueLenWhenOff: idsOff ? idsOff.idsValueLen : null,
      voicesPrefUnchanged: (Zotero.Prefs.get('zotero-tts.fish.voices') ?? '') === (snapVoices.value ?? ''),
    });

    // (E) An account notification refresh keeps the choice and the restriction.
    Zotero.Notifier.trigger('modify', 'api-key', []);
    const afterNotify = await waitFor(() => { const v = view(); return Date.now() > 0 ? v : null; }, 1000);
    await sleep(700);
    mark('accountRefresh', { found: !!afterNotify, ...(view()) });

    // (F) The enabled-state lock, by a controlled EXTERNAL pref transition with an EMPTY key.
    //     This is an external switch observation, NOT a real Enable: nothing is clicked, no check
    //     runs, and the empty key means no synthesis could start even if the paint were wrong.
    keyHeld = { value: p.getStringPref(keyKey), hasUser: p.prefHasUserValue(keyKey) };
    p.setStringPref(keyKey, '');
    await sleep(150);
    Zotero.Prefs.set('zotero-tts.fish.enabled', true);
    const locked = await waitFor(() => { const v = view(); return v.disabled && v.button === 'Disable' ? v : null; }, 3000);
    const lockedView = locked || view();
    await sleep(500); // a stray check would show a line here
    const heldView = view();
    Zotero.Prefs.set('zotero-tts.fish.enabled', false);
    const unlocked = await waitFor(() => { const v = view(); return !v.disabled && v.button === 'Enable' ? v : null; }, 3000);
    mark('externalSwitchObservation', {
      isExternalSwitchObservation: true, notARealEnable: 'no Enable click, no connection check, key empty throughout',
      keyEmptyDuring: (p.getStringPref(keyKey) || '') === '',
      locked: { found: !!locked, menuDisabled: lockedView.disabled, button: lockedView.button, idsDisabled: lockedView.idsDisabled, line: lockedView.line, testDisabled: lockedView.testDisabled, inputsDisabled: lockedView.ordinaryInputsDisabled },
      stayedLockedWhileHeld: { lineStillEmpty: heldView.line === '', stillDisabled: heldView.disabled },
      unlockedAgain: { found: !!unlocked, menuDisabled: unlocked ? unlocked.disabled : view().disabled, button: unlocked ? unlocked.button : view().button, prefOff: p.getBoolPref(enabledKey) === false },
    });
  } catch (e) {
    out.error = String(e && e.message || e);
  } finally {
    // Restore what this script touched: model, manual, key. Voices were never written. The switch
    // stays OFF for 12; the kit's 99 restores the owner's switch from 00's snapshot.
    try {
      if (keyHeld) {
        if (keyHeld.hasUser) p.setStringPref(keyKey, keyHeld.value); else { try { p.clearUserPref(keyKey); } catch (_) {} }
      }
      if (snapModel.hasUser) Zotero.Prefs.set('zotero-tts.fish.model', snapModel.value);
      else if (p.prefHasUserValue(modelKey)) p.clearUserPref(modelKey);
      if (snapManual.hasUser) Zotero.Prefs.set('zotero-tts.fish.includeManual', snapManual.value);
      else if (p.prefHasUserValue(manualKey)) p.clearUserPref(manualKey);
    } catch (e) { restoreError = String(e && e.message || e); }
    await sleep(400);
  }
  const restored = {
    model: p.prefHasUserValue(modelKey) === snapModel.hasUser && (!snapModel.hasUser || (Zotero.Prefs.get('zotero-tts.fish.model') ?? null) === snapModel.value),
    manual: p.prefHasUserValue(manualKey) === snapManual.hasUser && (!snapManual.hasUser || p.getBoolPref(manualKey) === snapManual.value),
    keyLen: (p.getStringPref(keyKey) || '').length === (keyMeasure ? keyMeasure.length : (keyHeld ? keyHeld.value.length : 0)) && p.prefHasUserValue(keyKey) === (keyMeasure ? keyMeasure.hasUser : (keyHeld ? keyHeld.hasUser : p.prefHasUserValue(keyKey))),
    voicesLen: (Zotero.Prefs.get('zotero-tts.fish.voices') ?? '').length === (snapVoices.value || '').length,
    enabledLeftOffFor12: p.getBoolPref(enabledKey) === false,
  };
  await sleep(300);
  const requests = watch.stop();
  const byRoute = {};
  for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
  const posts = requests.filter(r => r.method === 'POST').length;
  const pluginLines = (await entries()).slice(logBefore).filter(l => l.includes('[zotero-tts]')).map(l => l.slice(0, 180));
  const ph = out.phases;
  const ok = !out.error && !restoreError
    && ph.disabledByButton && ph.disabledByButton.fishEnabled === false && ph.disabledByButton.button === 'Enable' && ph.disabledByButton.disabled === false
    && ph.pickWhileOff && ph.pickWhileOff.pickFound === true && ph.pickWhileOff.pref === 's2.1-pro' && ph.pickWhileOff.prefHasUser === true && ph.pickWhileOff.selectedLabel === 's2.1-pro — paid'
    && ph.externalModelWrite && ph.externalModelWrite.found && ph.externalModelWrite.line === '' && ph.externalModelWrite.button === 'Enable' && ph.externalModelWrite.disabled === false
    && ph.externalSourceWrite && ph.externalSourceWrite.idsDisabledBefore === true && ph.externalSourceWrite.manualPrefWhenOn === true
    && ph.externalSourceWrite.idsEditableWhenManualOn === true && ph.externalSourceWrite.idsDisabledWhenManualOff === true
    && ph.externalSourceWrite.voicesPrefUnchanged === true
    && ph.accountRefresh && ph.accountRefresh.pref === 'drama-3' && ph.accountRefresh.idsDisabled === true && ph.accountRefresh.line === '' && ph.accountRefresh.fishEnabled === false
    && ph.externalSwitchObservation && ph.externalSwitchObservation.locked.found === true && ph.externalSwitchObservation.locked.menuDisabled === true
    && ph.externalSwitchObservation.locked.button === 'Disable' && ph.externalSwitchObservation.locked.idsDisabled === true && ph.externalSwitchObservation.locked.line === ''
    && ph.externalSwitchObservation.stayedLockedWhileHeld.lineStillEmpty === true && ph.externalSwitchObservation.stayedLockedWhileHeld.stillDisabled === true
    && ph.externalSwitchObservation.unlockedAgain.found === true && ph.externalSwitchObservation.unlockedAgain.prefOff === true
    && posts === 0 && Object.values(restored).every(Boolean);
  out.restored = restored;
  out.requests = { total: requests.length, posts, byRoute };
  out.pluginLinesDuringCheck = pluginLines;
  out.ok = ok;
  out.status = ok ? 'PASS' : 'FAIL';
  state.issue230 = { status: out.status, requests: out.requests, restored };
  return JSON.stringify(out, null, 1);
})()
