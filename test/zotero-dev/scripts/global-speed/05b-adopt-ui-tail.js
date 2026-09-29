// Issue #82 item 3, tail: the file-unchanged and voice-browser checks that the
// adoption run (05) captured in its result but could not finish after a flaky
// server read. Expects the crafted item intact (by tester, 170, ts = the stamp,
// which 05 recorded as 1790666303645), and the voice browser reading 1.7×.
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
  const params = Zotero.ZoteroTTSRun.params;
  const craftedTs = Number(params.item3Ts ?? 0);
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
  // Tolerant read: the server answered one flaky body mid-run; retry until JSON
  const rawGetJson = async () => {
    const url = p.getStringPref(prefix + 'webdav.url').replace(/\/?$/, '/') + 'zotero-tts-shared-settings.json';
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, { method: 'GET', headers: { ...auth(), 'cache': 'no-store' } });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const text = await r.text();
        return JSON.parse(text);
      } catch (e) { lastError = e; await sleep(400); }
    }
    throw new Error('the shared file did not read back as JSON: ' + String(lastError));
  };

  try {
    // The file still holds exactly the crafted item; the stamp equals its ts
    const doc = await rawGetJson();
    const item = doc === null ? null : (doc.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    const stampTs = (() => { try { return JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })();
    out.file = { item, stampTs, craftedTs };
    out.fileUnchanged = !!item && item.value === 170 && item.by === 'tester' && item.ts === craftedTs;
    out.stampEqualsItemTs = stampTs === craftedTs;
    if (!out.fileUnchanged) throw new Error('the crafted item did not survive: ' + JSON.stringify(item));
    if (!out.stampEqualsItemTs) throw new Error('the stamp moved off the crafted ts');

    // The live state still reads 170 / 1.7
    const mem = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readAloudMemory());
    out.live = { speedPercent: mem.speedPercent, memorySpeed: mem.memory?.speed ?? null };

    // The voice browser: slider label and status line
    prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (!prefWin) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !prefWin; i++) { await sleep(100); prefWin = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!prefWin) throw new Error('settings window did not open');
    try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    await waitFor(() => prefWin.document.getElementById('ztts-voices-status'), 10000, 100);
    const sliderValue = await waitFor(() => {
      const el = prefWin.document.getElementById('ztts-voices-speed-value');
      return el && el.textContent === '1.7×' ? el.textContent : null;
    }, 10000, 150);
    const statusEl = prefWin.document.getElementById('ztts-voices-status');
    // The listing is a network call: wait for the line to leave 'Listing voices…'
    const settled = await waitFor(() => {
      const text = statusEl ? statusEl.textContent : null;
      return text && text !== 'Listing voices…' ? text : null;
    }, 30000, 250);
    const status = statusEl ? statusEl.textContent : null;
    const slider = prefWin.document.getElementById('ztts-voices-speed');
    out.voiceBrowser = {
      sliderValue, sliderPosition: slider ? slider.value : null,
      status, statusEndsWithGlobalSpeed: !!status && status.endsWith('Global speed: 1.7×'),
    };

    try { prefWin.close(); } catch (e) {}
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000, 100);
    prefWin = null;

    if (!out.voiceBrowser.sliderValue || !out.voiceBrowser.statusEndsWithGlobalSpeed) throw new Error('the voice browser did not read 1.7×');
    if (out.live.speedPercent !== 170 || out.live.memorySpeed !== 1.7) throw new Error('the live state moved off 170/1.7');
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (prefWin) prefWin.close(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
