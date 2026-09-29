// Issue #82 item 4: the incoming speed waits while a player is open.
// Opens fixture A's player and pauses it, writes a newer 190 item, and syncs:
// the sync reports it deferred and nothing changes; waiting while paused never
// releases it; closing the popup lets the next sync apply it (pref 190, reader
// speed 1.9).
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL' };
  let prefWin = null, host = null;

  const auth = () => {
    const u = p.prefHasUserValue(prefix + 'webdav.username') ? p.getStringPref(prefix + 'webdav.username') : '';
    const w = p.prefHasUserValue(prefix + 'webdav.password') ? p.getStringPref(prefix + 'webdav.password') : '';
    if (!u) return {};
    const bytes = new TextEncoder().encode(u + ':' + w);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { Authorization: 'Basic ' + btoa(binary) };
  };
  const rawGetJson = async () => {
    const url = p.getStringPref(prefix + 'webdav.url').replace(/\/?$/, '/') + 'zotero-tts-shared-settings.json';
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, { method: 'GET', headers: { ...auth(), 'cache': 'no-store' } });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return JSON.parse(await r.text());
      } catch (e) { lastError = e; await sleep(400); }
    }
    throw new Error('the shared file did not read back as JSON: ' + String(lastError));
  };
  const rawPut = async text => {
    const r = await fetch(p.getStringPref(prefix + 'webdav.url').replace(/\/?$/, '/') + 'zotero-tts-shared-settings.json',
      { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: text });
    if (!r.ok) throw new Error('PUT shared file: HTTP ' + r.status);
  };

  try {
    // Open fixture A's player in its selected tab and pause it
    host = Services.wm.getMostRecentWindow('navigator:browser');
    if (!host) throw new Error('no main window');
    if (host.windowState === 2) host.restore();
    host.focus();
    await sleep(400);
    host.Zotero_Tabs.select(state.readerA.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === state.readerA.tabID, 8000, 100);
    const readerA = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === state.readerA.itemID);
    if (!readerA) throw new Error('reader A missing');
    readerA._iframeWindow?.focus?.();
    await sleep(300);
    if (!readerA._internalReader.popupOpen || !readerA._internalReader._readAloudManager?.active) {
      readerA._internalReader.toggleReadAloudPopup(true);
    }
    const managerA = await waitFor(() => {
      const m = readerA._internalReader._readAloudManager;
      return m && m.active ? m : null;
    }, 24000, 200);
    if (!managerA) throw new Error('the player did not start a session');
    try { managerA.pause(); } catch (e) { try { managerA.togglePaused(); } catch (e2) {} }
    await waitFor(() => managerA.active && managerA.paused, 8000, 100);
    out.player = { active: !!managerA.active, paused: !!managerA.paused };
    if (host.minimize) host.minimize();
    host = null;

    // Quiet transport, then craft the newer 190 item
    const quiet = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        return t.running === false && t.pendingChange === false && Date.now() - Number(t.lastAt ?? 0) > 1500 ? s : null;
      } catch (e) { return null; }
    }, 15000, 200);
    if (!quiet) throw new Error('the settings transport did not go quiet before the craft');
    await sleep(500);
    const doc = await rawGetJson();
    const items = (doc.items ?? []).filter(i => i.key !== 'readAloud.speedPercent');
    const craftedTs = Date.now() + 120000;
    items.push({ key: 'readAloud.speedPercent', value: 190, ts: craftedTs, by: 'tester' });
    doc.items = items;
    await rawPut(JSON.stringify(doc));
    await sleep(700);
    const verify = await rawGetJson();
    const verifyItem = (verify.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    if (!verifyItem || verifyItem.value !== 190 || verifyItem.ts !== craftedTs) throw new Error('the crafted 190 did not stick: ' + JSON.stringify(verifyItem));
    out.crafted = { value: 190, ts: craftedTs, by: 'tester' };

    // Trigger a sync by opening the settings pane: the item must be deferred
    prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (!prefWin) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !prefWin; i++) { await sleep(100); prefWin = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!prefWin) throw new Error('settings window did not open');
    try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    await waitFor(() => prefWin.document.getElementById('ztts-voices-status'), 10000, 100);

    const deferred = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        return t.lastTrigger === 'pane-open' && t.lastAt > Date.now() - 30000 && t.running === false
          && (t.lastOutcome === 'deferred' || (t.lastApplied?.deferred ?? 0) > 0) ? s : null;
      } catch (e) { return null; }
    }, 20000, 200);
    if (!deferred) throw new Error('the sync did not report the item deferred');
    out.deferredSync = {
      trigger: deferred.transport?.lastTrigger, outcome: deferred.transport?.lastOutcome,
      applied: deferred.transport?.lastApplied?.applied, deferred: deferred.transport?.lastApplied?.deferred,
      adopted: deferred.transport?.adopted, pushed: deferred.transport?.pushed, uploaded: deferred.transport?.uploaded,
    };

    const held = JSON.parse(await d.readAloudMemory());
    out.held = {
      speedPercent: held.speedPercent,
      readers: (held.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID)).map(r => ({ itemID: r.itemID, speed: r.speed, active: r.active, paused: r.paused })),
    };
    if (held.speedPercent !== 170 || out.held.readers.some(r => r.speed !== 1.7)) throw new Error('something applied while the player was open');

    // Pausing alone never releases it
    await sleep(3000);
    const still = JSON.parse(await d.readAloudMemory());
    const stillSync = JSON.parse(await d.settingsSync());
    out.pausedHold = {
      speedPercent: still.speedPercent,
      readerA: (still.readers ?? []).find(r => r.itemID === state.readerA.itemID)?.speed ?? null,
      active: (still.readers ?? []).find(r => r.itemID === state.readerA.itemID)?.active ?? null,
      paused: (still.readers ?? []).find(r => r.itemID === state.readerA.itemID)?.paused ?? null,
      deferredCount: stillSync.transport?.lastApplied?.deferred ?? null,
    };
    if (still.speedPercent !== 170) throw new Error('the pause alone released the item');

    // Close the popup: the next sync applies the held item. Match on the
    // pref itself — lastApplied can still hold the previous sync's report.
    readerA._internalReader.toggleReadAloudPopup(false);
    const applied = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        const memNow = JSON.parse(await d.readAloudMemory());
        return t.running === false && t.lastOutcome === 'ok' && memNow.speedPercent === 190 ? s : null;
      } catch (e) { return null; }
    }, 25000, 250);
    if (!applied) throw new Error('closing the player did not release the item');
    out.applySync = {
      trigger: applied.transport?.lastTrigger, outcome: applied.transport?.lastOutcome,
      applied: applied.transport?.lastApplied?.applied, from: applied.transport?.lastApplied?.from,
      deferred: applied.transport?.lastApplied?.deferred,
      pushed: applied.transport?.pushed, uploaded: applied.transport?.uploaded,
    };
    if (applied.transport?.lastTrigger !== 'player-close') throw new Error('the apply did not come from the player-close sync: ' + applied.transport?.lastTrigger);

    const after = JSON.parse(await d.readAloudMemory());
    out.after = {
      speedPercent: after.speedPercent,
      memorySpeed: after.memory?.speed ?? null,
      readerA: (after.readers ?? []).find(r => r.itemID === state.readerA.itemID)?.speed ?? null,
      readerB: (after.readers ?? []).find(r => r.itemID === state.readerB.itemID)?.speed ?? null,
      zoteroSpeeds: Object.fromEntries(Object.entries(after.zotero ?? {}).map(([k, v]) => [k, v.speed])),
    };
    const stampTs = (() => { try { return JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })();
    out.stampTs = stampTs;
    const fileDoc = await rawGetJson();
    const fileItem = (fileDoc.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    out.fileItem = fileItem;
    out.stampEqualsItemTs = stampTs === craftedTs;

    if (out.after.speedPercent !== 190 || out.after.memorySpeed !== 1.9) throw new Error('the pref/memory did not take 190');
    if (out.after.readerA !== 1.9) throw new Error('reader A did not take 1.9');
    if (!out.stampEqualsItemTs) throw new Error('the stamp is not the item ts');
    if (!fileItem || fileItem.value !== 190 || fileItem.by !== 'tester' || fileItem.ts !== craftedTs) throw new Error('the file item changed');

    try { prefWin.close(); } catch (e) {}
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000, 100);
    prefWin = null;
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (prefWin) prefWin.close(); } catch (e) {}
    try { if (host && host.minimize) host.minimize(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
