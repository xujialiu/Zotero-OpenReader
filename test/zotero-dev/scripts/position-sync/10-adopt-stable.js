// 6.13 (issue #206): a newer position for the fixture alone is written into
// the native positions file as another computer's row; a switch-on poke pulls
// and adopts it. Then four-plus sampler ticks with both duplicate readers
// open and unchanged: the adopted position and stamp stay held, with no new
// local write and no pause sync. params: documentId (unused here), craftDelta.
(async () => {
  const out = { step: 'adopt-6.13', steps: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const A = state.readerA;
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const set = (k, v) => Zotero.Prefs.set(full(k), v, true);
  const authFetch = async (name, method, text) => {
    const bytes = new TextEncoder().encode(String(get('webdav.username') || '') + ':' + String(get('webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return fetch(String(get('webdav.url') || '').trim().replace(/\/+$/, '') + '/' + name, {
      method, headers: { Authorization: 'Basic ' + btoa(binary), ...(text ? { 'Content-Type': 'application/json' } : {}) }, body: text, cache: 'no-store',
    });
  };
  const sha = async (text) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  try {
    const readerA = (Zotero.Reader._readers ?? []).find((r) => r.tabID === A.tabID);
    const readerB = (Zotero.Reader._readers ?? []).find((r) => r.tabID === state.readerB.tabID);
    const FIX = state.fixture; // { itemID, lib, key } — readerA carries no lib/key
    if (!FIX?.lib || !FIX?.key) throw new Error('state.fixture missing lib/key');
    out.sessions = { A: { active: !!readerA._internalReader?._readAloudManager?.active, paused: !!readerA._internalReader?._readAloudManager?.paused }, B: { active: !!readerB._internalReader?._readAloudManager?.active, paused: !!readerB._internalReader?._readAloudManager?.paused } };

    // Craft: an earlier chapter-1 sentence as another computer's newer row.
    const segs = readerA._internalReader?._readAloudSegments?.segments;
    const pick = 5;
    const sp = segs?.[pick]?.sourcePosition ?? null;
    if (!sp) throw new Error('no sourcePosition at segment ' + pick);
    const crafted = { lib: FIX.lib, key: FIX.key, pos: sp, ts: Date.now() + (Zotero.ZoteroTTSRun.params.craftDelta ?? 60000) };
    state.crafted = crafted;
    out.crafted = { ts: crafted.ts, posTail: JSON.stringify(sp).slice(-36), sentence: String(segs[pick]?.text ?? '').slice(0, 70) };
    const g1 = await authFetch('zotero-tts-positions.json', 'GET');
    const doc = JSON.parse(await g1.text());
    const items = (doc.items ?? []).filter((e) => !(e.lib === FIX.lib && e.key === FIX.key));
    items.push(crafted);
    doc.items = items;
    const p1 = await authFetch('zotero-tts-positions.json', 'PUT', JSON.stringify(doc));
    out.putStatus = p1.status;
    // This server has shown read-after-write lag: poll until the crafted
    // entry is what a GET serves, so the transport cannot download a stale file.
    const tV = Date.now();
    let visible = false;
    while (Date.now() - tV < 15000) {
      await Zotero.Promise.delay(700);
      try {
        const gv = await authFetch('zotero-tts-positions.json', 'GET');
        const dv = JSON.parse(await gv.text());
        const ev = (dv.items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key);
        if (ev && ev.ts === crafted.ts) { visible = true; break; }
      } catch (e) { out.steps.push('visibility poll: ' + String(e).slice(0, 60)); }
    }
    out.craftVisible = visible;
    if (!visible) throw new Error('crafted entry never became visible to GETs');

    // Poke via the switch (the observer syncs at once), then wait quiet.
    set('webdav.syncPositions', false);
    await Zotero.Promise.delay(400);
    set('webdav.syncPositions', true);
    const t0 = Date.now();
    let sync = null;
    while (Date.now() - t0 < 15000) {
      await Zotero.Promise.delay(300);
      sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      if (!sync.transport?.running && !sync.shared?.transport?.running) break;
    }
    out.afterPoke = {
      trigger: sync.transport?.lastTrigger, outcome: sync.transport?.lastOutcome, adopted: sync.transport?.adopted,
      lastAdoption: sync.transport?.lastAdoption, sharedTrigger: sync.shared?.transport?.lastTrigger, sharedOutcome: sync.shared?.transport?.lastOutcome,
    };

    // Adoption held: stored == crafted pos; the file's entry ts == crafted ts.
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (position.readers ?? []).find((x) => x.itemID === A.itemID);
    out.storedTail = JSON.stringify(row?.stored ?? null).slice(-36);
    out.storedIsCrafted = JSON.stringify(row?.stored ?? null) === JSON.stringify(sp);
    const g2 = await authFetch('zotero-tts-positions.json', 'GET');
    const text2 = await g2.text();
    const entry = (JSON.parse(text2).items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key) ?? null;
    out.fileEntryTs = entry?.ts ?? null;
    out.fileTsIsCrafted = entry?.ts === crafted.ts;
    out.fileShaAfterAdoption = await sha(text2);

    // Stability: five ticks with both paused readers unchanged.
    await Zotero.Promise.delay(5 * 520 + 400);
    const position2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row2 = (position2.readers ?? []).find((x) => x.itemID === A.itemID);
    const sync2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const g3 = await authFetch('zotero-tts-positions.json', 'GET');
    const text3 = await g3.text();
    const entry2 = (JSON.parse(text3).items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key) ?? null;
    out.stability = {
      storedUnchanged: JSON.stringify(row2?.stored ?? null) === JSON.stringify(sp),
      tsUnchanged: entry2?.ts === crafted.ts,
      pauseSyncsGained: (sync2.transport.syncs - sync.transport.syncs) + (sync2.shared.transport.syncs - sync.shared.transport.syncs),
      queueEmpty: position2.store?.queued === 0,
      rowsStable: position2.database?.rows === position.database?.rows,
      fileUnchanged: (await sha(text3)) === out.fileShaAfterAdoption,
    };
    out.ok = out.putStatus === 204 && out.craftVisible && out.afterPoke.adopted >= 1 && out.storedIsCrafted && out.fileTsIsCrafted
      && out.stability.storedUnchanged && out.stability.tsUnchanged && out.stability.pauseSyncsGained === 0
      && out.stability.queueEmpty && out.stability.rowsStable && out.stability.fileUnchanged;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
