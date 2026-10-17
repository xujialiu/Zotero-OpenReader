// Item 6.22 (issue #184), second half: a local change of fishspeech.headers is
// stamped but never travels — the next change sync reports pushed 0 and no
// fishspeech.* item of this machine's appears in sharedSettings() (the file's
// crafted tester items from 10- are the only fishspeech.* entries while this
// item runs; the file's older machine-written fishspeech.headers item, pushed
// before the item started while the Address was public, predates the stamp).
// Then the Fish Speech prefs are restored to the opener's snapshot, the
// crafted items are removed from the file, and the restore's own change sync
// is waited out. State: reads S.item622 / S.isolate.
(async () => {
  const out = { step: 'item-6.22-headers-push' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 25000, stepMs = 250) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
  const machine = JSON.parse(await diagnostics.settingsSync()).machine;
  try {
    const quiet = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      return s.transport && s.transport.running === false && s.transport.pendingChange === false;
    });
    if (!quiet) throw new Error('transport did not go quiet');

    // --- The local headers change. ---
    const headersBefore = p.getStringPref(prefix + 'fishspeech.headers');
    const syncsBefore = JSON.parse(await diagnostics.settingsSync()).transport.syncs;
    p.setStringPref(prefix + 'fishspeech.headers', '{"X-Test":"tester"}');
    const stateKey = prefix + 'webdav.syncState';
    const stampNow = JSON.parse(p.getStringPref(stateKey)).stamps['fishspeech.headers'];
    out.stamp = { headers: stampNow, atChange: Date.now() };
    out.stampMoved = typeof stampNow === 'number' && stampNow > out.stamp.atChange - 15000;

    // --- The quiet-period change sync. ---
    const done = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore && t.running === false && t.lastTrigger === 'change';
    }, 25000, 250);
    const after = JSON.parse(await diagnostics.settingsSync());
    out.changeSync = { waited: !!done, lastOutcome: after.transport.lastOutcome, pushed: after.transport.pushed, uploaded: after.transport.uploaded, lastError: after.transport.lastError };

    // --- The shared file's fishspeech items. ---
    const shared = JSON.parse(await diagnostics.sharedSettings());
    const fishItems = shared.items.filter((i) => i.key.startsWith('fishspeech.'));
    out.fishspeechItemsInFile = fishItems.map((i) => ({ key: i.key, ts: i.ts, by: i.by, value: typeof i.value === 'string' && i.value.startsWith('<') ? i.value : i.value }));
    out.noMachineItemAtOrAfterStamp = !fishItems.some((i) => i.by === machine && i.ts >= stampNow);
    out.headersValueNotInFile = !JSON.stringify(shared.items).includes('X-Test');

    // --- Restore the Fish Speech prefs to the opener's snapshot. ---
    const baseline = S.isolate && S.isolate.baseline;
    if (!baseline) throw new Error('no isolate baseline in state');
    p.setStringPref(prefix + 'fishspeech.headers', baseline['fishspeech.headers'].value);
    p.setStringPref(prefix + 'fishspeech.baseURL', baseline['fishspeech.baseURL'].value);
    out.restored = {
      headersEqualsSnapshot: p.getStringPref(prefix + 'fishspeech.headers') === baseline['fishspeech.headers'].value,
      baseURL: p.getStringPref(prefix + 'fishspeech.baseURL'),
      baseURLChars: p.getStringPref(prefix + 'fishspeech.baseURL').length,
      enabled: p.getBoolPref(prefix + 'fishspeech.enabled'),
    };

    // --- Remove the crafted items from the file. ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    const getResp = await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } });
    if (!getResp.ok) throw new Error(`file GET ${getResp.status}`);
    const doc = JSON.parse(await getResp.text());
    doc.items = doc.items.filter((i) => !((i.key === 'fishspeech.baseURL' || i.key === 'fishspeech.enabled') && i.by === 'tester'));
    const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    if (!putResp.ok) throw new Error(`file PUT ${putResp.status}`);
    const verify = await (await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } })).text();
    out.craftedRemoved = !JSON.parse(verify).items.some((i) => (i.key === 'fishspeech.baseURL' || i.key === 'fishspeech.enabled') && i.by === 'tester');

    // --- The restores' own change sync (held section: pushed 0). ---
    const done2 = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > after.transport.syncs && t.running === false && t.lastTrigger === 'change' && t.pendingChange === false;
    }, 25000, 250);
    const final = JSON.parse(await diagnostics.settingsSync());
    out.restoreSync = { waited: !!done2, lastOutcome: final.transport.lastOutcome, pushed: final.transport.pushed, uploaded: final.transport.uploaded };
    out.status = out.stampMoved && out.changeSync.pushed === 0 && out.changeSync.uploaded === false
      && out.noMachineItemAtOrAfterStamp && out.restored.headersEqualsSnapshot && out.craftedRemoved ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
