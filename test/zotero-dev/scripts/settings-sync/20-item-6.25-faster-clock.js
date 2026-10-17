// Item 6.25 (issue #205): a change made right after an adoption from a faster
// clock is kept. Crafts readAloud.volume 120 at Date.now()+60000 by "tester"
// (a computer a minute ahead), fires a switch-on trigger: the item is adopted,
// state.stamps["readAloud.volume"] equals the crafted ts. Within the minute the
// volume is set to 80 here: the stamp becomes crafted ts + 1, not the clock.
// After the quiet period the change sync reports adopted 0, pushed 1, the pref
// stays 80, and sharedSettings() shows readAloud.volume 80 at crafted ts + 1
// by this machine. The volume is restored to the opener's snapshot at cleanup
// (its value and user-value state), not here. State: S.item625.
(async () => {
  const out = { step: 'item-6.25-faster-clock' };
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
    // --- Quiet start, and a clean trigger so only this item's traffic follows. ---
    let settings = JSON.parse(await diagnostics.settingsSync());
    if (settings.transport.running || settings.transport.pendingChange) throw new Error('transport not quiet at item start');
    const syncsBefore = settings.transport.syncs;
    p.setBoolPref(prefix + 'webdav.syncSettings', false);
    p.setBoolPref(prefix + 'webdav.syncSettings', true);
    const clean = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore && t.running === false && t.lastTrigger === 'switch-on';
    }, 20000, 150);
    const cleanStats = JSON.parse(await diagnostics.settingsSync()).transport;
    out.cleanTrigger = { waited: !!clean, adopted: cleanStats.adopted, pushed: cleanStats.pushed, uploaded: cleanStats.uploaded };

    // --- Craft the future item by "tester". ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    const getResp = await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } });
    if (!getResp.ok) throw new Error(`file GET ${getResp.status}`);
    const doc = JSON.parse(await getResp.text());
    const craftedTs = Date.now() + 60000;
    S.item625 = { craftedTs };
    doc.items = doc.items.filter((i) => i.key !== 'readAloud.volume');
    doc.items.push({ key: 'readAloud.volume', value: 120, ts: craftedTs, by: 'tester' });
    doc.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    if (!putResp.ok) throw new Error(`file PUT ${putResp.status}`);
    out.crafted = { ts: craftedTs, value: 120, by: 'tester' };

    // --- The adoption trigger. ---
    const syncsBefore2 = JSON.parse(await diagnostics.settingsSync()).transport.syncs;
    p.setBoolPref(prefix + 'webdav.syncSettings', false);
    p.setBoolPref(prefix + 'webdav.syncSettings', true);
    const adopted = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore2 && t.running === false && t.lastTrigger === 'switch-on';
    }, 20000, 150);
    const adoptStats = JSON.parse(await diagnostics.settingsSync()).transport;
    const stampAfterAdopt = JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps['readAloud.volume'];
    out.adoption = {
      waited: !!adopted, adopted: adoptStats.adopted, pushed: adoptStats.pushed,
      applied: adoptStats.lastApplied && adoptStats.lastApplied.applied,
      stampAfterAdopt, stampEqualsCraftedTs: stampAfterAdopt === craftedTs,
      prefAfterAdopt: p.getIntPref(prefix + 'readAloud.volume'),
    };

    // --- Within the minute: the local change to 80. ---
    p.setIntPref(prefix + 'readAloud.volume', 80);
    const stampAfterChange = JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps['readAloud.volume'];
    out.localChange = { stampAfterChange, equalsCraftedPlusOne: stampAfterChange === craftedTs + 1, prefNow: p.getIntPref(prefix + 'readAloud.volume') };

    // --- The quiet-period change sync. ---
    const done = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > adoptStats.syncs && t.running === false && t.lastTrigger === 'change' && t.pendingChange === false;
    }, 25000, 250);
    const finalStats = JSON.parse(await diagnostics.settingsSync()).transport;
    out.changeSync = { waited: !!done, lastOutcome: finalStats.lastOutcome, adopted: finalStats.adopted, pushed: finalStats.pushed, uploaded: finalStats.uploaded, deferred: finalStats.deferred };
    out.prefFinal = p.getIntPref(prefix + 'readAloud.volume');

    // --- The shared file's volume item. ---
    const shared = JSON.parse(await diagnostics.sharedSettings());
    const vol = shared.items.find((i) => i.key === 'readAloud.volume');
    out.fileVolume = vol || null;
    out.fileVolumeMatches = !!vol && vol.value === 80 && vol.ts === craftedTs + 1 && vol.by === machine;
    out.status = out.adoption.adopted === 1 && out.adoption.stampEqualsCraftedTs
      && out.localChange.equalsCraftedPlusOne && out.changeSync.adopted === 0 && out.changeSync.pushed === 1
      && out.prefFinal === 80 && out.fileVolumeMatches ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
