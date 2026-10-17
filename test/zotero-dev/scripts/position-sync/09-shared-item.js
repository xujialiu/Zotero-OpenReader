// 6.12, shared half (issue #206): after the speaking reader B's REAL pause,
// the fixture's item in the Positions File names B's sentence, and the
// sampler's stored position matches it. The item is selected by the fixture's
// own Document Id (computed from the fixture's central directory), never by
// "whatever is new in the file". params: documentId.
(async () => {
  const out = { step: 'shared-item-6.12' };
  const state = Zotero.ZoteroTTSRun.state;
  const A = state.readerA;
  try {
    const full = (k) => 'extensions.zotero.zotero-tts.' + k;
    const get = (k) => Zotero.Prefs.get(full(k), true);
    const readerA = (Zotero.Reader._readers ?? []).find((r) => r.tabID === A.tabID);
    const readerB = (Zotero.Reader._readers ?? []).find((r) => r.tabID === state.readerB.tabID);
    if (!readerA || !readerB) throw new Error('fixture readers not found');
    const segs = readerB._internalReader?._readAloudSegments?.segments;
    // B's current (paused) sentence, read live.
    const ids = (Zotero.Reader._readers ?? []).map((r) => r.tabID);
    const i = ids.indexOf(state.readerB.tabID);
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const engB = (eng.readers ?? [])[i] ?? null;
    const pos = engB?.session?.position ?? 0;
    const seg = typeof segs?.length === 'number' && segs.length > pos ? { text: String(segs[pos]?.text ?? ''), sp: segs[pos]?.sourcePosition ?? null } : null;
    out.B = { active: !!readerB._internalReader?._readAloudManager?.active, paused: !!readerB._internalReader?._readAloudManager?.paused, pos, sentence: seg?.text?.slice(0, 90) ?? null };
    out.A = { active: !!readerA._internalReader?._readAloudManager?.active, paused: !!readerA._internalReader?._readAloudManager?.paused };

    // The stored position must match B's segment.
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (position.readers ?? []).find((x) => x.itemID === A.itemID);
    out.storedTail = JSON.stringify(row?.stored ?? null).slice(-40);
    out.storedMatchesB = JSON.stringify(row?.stored ?? null) === JSON.stringify(seg?.sp ?? null);

    // The pause syncs of B's real pause (count deltas are the evidence; the
    // trigger names are checked only as corroboration).
    const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.transports = { p: { syncs: sync.transport?.syncs, trigger: sync.transport?.lastTrigger, outcome: sync.transport?.lastOutcome }, s: { syncs: sync.shared?.transport?.syncs, trigger: sync.shared?.transport?.lastTrigger, outcome: sync.shared?.transport?.lastOutcome } };

    // The fixture's item, by Document Id.
    const bytes = new TextEncoder().encode(String(get('webdav.username') || '') + ':' + String(get('webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const auth = 'Basic ' + btoa(binary);
    const base = String(get('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
    const r = await fetch(base + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    const parsed = JSON.parse(await r.text());
    const mine = (parsed.items ?? []).find((it) => it.id === Zotero.ZoteroTTSRun.params.documentId) ?? null;
    state.fixtureItemId = mine?.id ?? null;
    out.itemFound = !!mine;
    out.sharedItem = mine ? {
      format: mine.format,
      anchorExact: String(mine.anchor?.exact ?? '').slice(0, 100),
      stampDevice: mine.stamp?.device ?? null, stampAt: mine.stamp?.at ?? null,
      locator: mine.locator ?? null,
    } : null;
    const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    out.machine = up.machine;
    if (mine) {
      const norm = (s) => String(s ?? '').replace(/\s+/g, ' ');
      out.checks = {
        anchorNamesPausedSentence: norm(mine.anchor?.exact).includes(norm(seg?.text).slice(0, 50)),
        stampIsThisMachine: mine.stamp?.device === up.machine,
        stampIsRecent: typeof mine.stamp?.at === 'number' && Date.now() - mine.stamp.at < 3600_000,
      };
    }
    out.ok = out.storedMatchesB && !!mine && out.checks?.anchorNamesPausedSentence && out.checks?.stampIsThisMachine && out.checks?.stampIsRecent;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
