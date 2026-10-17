// 6.14 (b) verification, continued: the speaking reader B was closed in
// 11-close-duplicates; this checks the captured final position against the
// SAME document's live segment list (reader C), its stability across ticks
// (position correctness, not proof of once-only invocation), and both
// files after the reader-close sync settled.
(async () => {
  const out = { step: 'closes-6.14b-verify' };
  const state = Zotero.ZoteroTTSRun.state;
  const FIX = state.fixture;
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const authFetch = async (name) => {
    const bytes = new TextEncoder().encode(String(get('webdav.username') || '') + ':' + String(get('webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return fetch(String(get('webdav.url') || '').trim().replace(/\/+$/, '') + '/' + name, { headers: { Authorization: 'Basic ' + btoa(binary) }, cache: 'no-store' });
  };
  try {
    const readerC = (Zotero.Reader._readers ?? []).find((r) => r.tabID === state.readerC.tabID);
    const source = readerC;
    if (!source) throw new Error('no live fixture reader to read segments from');
    const segs = source._internalReader?._readAloudSegments?.segments;
    const finalSp = state.finalB?.pos != null && segs && state.finalB.pos < segs.length
      ? JSON.parse(JSON.stringify(segs[state.finalB.pos]?.sourcePosition ?? null)) : null;
    out.finalSpTail = JSON.stringify(finalSp ?? null).slice(-40);

    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (position.readers ?? []).find((x) => x.itemID === FIX.itemID);
    out.storedTail = JSON.stringify(row?.stored ?? null).slice(-40);
    out.storedMatchesBFinal = JSON.stringify(row?.stored ?? null) === JSON.stringify(finalSp ?? null);
    out.trace = (position.trace ?? []).slice(-4);
    const syncNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.transports = { p: { syncs: syncNow.transport?.syncs, trigger: syncNow.transport?.lastTrigger }, s: { syncs: syncNow.shared?.transport?.syncs, trigger: syncNow.shared?.transport?.lastTrigger } };

    // Two quiet ticks, then the same comparison again (stability only).
    await Zotero.Promise.delay(1500);
    const position2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row2 = (position2.readers ?? []).find((x) => x.itemID === FIX.itemID);
    out.captureStable = JSON.stringify(row2?.stored ?? null) === JSON.stringify(row?.stored ?? null);
    out.queueEmpty = position2.store?.queued === 0;

    // Both files, settled.
    const g1 = await authFetch('zotero-tts-positions.json');
    const entry = ((JSON.parse(await g1.text()).items ?? []).find((e) => e.lib === FIX.lib && e.key === FIX.key)) ?? null;
    out.nativeEntry = entry ? { ts: entry.ts, posTail: JSON.stringify(entry.pos).slice(-40) } : null;
    out.nativeNamesFinal = JSON.stringify(entry?.pos ?? null) === JSON.stringify(finalSp ?? null);
    const g2 = await authFetch('xujialiu-positions.json');
    const mine = ((JSON.parse(await g2.text()).items ?? []).find((it) => it.id === Zotero.ZoteroTTSRun.params.documentId)) ?? null;
    out.sharedAnchor = String(mine?.anchor?.exact ?? '').slice(0, 80);
    out.sharedNamesFinal = String(mine?.anchor?.exact ?? '').replace(/\s+/g, ' ').includes(String(state.finalB.sentence ?? '').replace(/\s+/g, ' ').slice(0, 50));
    out.stampAt = mine?.stamp?.at ?? null;
    out.ok = out.storedMatchesBFinal && out.captureStable && out.queueEmpty && out.nativeNamesFinal && out.sharedNamesFinal;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
