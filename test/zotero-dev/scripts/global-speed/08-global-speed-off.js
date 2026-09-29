// Issue #82 item 6: "Use one speed everywhere" off. With no player open, turn
// the switch off, write a newer 210 item, and sync: the pref and the pane's
// slider follow to 2.1×, no reader's speed and no zotero.<lang>.speed changes.
// The switch is restored (on) before the script ends.
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
  let prefWin = null;

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
    // No player open
    const mem0 = JSON.parse(await d.readAloudMemory());
    if ((mem0.readers ?? []).some(r => r.active)) throw new Error('a player is still open');

    // Switch off (baseline: true)
    p.setBoolPref(prefix + 'readAloud.globalSpeed', false);
    out.switchOff = true;

    // Quiet transport, then craft the newer 210 item
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
    items.push({ key: 'readAloud.speedPercent', value: 210, ts: craftedTs, by: 'tester' });
    doc.items = items;
    await rawPut(JSON.stringify(doc));
    await sleep(700);
    const verify = await rawGetJson();
    const verifyItem = (verify.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    if (!verifyItem || verifyItem.value !== 210) throw new Error('the crafted 210 did not stick');
    out.crafted = { value: 210, ts: craftedTs, by: 'tester' };

    // Trigger a sync by opening the settings pane; the pref follows to 210
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
        const mem = JSON.parse(await d.readAloudMemory());
        if (mem.speedPercent !== 210) return null;
        return JSON.parse(await d.settingsSync());
      } catch (e) { return null; }
    }, 20000, 200);
    if (!adopted) throw new Error('the pref did not adopt 210');
    out.sync = {
      trigger: adopted.transport?.lastTrigger, outcome: adopted.transport?.lastOutcome,
      adopted: adopted.transport?.adopted, pushed: adopted.transport?.pushed, uploaded: adopted.transport?.uploaded,
      applied: adopted.transport?.lastApplied?.applied, deferred: adopted.transport?.lastApplied?.deferred,
    };

    const mem = JSON.parse(await d.readAloudMemory());
    out.withSwitchOff = {
      speedPercent: mem.speedPercent, memorySpeed: mem.memory?.speed ?? null,
      readers: (mem.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID)).map(r => ({ itemID: r.itemID, speed: r.speed })),
      zoteroSpeeds: Object.fromEntries(Object.entries(mem.zotero ?? {}).map(([k, v]) => [k, v.speed])),
      langsAllStill19: Object.values(mem.zotero ?? {}).every(v => v.speed === 1.9),
      readersAllStill19: (mem.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID)).every(r => r.speed === 1.9),
    };

    // The pane's slider follows
    const sliderValue = await waitFor(() => {
      const el = prefWin.document.getElementById('ztts-voices-speed-value');
      return el && el.textContent === '2.1×' ? el.textContent : null;
    }, 10000, 150);
    const slider = prefWin.document.getElementById('ztts-voices-speed');
    out.slider = { value: sliderValue, position: slider ? slider.value : null };
    out.stampTs = (() => { try { return JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })();

    // Restore the switch, and prove the flip itself spreads nothing
    p.setBoolPref(prefix + 'readAloud.globalSpeed', true);
    await sleep(1200);
    const memAfter = JSON.parse(await d.readAloudMemory());
    out.afterSwitchOn = {
      globalSpeed: p.getBoolPref(prefix + 'readAloud.globalSpeed'),
      speedPercent: memAfter.speedPercent,
      readersStill19: (memAfter.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID)).every(r => r.speed === 1.9),
      langsStill19: Object.values(memAfter.zotero ?? {}).every(v => v.speed === 1.9),
    };

    const checks = {
      pref210memory21: mem.speedPercent === 210 && mem.memory?.speed === 2.1,
      readersUnchanged: out.withSwitchOff.readersAllStill19,
      langsUnchanged: out.withSwitchOff.langsAllStill19,
      adopted: (out.sync.adopted ?? 0) >= 1 && out.sync.pushed === 0 && out.sync.uploaded === false,
      stampMatches: out.stampTs === craftedTs,
      slider21: out.slider.value === '2.1×',
      switchRestored: out.afterSwitchOn.globalSpeed === true,
      noLateSpread: out.afterSwitchOn.readersStill19 && out.afterSwitchOn.langsStill19,
    };
    out.checks = checks;
    if (!checks.pref210memory21) throw new Error('the pref/memory did not take 210/2.1');
    if (!checks.readersUnchanged || !checks.langsUnchanged) throw new Error('the spread ran while the switch was off');
    if (!checks.adopted) throw new Error('the sync did not simply adopt');
    if (!checks.stampMatches) throw new Error('the stamp is not the item ts');
    if (!checks.slider21) throw new Error('the slider did not read 2.1×');
    if (!checks.switchRestored || !checks.noLateSpread) throw new Error('the switch restore or the late-spread check failed');

    try { prefWin.close(); } catch (e) {}
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000, 100);
    prefWin = null;
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { p.setBoolPref(prefix + 'readAloud.globalSpeed', true); } catch (e) {}
    try { if (prefWin) prefWin.close(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
