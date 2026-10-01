// Case item 8: the old pair is never read. Set by hand the OLD prefs
// zotero-tts.prefetch = 9 and zotero-tts.prefetchEnabled = false and clear
// the three new readAloud.prefetch* prefs: the pane shows Custom prefetch ON
// with 5 and 2 (the fields' ids ztts-prefetch-custom / -sentences /
// -requests, settings pane opened and read per workflow section 1), and the
// next start reads sentences: 5, requests: 2. The two old prefs are
// restored exactly afterwards: this profile holds prefetch with a user value
// of 5 and prefetchEnabled with none.
// params: root. state: reads baseline; writes fixtures + item8.
(async () => {
  const out = { step: 'item8-old-pair-ignored' };
  const S = Zotero.ZoteroTTSRun.state;
  const root = Zotero.ZoteroTTSRun.params.root;
  const p = Services.prefs;
  const B = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snapshot = [];
  const remember = key => {
    const type = p.getPrefType(B + key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(B + key);
    else if (type === p.PREF_INT) value = p.getIntPref(B + key);
    else if (type === p.PREF_STRING) value = p.getStringPref(B + key);
    snapshot.push({ key, type, user: p.prefHasUserValue(B + key), value });
  };
  const restoreAll = () => {
    for (let i = snapshot.length - 1; i >= 0; i--) {
      const rec = snapshot[i];
      try {
        if (!rec.user) { if (p.prefHasUserValue(B + rec.key)) p.clearUserPref(B + rec.key); }
        else if (rec.type === p.PREF_BOOL) p.setBoolPref(B + rec.key, !!rec.value);
        else if (rec.type === p.PREF_INT) p.setIntPref(B + rec.key, Number(rec.value));
        else if (rec.type === p.PREF_STRING) p.setStringPref(B + rec.key, String(rec.value ?? ''));
      } catch (e) { out['restoreError_' + rec.key] = String(e); }
    }
  };
  try {
    remember('readAloud.prefetchCustom'); remember('readAloud.prefetchSentences'); remember('readAloud.prefetchRequests');
    remember('prefetch'); remember('prefetchEnabled');
    remember('readAloud.defaultVoice'); remember('local.enabled');
    // The old pair, by hand; the new three cleared.
    p.setIntPref(B + 'prefetch', 9);
    p.setBoolPref(B + 'prefetchEnabled', false);
    for (const k of ['readAloud.prefetchCustom', 'readAloud.prefetchSentences', 'readAloud.prefetchRequests']) {
      if (p.prefHasUserValue(B + k)) p.clearUserPref(B + k);
    }
    p.setBoolPref(B + 'local.enabled', true);
    p.setStringPref(B + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
    out.prefsSet = {
      prefetch: p.getIntPref(B + 'prefetch'), prefetchEnabled: p.getBoolPref(B + 'prefetchEnabled'),
      newPrefsHaveUserValue: ['readAloud.prefetchCustom', 'readAloud.prefetchSentences', 'readAloud.prefetchRequests'].map(k => p.prefHasUserValue(B + k)),
    };

    // The pane: close any open pref window, reopen, navigate, read the fields.
    for (let w = Services.wm.getMostRecentWindow('zotero:pref'); w; w = Services.wm.getMostRecentWindow('zotero:pref')) { w.close(); await sleep(300); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const tW = Date.now();
    while (Date.now() - tW < 10000 && !win) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (!win) await sleep(200);
    }
    if (!win) throw new Error('preferences window never opened');
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) { out.paneNavError = String(e); }
    let paneReady = false;
    const tP = Date.now();
    while (Date.now() - tP < 10000 && !paneReady) {
      paneReady = !!win.document.getElementById('ztts-provider-openai-official');
      if (!paneReady) await sleep(200);
    }
    if (!paneReady) throw new Error('plugin pane never rendered');
    const custom = win.document.querySelector('checkbox[preference="extensions.zotero.zotero-tts.readAloud.prefetchCustom"]');
    const sentences = win.document.getElementById('ztts-prefetch-sentences');
    const requests = win.document.getElementById('ztts-prefetch-requests');
    out.paneShows = {
      customChecked: custom ? !!custom.checked : null,
      sentencesValue: sentences ? String(sentences.value) : null,
      sentencesDisabled: sentences ? !!sentences.disabled : null,
      requestsValue: requests ? String(requests.value) : null,
      requestsDisabled: requests ? !!requests.disabled : null,
    };
    win.close();
    const tG = Date.now();
    while (Date.now() - tG < 8000 && Services.wm.getMostRecentWindow('zotero:pref')) await sleep(200);
    out.paneWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

    // A fresh fixture: the next start reads the defaults, not the old pair.
    const title = 'ztts 166 prefetch A8 ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: PathUtils.join(root, 'test', 'fixtures', 'fixture-a.pdf'),
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures = Array.isArray(S.fixtures) ? S.fixtures : [];
    S.fixtures.push({ key: 'a-8', itemID: item.id, title });
    const session166 = Zotero.__ztts166;
    session166.fixtures = Array.isArray(session166.fixtures) ? session166.fixtures : [];
    session166.fixtures.push({ key: 'a-8', itemID: item.id, title });
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
    if (!reader || !reader._internalReader || !reader._internalReader._readAloudManager) throw new Error('reader/manager never appeared within 24 s');
    const ir = reader._internalReader;
    const m = ir._readAloudManager;
    const engineOfMine = async () => {
      const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      const list = diag.readers || [];
      for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id) return list[i];
      return null;
    };
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    await ir.toggleReadAloudPopup(true);
    try { if (host.Zotero_Tabs && host.Zotero_Tabs.selectedID !== reader.tabID) host.Zotero_Tabs.select(reader.tabID); } catch (_) {}
    await sleep(400);
    const openT = Date.now();
    while (Date.now() - openT < 15000) {
      const mine = await engineOfMine();
      if (mine && mine.session) break;
      await sleep(120);
    }
    let tAct = Date.now();
    while (Date.now() - tAct < 8000 && !m.active) await sleep(150);
    const pressShiftSpace = () => {
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      tip.beginInputTransactionForTests(host);
      const ev = (k, c, n) => new host.KeyboardEvent('', { key: k, code: c, keyCode: n });
      tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
      tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
      tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    };
    for (let i = 0; i < 4; i++) {
      const mine = await engineOfMine();
      if (mine && mine.audio && mine.audio.state === 'running') break;
      pressShiftSpace();
      await sleep(400);
      if (m.active && m.paused) { pressShiftSpace(); await sleep(400); }
    }
    const starts = [];
    const tRead = Date.now();
    let lastPos = -1;
    while (Date.now() - tRead < 30000) {
      const mine = await engineOfMine();
      const s = mine?.session;
      if (s && s.prefetch && s.position !== lastPos) {
        lastPos = s.position;
        starts.push({ position: s.position, from: s.prefetch.from, sentences: s.prefetch.sentences, requests: s.prefetch.requests, orderLen: s.prefetch.order.length, orderSorted: s.prefetch.order.slice().sort((a, b) => a - b), peak: s.prefetch.peak });
      }
      if (starts.length >= 3) break;
      await sleep(150);
    }
    out.starts = starts;
    const last = starts[starts.length - 1] || null;
    out.checks = {
      sentencesFive: last ? last.sentences === 5 : null,
      requestsTwo: last ? last.requests === 2 : null,
      orderFromSpan: last ? last.orderLen >= 1 && last.orderSorted.every((v, i) => v === last.from + i) : null,
    };

    try { await ir.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(400);
    try { const pc = reader.close(); if (pc && pc.then) await pc; } catch (_) {}
    out.managerLeft = 'tab closed';
    S.item8 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item8 = out;
    restoreAll();
    throw e;
  }
  restoreAll();
  return JSON.stringify(out, null, 1);
})();
