// Case item 2: a change applies from the next sentence. While reading at the
// defaults (5 and 2), set *Prefetch ... sentences ahead* to 10 IN THE PANE
// (the unbound field's change listener writes the pref). At the next
// sentence's start session.prefetch.sentences is 10 and order has 10 indices,
// with no stop and no restart (stats.started unchanged). The pref is cleared
// again at the end (the baseline snapshot holds the no-user-value state).
// params: none. state: reads fixtures; writes item2.
(async () => {
  const out = { step: 'item2-pane-change-mid-read' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = k => 'extensions.zotero.zotero-tts.' + k;
  let win = null;
  try {
    const title = 'ztts 166 pane A ' + new Date().toISOString().slice(0, 16);
    const item = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/orca/workspaces/Zotero-TTS/issue_162/test/fixtures/fixture-a.pdf',
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    out.itemID = item.id;
    S.fixtures.push({ key: 'a-2', itemID: item.id, title });

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

    // Wait until the reading is past its second sentence start.
    const tWait = Date.now();
    let posAtChange = null;
    while (Date.now() - tWait < 45000) {
      const mine = await engineOfMine();
      if (mine && mine.session && mine.session.position >= 2) { posAtChange = mine.session.position; break; }
      await sleep(200);
    }
    if (posAtChange === null) throw new Error('reading never reached position 2');
    const statsBefore = (await engineOfMine())?.stats ?? null;
    const prefBefore = Services.prefs.getIntPref(P('readAloud.prefetchSentences'));
    out.atChange = { position: posAtChange, prefBefore, statsBefore: statsBefore?.started };

    // The pane: a stray settings window keeps the OLD pane after a reinstall.
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
    const field = win.document.getElementById('ztts-prefetch-sentences');
    if (!field) throw new Error('ztts-prefetch-sentences not found in the pane');
    out.fieldShownBefore = String(field.value);
    field.value = '10';
    field.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(300);
    out.fieldShownAfter = String(field.value);
    out.prefAfterPaneWrite = Services.prefs.getIntPref(P('readAloud.prefetchSentences'));
    win.close();
    const tCC = Date.now();
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tCC < 5000) await sleep(100);
    win = null;

    // The next start must read sentences 10 with a 10-wide order.
    const starts = [];
    const tRead = Date.now();
    let lastPos = posAtChange;
    let startedAfter = null;
    while (Date.now() - tRead < 45000) {
      const mine = await engineOfMine();
      if (mine && mine.session) {
        startedAfter = mine.stats?.started ?? null;
        const pf = mine.session.prefetch;
        if (mine.session.position !== lastPos) {
          lastPos = mine.session.position;
          starts.push({
            position: mine.session.position,
            sentences: pf?.sentences ?? null,
            requests: pf?.requests ?? null,
            orderLen: pf ? pf.order.length : null,
            from: pf?.from ?? null,
          });
        }
      }
      if (starts.length >= 2 && starts[0].sentences === 10) break;
      await sleep(150);
    }
    out.startsAfterChange = starts;
    out.statsAfter = startedAfter;
    out.startedUnchanged = startedAfter === statsBefore?.started;
    out.firstStartAfterReads10 = starts.length > 0 && starts[0].sentences === 10 && starts[0].orderLen === 10;

    // Restore: the pref had no user value at baseline.
    Services.prefs.clearUserPref(P('readAloud.prefetchSentences'));
    out.prefCleared = !Services.prefs.prefHasUserValue(P('readAloud.prefetchSentences'));

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

    S.item2 = out;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    try { if (win) win.close(); } catch (_) {}
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
