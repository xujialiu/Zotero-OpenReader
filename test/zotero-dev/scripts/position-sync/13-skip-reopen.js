// 6.15 (issue #206): with narration paused and no other reader speaking, a
// real backward skip becomes the held position with a newer stamp and stays
// stable; closing the idle duplicate does not freeze the survivor (it still
// records); and a freshly reopened reader records normally. Also completes
// 6.14(b)'s stored==final-segment check off reader A's live segment list.
// Every sourcePosition is cloned out of the reader compartment immediately.
(async () => {
  const out = { step: 'skip-reopen-6.15', steps: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const FIX = state.fixture;
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const set = (k, v) => Zotero.Prefs.set(full(k), v, true);
  const authFetch = async (name) => {
    const bytes = new TextEncoder().encode(String(get('webdav.username') || '') + ':' + String(get('webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return fetch(String(get('webdav.url') || '').trim().replace(/\/+$/, '') + '/' + name, { headers: { Authorization: 'Basic ' + btoa(binary) }, cache: 'no-store' });
  };
  const clone = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const storedOf = async () => {
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (position.readers ?? []).find((x) => x.itemID === FIX.itemID);
    return row?.stored ?? null;
  };
  const segSp = (reader, i) => {
    const segs = reader._internalReader?._readAloudSegments?.segments;
    if (!segs || typeof segs.length !== 'number' || i >= segs.length) return null;
    return clone(segs[i]?.sourcePosition ?? null);
  };
  try {
    const win = Zotero.getMainWindow();
    const readerA = (Zotero.Reader._readers ?? []).find((r) => r.tabID === state.readerA.tabID);
    const readerC = (Zotero.Reader._readers ?? []).find((r) => r.tabID === state.readerC.tabID);
    if (!readerA || !readerC) throw new Error('A/C missing');

    // 6.14(b) completion: stored == B's final sentence, read off A's list.
    const segFinal = segSp(readerA, state.finalB.pos);
    const stored0 = await storedOf();
    out.sixFourBStoredMatches = JSON.stringify(stored0 ?? null) === JSON.stringify(segFinal ?? null);

    // A pause-skip back one sentence: held moves back with a NEWER stamp.
    const before = await authFetch('zotero-tts-positions.json');
    const entryBefore = ((JSON.parse(await before.text()).items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key)) ?? null;
    out.tsBefore = entryBefore?.ts ?? null;
    readerA._internalReader._readAloudManager.skipBack('sentence');
    await Zotero.Promise.delay(900);
    const stored1 = await storedOf();
    const seg17 = segSp(readerA, state.finalB.pos - 5); // A's own position is finalB.pos-4; read it live below
    out.storedAfterSkipTail = JSON.stringify(stored1 ?? null).slice(-40);
    out.backwardSkipRecorded = JSON.stringify(stored1 ?? null) !== JSON.stringify(stored0 ?? null);
    await Zotero.Promise.delay(1600);
    const stored1b = await storedOf();
    out.skipStable = JSON.stringify(stored1b ?? null) === JSON.stringify(stored1 ?? null);

    // Close the idle duplicate C; the survivor must still record.
    win.Zotero_Tabs.close(state.readerC.tabID);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && (Zotero.Reader._readers ?? []).some((r) => r.tabID === state.readerC.tabID)) await Zotero.Promise.delay(250);
    out.Cclosed = !(Zotero.Reader._readers ?? []).some((r) => r.tabID === state.readerC.tabID);
    await Zotero.Promise.delay(900);
    readerA._internalReader._readAloudManager.skipBack('sentence');
    await Zotero.Promise.delay(900);
    const stored2 = await storedOf();
    out.survivorStillRecords = JSON.stringify(stored2 ?? null) !== JSON.stringify(stored1 ?? null);
    out.survivorTail = JSON.stringify(stored2 ?? null).slice(-40);

    // Upload via a switch poke, then the file must hold the survivor's
    // position with a ts newer than the close capture's.
    set('webdav.syncPositions', false);
    await Zotero.Promise.delay(400);
    set('webdav.syncPositions', true);
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      await Zotero.Promise.delay(400);
      const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      if (!sync.transport?.running && !sync.shared?.transport?.running) break;
    }
    const g1 = await authFetch('zotero-tts-positions.json');
    const entryAfter = ((JSON.parse(await g1.text()).items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key)) ?? null;
    out.tsAfter = entryAfter?.ts ?? null;
    out.newerStamp = typeof out.tsAfter === 'number' && typeof out.tsBefore === 'number' && out.tsAfter > out.tsBefore;
    out.fileMatchesSurvivor = JSON.stringify(entryAfter?.pos ?? null) === JSON.stringify(stored2 ?? null);

    // Reopen: close A's tab, open a fresh reader, verify it records normally.
    win.Zotero_Tabs.close(state.readerA.tabID);
    const t2 = Date.now();
    while (Date.now() - t2 < 8000 && (Zotero.Reader._readers ?? []).some((r) => r.tabID === state.readerA.tabID)) await Zotero.Promise.delay(250);
    out.Aclosed = !(Zotero.Reader._readers ?? []).some((r) => r.tabID === state.readerA.tabID);
    await Zotero.Promise.delay(1200);
    const item = Zotero.Items.get(FIX.itemID);
    const readerR = await Zotero.Reader.open(FIX.itemID, null, { title: item.getField('title') + ' (R)' });
    const t3 = Date.now();
    while (Date.now() - t3 < 24000 && !readerR?._internalReader?._readAloudManager) await Zotero.Promise.delay(500);
    out.Rready = !!readerR?._internalReader?._readAloudManager;
    state.readerR = { tabID: readerR.tabID, itemID: FIX.itemID };
    win.Zotero_Tabs.select(readerR.tabID, false);
    readerR._iframeWindow?.document?.notifyUserGestureActivation?.();
    readerR._internalReader.toggleReadAloudPopup(true);
    const t4 = Date.now();
    while (Date.now() - t4 < 12000 && !readerR._internalReader?._readAloudManager?.active) await Zotero.Promise.delay(300);
    out.Rsession = { active: !!readerR._internalReader?._readAloudManager?.active };
    await Zotero.Promise.delay(1200);
    readerR._internalReader._readAloudManager.skipAhead('sentence');
    await Zotero.Promise.delay(1000);
    const stored3 = await storedOf();
    const segR = segSp(readerR, (JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers ?? [])[(Zotero.Reader._readers ?? []).map((r) => r.tabID).indexOf(readerR.tabID)]?.session?.position ?? 0);
    out.reopenRecorded = JSON.stringify(stored3 ?? null) !== JSON.stringify(stored2 ?? null);
    out.reopenMatchesR = JSON.stringify(stored3 ?? null) === JSON.stringify(segR ?? null);
    out.ok = out.sixFourBStoredMatches && out.backwardSkipRecorded && out.skipStable && out.Cclosed
      && out.survivorStillRecords && out.newerStamp && out.fileMatchesSurvivor && out.Aclosed && out.Rready
      && out.Rsession.active && out.reopenRecorded && out.reopenMatchesR;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
