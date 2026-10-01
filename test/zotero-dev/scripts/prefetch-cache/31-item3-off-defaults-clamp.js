// Case item 3: Custom prefetch off uses the defaults. With 12 and 4 set in
// the prefs, turn the pane switch off: the two fields show 5 and 2, disabled,
// and the next start reads sentences 5 / requests 2; the prefs still hold 12
// and 4. On again: the fields show 12 and 4, enabled, and the next start uses
// them. An entry of 50 in the sentences field is kept as 20, and 0 in the
// requests field as 1, the field showing what was kept. Both prefs are
// cleared at the end (baseline holds no user value for them).
// params: none. state: reads fixtures; writes item3.
(async () => {
  const out = { step: 'item3-off-defaults-clamp' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = k => 'extensions.zotero.zotero-tts.' + k;
  let win = null;
  try {
    const title = 'ztts 166 offdef A ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/orca/workspaces/Zotero-TTS/issue_162/test/fixtures/fixture-a.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures.push({ key: 'a-3', itemID: item.id, title });

    Services.prefs.setIntPref(P('readAloud.prefetchSentences'), 12);
    Services.prefs.setIntPref(P('readAloud.prefetchRequests'), 4);
    out.prefsSet = { sentences: 12, requests: 4 };

    await Zotero.Reader.open(item.id);
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = null;
      const list = Zotero.Reader._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) reader = list[i];
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!reader) throw new Error('reader never appeared');
    const ir = reader._internalReader;
    const m = ir._readAloudManager;
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    const engineOfMine = async () => {
      const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const list = diag.readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) return list[i];
      return null;
    };
    const trustedShiftSpace = async () => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const ev = (key, code, kc) => new host.KeyboardEvent('', { key, code, keyCode: kc });
      tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    };
    // The next START's report after a given point: reports are keyed by their
    // `from`; the first report with a from greater than `afterFrom` belongs to
    // a start that ran after that point (starts run in position order, and
    // prefetchFrom writes the report as the clip starts).
    let maxFromSeen = 0;
    const noteReports = () => {
      const mine = engineCache;
      if (mine && mine.session && mine.session.prefetch) {
        const f = mine.session.prefetch.from;
        if (typeof f === 'number' && f > maxFromSeen) maxFromSeen = f;
      }
    };
    let engineCache = null;
    const nextStartAfter = async (afterFrom, timeoutMs) => {
      const tW = Date.now();
      while (Date.now() - tW < timeoutMs) {
        engineCache = await engineOfMine();
        noteReports();
        if (engineCache && engineCache.session && engineCache.session.prefetch) {
          const pf = engineCache.session.prefetch;
          if (pf.from > afterFrom) {
            return { from: pf.from, sentences: pf.sentences, requests: pf.requests, orderLen: pf.order.length, position: engineCache.session.position };
          }
        }
        await sleep(100);
      }
      return null;
    };

    await ir.toggleReadAloudPopup(true);
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      await trustedShiftSpace();
      await sleep(400);
      if (m.active && m.paused) { await trustedShiftSpace(); await sleep(400); }
    }
    out.startAt12 = await nextStartAfter(0, 40000);

    // The pane.
    let old = Services.wm.getMostRecentWindow('zotero:pref');
    if (old) { old.close(); const tC = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tC < 5000) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const tW = Date.now();
    win = null;
    while (!win && Date.now() - tW < 10000) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (!win) await sleep(100); }
    if (!win) throw new Error('settings window never opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const tN = Date.now();
    while (!win.document.getElementById('ztts-prefetch-sentences') && Date.now() - tN < 10000) await sleep(100);
    const doc = win.document;
    const fieldS = doc.getElementById('ztts-prefetch-sentences');
    const fieldR = doc.getElementById('ztts-prefetch-requests');
    const switchEl = doc.querySelector('[preference="' + P('readAloud.prefetchCustom') + '"]');
    if (!fieldS || !fieldR || !switchEl) throw new Error('pane elements missing');
    out.fieldsAtOpen = { sentences: String(fieldS.value), requests: String(fieldR.value), sentencesDisabled: fieldS.disabled, requestsDisabled: fieldR.disabled, switchOn: !!switchEl.checked };

    // OFF.
    engineCache = await engineOfMine(); noteReports();
    const fromBeforeOff = maxFromSeen;
    switchEl.click();
    await sleep(400);
    out.afterOff = {
      fieldsShown: [String(fieldS.value), String(fieldR.value)],
      disabled: [fieldS.disabled, fieldR.disabled],
      prefsStillHold: [Services.prefs.getIntPref(P('readAloud.prefetchSentences')), Services.prefs.getIntPref(P('readAloud.prefetchRequests'))],
      switchOn: !!switchEl.checked,
    };
    out.startAfterOff = await nextStartAfter(fromBeforeOff, 40000);

    // ON again.
    engineCache = await engineOfMine(); noteReports();
    const fromBeforeOn = maxFromSeen;
    switchEl.click();
    await sleep(400);
    out.afterOn = {
      fieldsShown: [String(fieldS.value), String(fieldR.value)],
      disabled: [fieldS.disabled, fieldR.disabled],
      switchOn: !!switchEl.checked,
    };
    out.startAfterOn = await nextStartAfter(fromBeforeOn, 40000);

    // Clamp: 50 -> 20 in the sentences field, 0 -> 1 in the requests field.
    fieldS.value = '50';
    fieldS.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(300);
    out.clampSentences = { fieldShows: String(fieldS.value), pref: Services.prefs.getIntPref(P('readAloud.prefetchSentences')) };
    engineCache = await engineOfMine(); noteReports();
    const fromBeforeClamp = maxFromSeen;
    fieldR.value = '0';
    fieldR.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(300);
    out.clampRequests = { fieldShows: String(fieldR.value), pref: Services.prefs.getIntPref(P('readAloud.prefetchRequests')) };
    out.startAt20x1 = await nextStartAfter(fromBeforeClamp, 40000);

    win.close();
    const tCC = Date.now();
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tCC < 5000) await sleep(100);
    win = null;

    Services.prefs.clearUserPref(P('readAloud.prefetchSentences'));
    Services.prefs.clearUserPref(P('readAloud.prefetchRequests'));
    out.prefsCleared = !Services.prefs.prefHasUserValue(P('readAloud.prefetchSentences')) && !Services.prefs.prefHasUserValue(P('readAloud.prefetchRequests'));

    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(500);
    try { const p = reader.close(); if (p && p.then) await p; } catch (_) {}
    const tG = Date.now();
    while (Date.now() - tG < 8000) {
      const list = Zotero.Reader._readers || [];
      let found = false;
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) found = true;
      if (!found) break;
      await sleep(200);
    }
    out.managerLeft = 'tab closed';

    S.item3 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { if (win) win.close(); } catch (_) {}
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
