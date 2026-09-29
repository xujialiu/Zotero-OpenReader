// Issue #82 item 4, tail: the apply-side invariants after the player-close sync
// applied the held 190 (the defer and paused-hold halves are the 06 result).
// Expects pref 190, memory 1.9, both readers 1.9, every zotero.<lang>.speed 1.9,
// the stamp equal to the crafted item's ts (1790666519888), the file unchanged,
// and the apply credited to the player-close trigger.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
  const craftedTs = Number(Zotero.ZoteroTTSRun.params.item4Ts ?? 0);
  const out = {};

  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
  const mem = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readAloudMemory());
  out.apply = {
    trigger: sync.transport?.lastTrigger, outcome: sync.transport?.lastOutcome,
    applied: sync.transport?.lastApplied?.applied, from: sync.transport?.lastApplied?.from,
    deferred: sync.transport?.lastApplied?.deferred,
  };
  out.state = {
    speedPercent: mem.speedPercent, memorySpeed: mem.memory?.speed ?? null,
    readers: (mem.readers ?? []).filter(r => [24770, 24771].includes(r.itemID)).map(r => ({ itemID: r.itemID, speed: r.speed, active: r.active })),
    zoteroSpeeds: Object.fromEntries(Object.entries(mem.zotero ?? {}).map(([k, v]) => [k, v.speed])),
    allLangs190: Object.values(mem.zotero ?? {}).every(v => v.speed === 1.9),
  };
  out.stampTs = (() => { try { return JSON.parse(p.getStringPref(prefix + 'webdav.syncState')).stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })();
  const doc = await rawGetJson();
  out.fileItem = (doc.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;

  out.checks = {
    pref190: mem.speedPercent === 190 && mem.memory?.speed === 1.9,
    readers19: out.state.readers.length === 2 && out.state.readers.every(r => r.speed === 1.9),
    allLangs190: out.state.allLangs190,
    stampEqualsItemTs: out.stampTs === craftedTs,
    fileUnchanged: !!out.fileItem && out.fileItem.value === 190 && out.fileItem.by === 'tester' && out.fileItem.ts === craftedTs,
    playerCloseTrigger: out.apply.trigger === 'player-close',
    appliedFromTester: (out.apply.applied ?? []).includes('readAloud.speedPercent') && (out.apply.from ?? []).includes('tester'),
  };
  out.status = Object.values(out.checks).every(Boolean) ? 'PASS' : 'FAIL';
  if (out.status === 'FAIL') throw new Error(JSON.stringify(out));
  return JSON.stringify(out);
})()
