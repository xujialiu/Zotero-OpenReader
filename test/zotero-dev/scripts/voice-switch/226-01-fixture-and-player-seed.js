(async () => {
  // Issue #226, item 17: import a fresh fixture, open its player paused, discover
  // the free English System-voice pair, seed voice A, and probe the audio device.
  // Kokoro (local.baseURL https://h200-kokoro.xujialiu.top) answered 403 on every
  // probe (CF Access block, client-id header only), so the run uses System voices,
  // the brief's named fallback. All sentences of the fixture are fresh prose, so
  // no audio cache can answer for this voice pair.
  const S = Zotero.ZoteroTTS.diagnostics;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const out = { status: 'FAIL', steps: {}, errors: [] };
  const step = async (name, fn) => { try { out.steps[name] = await fn(); } catch (e) { out.errors.push(name + ': ' + String(e)); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, timeout = 24000, stepMs = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(stepMs);
    }
    return test();
  };
  const base = Zotero.__ztts226;
  if (!base) throw new Error('the pre-install baseline snapshot is missing');
  base.fixtures = base.fixtures || [];

  const fixtureFile = Zotero.ZoteroTTSRun.params.fixture226?.p1a;
  if (!fixtureFile) throw new Error('params.fixture226.p1a (the fresh fixture path) is missing');

  // The free pair: two Fish Audio voices (the profile's configured model is the
  // free one, fish.model s2.1-pro-free, authorized for this check; Fish is
  // word-timed). With favoritesOnly on (set in 226-00), the Player's catalog
  // collapses to readAloud.favoriteVoices, so the pair is written BEFORE the
  // first popup opens — otherwise the memory's voice is not offered and
  // memory-sync substitutes the fish Local voice.
  try {
    const favName = prefix + 'readAloud.favoriteVoices';
    base.prefSnapshot[favName] = base.prefSnapshot[favName] ?? { type: 'string', value: p.getStringPref(favName), user: p.prefHasUserValue(favName) };
    const a = 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da'; // the profile's proven fish voice (was the only fish favorite)
    const b = 'fish::en/933563129e564b19a115bedd57b7406a'; // first official English voice of the fishVoices listing
    if (a === b) throw new Error('the fish pair collapsed to one voice');
    base.voiceA = a; base.voiceB = b;
    p.setStringPref(favName, JSON.stringify([a, b]));
    out.favorites = { A: a, B: b };
  } catch (e) { out.errors.push('favorites: ' + String(e)); return JSON.stringify(out, null, 1); }

  await step('fixture-in', async () => {
    // A previous attempt's fixture goes first, its reader closed paused-session-free.
    const main = Zotero.getMainWindow();
    for (const row of base.fixtures) {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) {
        try {
          if (Components.utils.isDeadWrapper?.(list[i]) || list[i]?.itemID !== row.itemID) continue;
          try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
          const closing = list[i].close?.(); if (closing && typeof closing.then === 'function') await closing;
        } catch (_) {}
      }
      try { const old = Zotero.Items.get(row.itemID); if (old) await old.eraseTx(); } catch (_) {}
    }
    await waitFor(() => !(Zotero.Reader?._readers || []).some(r => (base.fixtures || []).some(row => row.itemID === r?.itemID)), 8000, 100);
    const imported = await Zotero.Attachments.importFromFile({ file: fixtureFile, libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS 226 fixture p1a ${Date.now()}` });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    base.fixtures = [{ itemID: item.id, key: item.key, file: fixtureFile }];
    base.fixtureItemID = item.id;
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    const reader = await waitFor(() => {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) {
        try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === item.id && list[i]?._internalReader?._readAloudManager) return list[i]; } catch (_) {}
      }
      return null;
    }, 24000, 200);
    if (!reader) throw new Error('reader did not initialize');
    base.fixtureReader = reader;
    const main2 = Zotero.getMainWindow();
    if (main2?.Zotero_Tabs?.select && reader.tabID) main2.Zotero_Tabs.select(reader.tabID);
    reader.focus?.();
    await sleep(400);
    // The segment store is lazy for a fresh reader: it builds when the session
    // activates. On a fresh reader the remembered voice may not resolve until the
    // system voice catalog loads (allVoices grows late — reader.js 83876), so
    // nudge the catalog through the player's Provider picker, then seed.
    const internal0 = reader._internalReader;
    const manager0 = Components.utils.waiveXrays(internal0._readAloudManager);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    try { internal0.toggleReadAloudPopup(true); } catch (e) { out.errors.push('popup: ' + String(e)); }
    const active0 = await waitFor(() => { try { return !!manager0.active; } catch (_) { return false; } }, 8000, 120);
    const hasSystemVoice = () => {
      const raw = manager0.allVoices || manager0._allVoices || [];
      for (let k = 0; k < raw.length; k++) { try { if (String(Components.utils.waiveXrays(raw[k])?.id ?? '').startsWith('fish::')) return true; } catch (_) {} }
      return false;
    };
    let nudges = 0;
    if (!active0 || !hasSystemVoice()) {
      // Zotero's system tier is the reader iframe's own speechSynthesis list
      // (reader.js 39796: getVoices waits on voiceschanged, capped at 3 s). Kick
      // the synth list, then ask the manager to rebuild its catalog.
      try {
        const ss = reader._iframeWindow.speechSynthesis;
        const before = ss.getVoices().length;
        if (!before) {
          await new Promise((resolve) => {
            const t = setTimeout(() => { ss.removeEventListener('voiceschanged', done); resolve(); }, 8000);
            const done = () => { clearTimeout(t); ss.removeEventListener('voiceschanged', done); resolve(); };
            ss.addEventListener('voiceschanged', done, { once: true });
            try { ss.getVoices(); } catch (_) {}
          });
        }
        nudges = -1; // mark: kicked the synth list
        out.steps.synthVoices = ss.getVoices().length;
      } catch (e) { out.errors.push('synth kick: ' + String(e)); }
      for (let round = 0; round < 4 && !hasSystemVoice(); round++) {
        nudges++;
        try { await manager0.loadVoices(); } catch (_) {}
        await waitFor(hasSystemVoice, 3000, 200);
      }
    }
    out.steps.catalog = { active0, nudges, hasSystem: hasSystemVoice() };
    if (!active0) {
      const raw = manager0.allVoices || manager0._allVoices || [];
      let memoryId = null;
      try { memoryId = JSON.parse(p.getStringPref(prefix + 'readAloud.memory'))?.voice?.id ?? null; } catch (_) {}
      let seedId = null;
      for (let k = 0; k < raw.length; k++) { try { const id = String(Components.utils.waiveXrays(raw[k])?.id ?? ''); if (id.startsWith('fish::') && (memoryId ? id === memoryId : id === 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da')) seedId = id; } catch (_) {} }
      if (!seedId) { for (let k = 0; k < raw.length; k++) { try { const id = String(Components.utils.waiveXrays(raw[k])?.id ?? ''); if (id.startsWith('fish::')) seedId = seedId ?? id; } catch (_) {} } }
      if (!seedId) throw new Error('no fish:: voice ever listed for the fresh reader');
      try { manager0.selectTier('fish'); } catch (_) {}
      await sleep(300);
      try { manager0.selectVoice(seedId); } catch (e) { out.errors.push('seed selectVoice: ' + String(e)); }
      await waitFor(() => { try { return !!manager0.active; } catch (_) { return false; } }, 20000, 150);
    }
    try { if (manager0.active && !manager0.paused) manager0.pause(); } catch (_) {}
    await waitFor(() => { try { return !!manager0.active && manager0.paused; } catch (_) { return false; } }, 8000, 100);
    const segs = await waitFor(() => {
      const rows = internal0._readAloudManager?._segments || internal0._readAloudSegments?.segments;
      return rows?.length ? rows : null;
    }, 48000, 250);
    if (!segs) throw new Error('segments never appeared');
    const waived = Components.utils.waiveXrays(segs);
    const lengths = [];
    for (let i = 0; i < waived.length; i++) lengths.push(String(Components.utils.waiveXrays(waived[i])?.text ?? '').length);
    return { itemID: item.id, segments: waived.length, textLengths: lengths };
  });

  await step('memory-and-voices', async () => {
    const internal = base.fixtureReader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    // Memory must name a FREE voice before the popup opens. The Kokoro server is
    // blocked (403), so the free pair this run uses is System voices; point the
    // memory at one only if its current id is not one (restored verbatim at 226-99).
    const memoryName = prefix + 'readAloud.memory';
    base.memoryBefore = base.memoryBefore ?? { value: p.getStringPref(memoryName), user: p.prefHasUserValue(memoryName) };
    let memoryVoice = null;
    try { memoryVoice = JSON.parse(base.memoryBefore.value)?.voice?.id ?? null; } catch (_) {}
    out.memoryBeforeVoice = memoryVoice;

    // Open the player. The memory names a listed free System voice on this
    // profile, so the popup may start playback at once; pause in the same script.
    try { internal.toggleReadAloudPopup(true); } catch (e) { out.errors.push('popup: ' + String(e)); }
    const active = await waitFor(() => { try { return !!manager.active; } catch (_) { return false; } }, 12000, 120);
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000, 100);

    const readVoices = () => {
      const rows = [];
      const sources = [manager.allVoices, manager._allVoices];
      const seen = new Set();
      for (const raw of sources) {
        if (!raw) continue;
        for (let i = 0; i < raw.length; i++) {
          let v = null;
          try { v = Components.utils.waiveXrays(raw[i]); } catch (_) { continue; }
          let id = null, name = null, lang = null, tier = null, remote = null;
          try { id = v?.id ?? null; name = v?.label ?? v?.name ?? null; lang = v?.language ?? v?.lang ?? null; } catch (_) {}
          try { tier = v?.tier ?? v?.provider?.tier ?? null; remote = v?.provider?.remote ?? null; } catch (_) {}
          if (id && !seen.has(id)) { seen.add(id); rows.push({ id, name, lang, tier, remote }); }
        }
      }
      return rows;
    };
    let voices = null;
    // The system voices list loads asynchronously; poll, and kick the synth list
    // + loadVoices once if the catalog has not arrived.
    for (let attempt = 0; attempt < 2 && !voices; attempt++) {
      voices = await waitFor(() => {
        const rows = readVoices();
        return rows.filter(v => String(v.id).startsWith('fish::')).length >= 2 ? rows : null;
      }, 15000, 250);
      if (!voices && attempt === 0) {
        try {
          const ss = reader._iframeWindow.speechSynthesis;
          ss.getVoices();
        } catch (_) {}
        try { await manager.loadVoices(); } catch (_) {}
        await sleep(1500);
      }
    }
    if (!voices) { out.voiceInventory = { all: readVoices().length }; throw new Error('the manager never listed two fish:: voices'); }
    const systemEnglish = voices.filter(v => String(v.id).startsWith('fish::'));
    out.voiceInventory = { all: voices.length, systemEnglish: systemEnglish.map(v => ({ id: v.id, name: v.name, lang: v.lang, tier: v.tier })) };
    if (systemEnglish.length < 2) throw new Error('fewer than two free English System voices listed');
    // A stable, human-familiar pair: Samantha and Albert when listed, else the first two.
    const ids = systemEnglish.map(v => v.id);
    const names = Object.fromEntries(systemEnglish.map(v => [v.id, String(v.name ?? '')]));
    const byName = re => ids.find(id => re.test(names[id]));
    const idA = byName(/samantha/i) ?? byName(/albert/i) ?? ids[0];
    const idB = byName(/albert/i) ?? ids.find(id => id !== idA) ?? ids.find(id => id !== idA);
    base.voiceA = idA; base.voiceB = idB;

    // Favorites-only pins the Player's Shift+. cycle to exactly [A, B].
    const fvName = prefix + 'readAloud.favoriteVoices';
    base.prefSnapshot[fvName] = base.prefSnapshot[fvName] ?? { type: 'string', value: p.getStringPref(fvName), user: p.prefHasUserValue(fvName) };
    p.setStringPref(fvName, JSON.stringify([idA, idB]));
    out.favorites = { A: idA, B: idB, before: base.prefSnapshot[fvName].value };

    // Repoint the memory at A when its current id is not one of this run's free pair
    // (a listed free voice; the Player then opens on it deterministically).
    if (!base.memoryFreePointed) {
      if (!memoryVoice || (memoryVoice !== idA && memoryVoice !== idB)) {
        const safe = JSON.stringify({ speed: (() => { try { return JSON.parse(base.memoryBefore.value)?.speed ?? 1; } catch (_) { return 1; } })(), voice: { id: idA, lang: 'en' } });
        p.setStringPref(memoryName, safe);
        out.memoryRepointed = { from: memoryVoice, to: idA };
      }
      base.memoryFreePointed = true;
    }

    // Put the manager on the pair: the system tier, then voice A, while paused
    // (a paused pick goes Zotero's native way and starts no switch).
    let tierSet = false;
    try { manager.selectTier('fish'); tierSet = true; } catch (e) { out.errors.push('selectTier fish: ' + String(e)); }
    if (!tierSet) { try { manager._selectedTier = 'fish'; } catch (_) {} }
    await sleep(400);
    try { manager.selectVoice(idA); } catch (e) { out.errors.push('selectVoice A: ' + String(e)); }
    const seeded = await waitFor(() => { try { return String(manager.selectedVoiceID ?? '') === idA; } catch (_) { return false; } }, 12000, 150);
    out.seed = { selected: manager.selectedVoiceID ?? null, tier: manager._selectedTier ?? null, seeded };
    if (!seeded) throw new Error('the seed voice never took');
    return 'ok';
  });

  await step('audio-probe', async () => {
    // The engine session must run and advance on its own (a device is present).
    const itemID = () => base.fixtureItemID;
    const tabOf = async () => {
      const all = JSON.parse(await S.engine());
      return all.readers.find(r => Number(r.itemID) === Number(itemID())) ?? null;
    };
    const reader = base.fixtureReader;
    const internal = reader._internalReader;
    const manager = Components.utils.waiveXrays(internal._readAloudManager);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    try { manager.play(); } catch (e) { out.errors.push('probe play: ' + String(e)); }
    const playing = await waitFor(async () => (await tabOf())?.session?.playing === true, 30000, 300);
    if (!playing) throw new Error('the session never started playing');
    const a = await tabOf();
    const t1 = { state: a.audio?.state, playbackTime: a.session?.playbackTime, position: a.session?.position, voice: a.session?.voice, clipDuration: a.session?.clipDuration };
    await sleep(700);
    const b = await tabOf();
    const t2 = { state: b.audio?.state, playbackTime: b.session?.playbackTime, position: b.session?.position };
    const moved = Number(t2.playbackTime) > Number(t1.playbackTime);
    const dur = {};
    // Sentence-length evidence: flip times while the probe reads (~6 s).
    const flips = [];
    const endAt = Date.now() + 8000;
    let lastPos = b.session?.position ?? null;
    let lastAt = Date.now();
    while (Date.now() < endAt) {
      await sleep(120);
      const t = await tabOf();
      const pos = t?.session?.position ?? null;
      if (pos !== null && pos !== lastPos) { flips.push({ from: lastPos, to: pos, heldMs: Date.now() - lastAt }); lastPos = pos; lastAt = Date.now(); }
      if (flips.length >= 2) break;
    }
    try { if (manager.active && !manager.paused) manager.pause(); } catch (_) {}
    await waitFor(async () => { const t = await tabOf(); return !!t?.session?.paused; }, 8000, 150);
    out.probe = { first: t1, second: t2, moved, flips };
    if (!moved || t1.state !== 'running') throw new Error('audio device probe failed: state ' + t1.state + ', moved ' + moved);
    return 'ok';
  });

  out.status = out.errors.length ? 'FAIL' : 'PASS';
  if (out.status !== 'PASS' && !out.errors.length) out.errors.push('see steps');
  return JSON.stringify(out, null, 1);
})()
