// Item 6.23 (issue #192), phase 1 — the hold, per item 3.20's recipe. The
// profile had azure.enabled false (configured key, disabled): the recipe needs
// an enabled provider, so azure.enabled is written true first (a pref write —
// no check runs) and its quiet-period sync makes the file's azure.enabled item
// true at a ts equal to this machine's stamp (the resting state 3.20 asks for).
// Then azure.apiKey "not-a-key" is crafted at Date.now()+1000 by "tester" (the
// file's azure.enabled item left at its stamp), a switch-on trigger applies
// both, the check fails, azure.enabled goes false here only, and
// state.held.azure carries the check's message. The real key was kept in
// state.realAzureKey by the opener. State: S.item623.
(async () => {
  const out = { step: 'item-6.23-hold-azure' };
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
  try {
    if (!S.realAzureKey) throw new Error('no real Azure key in state (opener did not run)');
    const settings = JSON.parse(await diagnostics.settingsSync());
    if (settings.transport.running || settings.transport.pendingChange) throw new Error('transport not quiet at item start');

    // --- Enable Azure here (pref write, no check), wait its change sync out. ---
    const syncsBefore = settings.transport.syncs;
    p.setBoolPref(prefix + 'azure.enabled', true);
    const enabled = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore && t.running === false && t.lastTrigger === 'change' && t.pendingChange === false;
    }, 25000, 250);
    const enabledStats = JSON.parse(await diagnostics.settingsSync()).transport;
    const stampEnabled = JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps['azure.enabled'];
    out.enabledStep = { waited: !!enabled, pushed: enabledStats.pushed, uploaded: enabledStats.uploaded, stampEnabled, prefNow: p.getBoolPref(prefix + 'azure.enabled') };

    // --- The file's azure.enabled item must now sit at the machine's stamp. ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    const doc = JSON.parse(await (await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } })).text());
    const fileEnabled = doc.items.find((i) => i.key === 'azure.enabled');
    out.fileEnabledItem = fileEnabled ? { value: fileEnabled.value, ts: fileEnabled.ts, by: fileEnabled.by } : null;
    out.restingState = !!fileEnabled && fileEnabled.value === true && fileEnabled.ts === stampEnabled;
    if (!out.restingState) throw new Error('file azure.enabled is not true at the machine stamp');

    // --- Craft the bad key, newer; azure.enabled item untouched. ---
    const badTs = Date.now() + 1000;
    doc.items = doc.items.filter((i) => i.key !== 'azure.apiKey');
    doc.items.push({ key: 'azure.apiKey', value: 'not-a-key', ts: badTs, by: 'tester' });
    doc.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    if (!putResp.ok) throw new Error(`file PUT ${putResp.status}`);
    out.crafted = { key: 'azure.apiKey', value: 'not-a-key', ts: badTs, by: 'tester' };

    // --- The trigger. ---
    const syncsBefore2 = JSON.parse(await diagnostics.settingsSync()).transport.syncs;
    p.setBoolPref(prefix + 'webdav.syncSettings', false);
    p.setBoolPref(prefix + 'webdav.syncSettings', true);
    const held = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore2 && t.running === false && t.lastTrigger === 'switch-on'
        && s.state && s.state.held && s.state.held.azure;
    }, 25000, 250);
    const after = JSON.parse(await diagnostics.settingsSync());
    const t = after.transport;
    const stateNow = JSON.parse(p.getStringPref(prefix + 'webdav.syncState'));
    out.hold = {
      waited: !!held, lastTrigger: t.lastTrigger, lastOutcome: t.lastOutcome,
      adopted: t.adopted, pushed: t.pushed, uploaded: t.uploaded,
      applied: t.lastApplied && t.lastApplied.applied,
      azureEnabledPref: p.getBoolPref(prefix + 'azure.enabled'),
      heldAzure: stateNow.held.azure || null,
      stampEnabledAfter: stateNow.stamps['azure.enabled'],
      stampEnabledEqualsFileTs: stateNow.stamps['azure.enabled'] === fileEnabled.ts,
    };
    out.heldAzureReasonHas401 = !!(stateNow.held.azure && /401/.test(stateNow.held.azure.reason));

    // --- The file must still carry azure.enabled true. ---
    const shared = JSON.parse(await diagnostics.sharedSettings());
    const fileEnabledAfter = shared.items.find((i) => i.key === 'azure.enabled');
    out.fileEnabledAfter = fileEnabledAfter || null;
    out.status = out.hold.adopted === 1 && out.hold.pushed === 0 && out.hold.uploaded === false
      && out.hold.azureEnabledPref === false && out.hold.stampEnabledEqualsFileTs
      && out.heldAzureReasonHas401 && out.fileEnabledAfter && out.fileEnabledAfter.value === true ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
