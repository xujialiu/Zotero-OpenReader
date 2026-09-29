// Issue #82 item 3: a speed from another computer arrives with no player open.
// Closes both fixture players (tabs stay open), writes a newer 170 item into the
// test shared file, triggers a sync by opening the settings pane, and expects
// pref 170, memory 1.7, both readers 1.7, every zotero.<lang>.speed 1.7, the
// stamp equal to the item's ts, nothing pushed back, and the voice browser's
// slider and status line reading 1.7×.
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

  // Raw shared-file access: Basic auth built here, never printed
  const K = n => prefix + n;
  const auth = () => {
    const u = p.prefHasUserValue(K('webdav.username')) ? p.getStringPref(K('webdav.username')) : '';
    const w = p.prefHasUserValue(K('webdav.password')) ? p.getStringPref(K('webdav.password')) : '';
    if (!u) return {};
    const bytes = new TextEncoder().encode(u + ':' + w);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { Authorization: 'Basic ' + btoa(binary) };
  };
  const fileUrl = () => p.getStringPref(K('webdav.url')).replace(/\/?$/, '/') + 'zotero-tts-shared-settings.json';
  // Tolerant read: the server answered one flaky body mid-run; retry until JSON
  const rawGet = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(fileUrl(), { method: 'GET', headers: { ...auth(), 'cache': 'no-store' } });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('GET shared file: HTTP ' + r.status);
        const text = await r.text();
        return JSON.parse(text) && text;
      } catch (e) { lastError = e; await sleep(400); }
    }
    throw new Error('the shared file did not read back as JSON: ' + String(lastError));
  };
  const rawPut = async text => {
    const r = await fetch(fileUrl(), { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: text });
    if (!r.ok) throw new Error('PUT shared file: HTTP ' + r.status);
  };

  try {
    // Close both fixture players; the tabs stay open. popupOpen reads false
    // through the wrapper, so the close is unconditional and the wait decides.
    for (const which of ['readerA', 'readerB']) {
      const entry = state[which];
      const reader = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === entry.itemID);
      if (reader) {
        try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {}
      }
    }
    const closed = await waitFor(() => {
      try {
        const mem = JSON.parse(Zotero.ZoteroTTS.diagnostics.readAloudMemory());
        return (mem.readers ?? []).every(r => ![state.readerA.itemID, state.readerB.itemID].includes(r.itemID) || !r.active);
      } catch (e) { return false; }
    }, 10000, 150);
    if (!closed) throw new Error('a fixture player is still open');
    out.playersClosed = true;

    // Write the newer 170 item — but only once the transport is quiet: a sync
    // in flight across the PUT would read a partial file and heal it back
    // (settings-sync-transport.ts treats a malformed download as absent)
    const quiet = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        return t.running === false && t.pendingChange === false && Date.now() - Number(t.lastAt ?? 0) > 1500 ? s : null;
      } catch (e) { return null; }
    }, 15000, 200);
    if (!quiet) throw new Error('the settings transport did not go quiet before the craft');
    await sleep(500);

    const raw = await rawGet();
    if (raw === null) throw new Error('the shared file is missing');
    const doc = JSON.parse(raw);
    const items = (doc.items ?? []).filter(i => i.key !== 'readAloud.speedPercent');
    const craftedTs = Date.now() + 120000;
    items.push({ key: 'readAloud.speedPercent', value: 170, ts: craftedTs, by: 'tester' });
    doc.items = items;
    await rawPut(JSON.stringify(doc));
    // Prove the server holds what was written before any sync looks at it
    await sleep(700);
    const verify = await rawGet();
    const verifyItem = verify === null ? null : (JSON.parse(verify).items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    if (!verifyItem || verifyItem.value !== 170 || verifyItem.ts !== craftedTs || verifyItem.by !== 'tester') {
      await rawPut(JSON.stringify(doc));
      await sleep(700);
      const again = await rawGet();
      const againItem = again === null ? null : (JSON.parse(again).items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
      if (!againItem || againItem.value !== 170) throw new Error('the crafted item did not stick on the server');
    }
    out.crafted = { key: 'readAloud.speedPercent', value: 170, ts: craftedTs, by: 'tester', otherItems: items.length - 1 };

    // Trigger a sync by opening the settings pane
    prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (!prefWin) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !prefWin; i++) { await sleep(100); prefWin = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!prefWin) throw new Error('settings window did not open');
    try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    await waitFor(() => prefWin.document.getElementById('ztts-voices-status'), 10000, 100);

    const adopted = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        return t.lastTrigger === 'pane-open' && t.lastAt > Date.now() - 30000 && t.running === false
          && ((t.lastApplied?.applied ?? []).includes('readAloud.speedPercent')) ? s : null;
      } catch (e) { return null; }
    }, 20000, 200);
    if (!adopted) throw new Error('the pane-open sync did not adopt readAloud.speedPercent');
    out.sync = {
      trigger: adopted.transport?.lastTrigger, outcome: adopted.transport?.lastOutcome,
      adopted: adopted.transport?.adopted, pushed: adopted.transport?.pushed, uploaded: adopted.transport?.uploaded,
      applied: adopted.transport?.lastApplied?.applied, from: adopted.transport?.lastApplied?.from,
      deferred: adopted.transport?.lastApplied?.deferred,
    };

    // The applied state
    const mem = JSON.parse(await d.readAloudMemory());
    out.applied = {
      speedPercent: mem.speedPercent,
      memorySpeed: mem.memory?.speed ?? null,
      readers: (mem.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID))
        .map(r => ({ itemID: r.itemID, speed: r.speed, active: r.active })),
      zoteroSpeeds: Object.fromEntries(Object.entries(mem.zotero ?? {}).map(([k, v]) => [k, v.speed])),
      allLangs170: Object.values(mem.zotero ?? {}).every(v => v.speed === 1.7),
    };
    const stampTs = (() => { try { return JSON.parse(p.getStringPref(K('webdav.syncState'))).stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })();
    out.stampTs = stampTs;
    out.stampEqualsItemTs = stampTs === craftedTs;

    // Nothing pushed back: the file's item is exactly the crafted one
    const after = JSON.parse(await rawGet());
    const afterItem = (JSON.parse(after).items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    out.fileAfter = afterItem;
    out.fileUnchanged = !!afterItem && afterItem.value === 170 && afterItem.ts === craftedTs && afterItem.by === 'tester';

    // The voice browser: slider label and status line
    const sliderValue = await waitFor(() => {
      const el = prefWin.document.getElementById('ztts-voices-speed-value');
      return el && el.textContent === '1.7×' ? el.textContent : null;
    }, 10000, 150);
    const statusEl = prefWin.document.getElementById('ztts-voices-status');
    const status = statusEl ? statusEl.textContent : null;
    out.voiceBrowser = { sliderValue, status, statusEndsWithGlobalSpeed: !!status && status.endsWith('Global speed: 1.7×') };
    const slider = prefWin.document.getElementById('ztts-voices-speed');
    out.sliderPosition = slider ? slider.value : null;

    if (mem.speedPercent !== 170 || mem.memory?.speed !== 1.7) throw new Error('the pref/memory did not adopt 170/1.7');
    if (!out.applied.readers.length || out.applied.readers.some(r => r.speed !== 1.7)) throw new Error('a reader speed did not follow');
    if (!out.applied.allLangs170) throw new Error('a zotero.<lang>.speed did not follow');
    if (!out.stampEqualsItemTs) throw new Error('the stamp is not the item ts');
    if (out.sync.pushed !== 0 || out.sync.uploaded !== false) throw new Error('the adoption pushed back');
    if (!out.fileUnchanged) throw new Error('the file changed');
    if (!out.voiceBrowser.sliderValue || !out.voiceBrowser.statusEndsWithGlobalSpeed) throw new Error('the voice browser did not read 1.7×');

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
