// Item 6.24 (issue #193): a held provider is named as the Player names it.
// Keeps webdav.syncState first, writes held records for openai-official,
// compatible and zotero-premium (each { ts: Date.now(), reason: "tester" }),
// opens Settings → OpenReader and reads the Sync group's settings line: it
// must name them "OpenAI", "OpenAI Compatible", "Zotero Premium" and contain
// none of the three ids. Then the kept webdav.syncState is written back
// byte-exact and confirmed. (The held.zotero-standard witness planted by item
// 6.22 is still in the state and may show in the line; it is not part of this
// item.) State: S.item624.
(async () => {
  const out = { step: 'item-6.24-held-line-names' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 25000, stepMs = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  try {
    const stateKey = prefix + 'webdav.syncState';
    const kept = p.getStringPref(stateKey);
    S.item624 = { keptChars: kept.length };

    // --- The three held records, the rest of the state as it was. ---
    const raw = JSON.parse(kept);
    raw.held = raw.held || {};
    for (const id of ['openai-official', 'compatible', 'zotero-premium']) raw.held[id] = { ts: Date.now(), reason: 'tester' };
    p.setStringPref(stateKey, JSON.stringify(raw));
    out.heldWritten = Object.keys(JSON.parse(p.getStringPref(stateKey)).held).sort();

    // --- Settings → OpenReader. ---
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const winReady = await waitFor(() => {
      const win = Services.wm.getMostRecentWindow('zotero:pref');
      return !!(win && win.Zotero_Preferences && win.document.getElementById('ztts-sync-settings-status'));
    }, 20000, 200);
    if (!winReady) throw new Error('the OpenReader pane did not come up');
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    out.paneOpen = true;

    // The pane-open sync settles first, so the line is the settled form.
    await waitFor(async () => {
      const t = JSON.parse(await diagnostics.settingsSync()).transport;
      return t.running === false && t.pendingChange === false;
    }, 20000, 200);
    await sleep(600);
    const line = win.document.getElementById('ztts-sync-settings-status').textContent;
    out.line = line;
    out.named = {
      openai: line.includes('OpenAI stays off on this computer: tester'),
      compatible: line.includes('OpenAI Compatible stays off on this computer: tester'),
      zoteroPremium: line.includes('Zotero Premium stays off on this computer: tester'),
    };
    out.rawIdsAbsent = {
      'openai-official': !line.includes('openai-official'),
      compatible: !line.includes('compatible'),
      'zotero-premium': !line.includes('zotero-premium'),
    };

    // --- The kept webdav.syncState back, byte-exact. ---
    win.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 10000, 200);
    p.setStringPref(stateKey, kept);
    out.restored = {
      byteIdentical: p.getStringPref(stateKey) === kept,
      heldNow: Object.keys(JSON.parse(p.getStringPref(stateKey)).held).sort(),
    };
    out.windowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    out.status = out.named.openai && out.named.compatible && out.named.zoteroPremium
      && out.rawIdsAbsent['openai-official'] && out.rawIdsAbsent.compatible && out.rawIdsAbsent['zotero-premium']
      && out.restored.byteIdentical && out.windowClosed ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    try { const w = Services.wm.getMostRecentWindow('zotero:pref'); if (w) w.close(); } catch (_) {}
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
