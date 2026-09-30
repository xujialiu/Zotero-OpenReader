(async () => {
  // Issue #163: mute, safe memory, the fresh run fixture in, player open + paused,
  // free voice pair A/B, prefetch raised to 8. Adapted from 154-01 (executed
  // 2026-09-28); the fixture is the run's own unique-prose PDF (params.fixture163),
  // so the plugin's in-memory cache cannot hold its sentences for these voices.
  const session = Zotero.__ztts163;
  if (!session?.baseline || !session.destinationMatched) throw new Error('163 isolation baseline is missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixtureFile = Zotero.ZoteroTTSRun.params.fixture163;
  if (!fixtureFile) throw new Error('params.fixture163 (the fresh fixture path) is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 24000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readBool = suffix => p.getBoolPref(prefix + suffix);
  const readerOfStale = sess => {
    const list = Zotero.Reader?._readers || [];
    const ids = (sess.fixtures || []).map(row => row.itemID);
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && ids.includes(list[i]?.itemID)) return list[i]; } catch (_) {}
    }
    return null;
  };
  const out = { status: 'FAIL', steps: {}, errors: [] };
  try {
    // Mute before anything can play; keep writes suspended.
    p.setIntPref(prefix + 'readAloud.volume', 0);
    p.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + suffix, false);
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

    // Prefetch raised so a chain is still running at the pick (baseline 5, restored at cleanup).
    p.setIntPref(prefix + 'prefetch', 8);
    out.prefetch = { now: p.getIntPref(prefix + 'prefetch'), baseline: session.baseline.prefetch?.value };

    // Import the fresh fixture (unique prose: the cache cannot hold it). A previous
    // attempt's fixture item is erased first, so a rerun never leaves duplicates.
    if (Array.isArray(session.fixtures)) {
      for (const row of session.fixtures) {
        try { const old = Zotero.Items.get(row.itemID); if (old) await old.eraseTx(); } catch (_) {}
      }
      try { const stale = readerOfStale(session); if (stale) { try { stale.close?.(); } catch (_) {} } } catch (_) {}
    }
    const imported = await Zotero.Attachments.importFromFile({ file: fixtureFile, libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS issue 163 pdf ${Date.now()}` });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    session.fixtures = [{ kind: 'pdf', itemID: item.id, key: item.key, title: item.getField?.('title') ?? null, file: fixtureFile }];
    Zotero.ZoteroTTSRun.state.fixtures163 = session.fixtures;

    // Open the reader and wait for the manager and segments.
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    const findReader = () => {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) if (list[i]?.itemID === item.id) return list[i];
      return null;
    };
    const reader = await waitFor(() => {
      const candidate = findReader();
      return candidate?._internalReader?._readAloudManager ? candidate : null;
    });
    if (!reader) throw new Error('reader did not initialize');
    const internal = reader._internalReader;
    const manager = internal._readAloudManager;
    const segments = await waitFor(() => {
      const rows = manager._segments || internal._readAloudSegments?.segments;
      return rows?.length ? rows : null;
    });
    session.fixtureReader = reader;
    session.fixtureItemID = item.id;

    // Select the fixture tab so the player mounts here.
    const main = Zotero.getMainWindow?.();
    if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    await sleep(400);

    // Memory must name a FREE LOCAL plugin voice before the popup opens (owner credits).
    // The configured local/Kokoro tier is currently disabled; enabling a configured
    // provider for a test is authorized (restored from baseline at cleanup).
    const localEnabledBefore = (() => { try { return p.getBoolPref(prefix + 'local.enabled'); } catch (_) { return null; } })();
    session.localEnabledBefore = localEnabledBefore;
    if (localEnabledBefore !== true) { try { p.setBoolPref(prefix + 'local.enabled', true); } catch (_) {} }
    out.localTier = { enabledBefore: localEnabledBefore, now: true };
    session.memoryOriginal = p.getStringPref(prefix + 'readAloud.memory');
    let memoryNow = null;
    try { memoryNow = JSON.parse(session.memoryOriginal); } catch (_) {}
    const memoryLocal = !!memoryNow?.voice?.id && String(memoryNow.voice.id).startsWith('local::af_');
    if (!memoryLocal) {
      const safeJSON = JSON.stringify({ speed: memoryNow?.speed ?? 1, voice: { id: 'local::af_bella', lang: 'en' } });
      p.setStringPref(prefix + 'readAloud.memory', safeJSON);
      await sleep(200);
      out.memoryRepointed = { from: memoryNow?.voice?.id ?? null, to: 'local::af_bella' };
    }
    out.memory = { originalChars: session.memoryOriginal.length, wasLocal: memoryLocal, previousVoice: memoryNow?.voice?.id ?? null };

    // Open the player: plays at once on a listed voice; pause in the same script.
    internal.toggleReadAloudPopup(true);
    await waitFor(() => !!manager.active && !manager.paused, 12000, 120);
    try { manager.pause(); } catch (e) { out.errors.push('seed pause: ' + String(e)); }
    await waitFor(() => !!manager.active && manager.paused, 8000, 100);
    out.player = { active: !!manager.active, paused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null };
    // Discover free plugin voices now that the lists are built (entries carry
    // `language`). Poll for local voices, rebuilding the popup once if needed.
    const readVoices = () => {
      const byId = {};
      const rows = manager.allVoices || [];
      for (let i = 0; i < rows.length; i++) {
        const voice = rows[i];
        let id = null, name = null, language = null;
        try { id = voice?.id ?? null; name = voice?.label ?? voice?.name ?? null; language = voice?.language ?? voice?.lang ?? voice?.locale ?? null; } catch (_) {}
        if (id) byId[id] = { id, name, language };
      }
      return byId;
    };
    let voicesById = await waitFor(() => {
      const byId = readVoices();
      return Object.keys(byId).some(id => id.startsWith('local::')) ? byId : null;
    }, 6000, 200);
    if (!voicesById) {
      internal.toggleReadAloudPopup(false);
      await waitFor(() => { try { return !manager.active; } catch (_) { return false; } }, 8000);
      await sleep(400);
      internal.toggleReadAloudPopup(true);
      await waitFor(() => { try { return !!manager.active; } catch (_) { return false; } }, 12000, 120);
      try { manager.pause(); } catch (e) { out.errors.push('rebuild pause: ' + String(e)); }
      await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000);
      voicesById = await waitFor(() => {
        const byId = readVoices();
        return Object.keys(byId).some(id => id.startsWith('local::')) ? byId : null;
      }, 6000, 200);
    }
    if (!voicesById) throw new Error('local tier voices never appeared after enabling');
    const localEnglish = Object.keys(voicesById).filter(id => id.startsWith('local::') && String(voicesById[id].language || '').toLowerCase().startsWith('en'));
    out.voiceInventory = {
      allVoices: Object.keys(voicesById).length,
      local: Object.keys(voicesById).filter(id => id.startsWith('local::')).length,
      localEnglish,
    };
    const selected = String(manager.selectedVoiceID ?? '');
    const memoryID = String(memoryNow?.voice?.id ?? '');
    const voiceA = localEnglish.includes(memoryID) ? memoryID : (localEnglish.includes(selected) ? selected : (localEnglish.includes('local::af_bella') ? 'local::af_bella' : localEnglish[0] || null));
    if (!voiceA) throw new Error('no free local English voice to seed with');
    session.voiceA = voiceA;

    // The Shift+. cycle walks playerVoices(manager.voicesForLanguage); favorites-only
    // pins the pair to [A, B] so the key cycle has exactly two members.
    p.setStringPref(prefix + 'readAloud.favoriteVoices', JSON.stringify([voiceA, 'local::af_alloy']));
    p.setBoolPref(prefix + 'readAloud.favoritesOnly', true);
    await sleep(300);
    const readCycle = () => {
      const rows = [];
      const rawList = manager.voicesForLanguage || [];
      for (let i = 0; i < rawList.length; i++) {
        const v = Components.utils.waiveXrays(rawList[i]);
        let id = null, cpm = null;
        try { id = v?.id ?? null; cpm = typeof v?.creditsPerMinute === 'number' ? v.creditsPerMinute : null; } catch (_) {}
        if (id) rows.push({ id, cpm });
      }
      rows.sort((a, b) => (a.cpm ?? -1) - (b.cpm ?? -1));
      return rows.map(r => r.id);
    };
    let cycleIds = await waitFor(() => {
      const ids = readCycle();
      return ids.length ? ids : null;
    }, 6000, 200);
    if (!cycleIds) {
      internal.toggleReadAloudPopup(false);
      await waitFor(() => { try { return !manager.active; } catch (_) { return false; } }, 8000);
      await sleep(400);
      internal.toggleReadAloudPopup(true);
      await waitFor(() => { try { return !!manager.active && !manager.paused; } catch (_) { return false; } }, 12000, 120);
      try { manager.pause(); } catch (e) { out.errors.push('cycle pause: ' + String(e)); }
      await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000);
      cycleIds = await waitFor(() => {
        const ids = readCycle();
        return ids.length ? ids : null;
      }, 6000, 200);
    }
    if (!cycleIds) throw new Error('voicesForLanguage never built a cycle list');
    const idxA = cycleIds.indexOf(voiceA);
    out.cycle = { count: cycleIds.length, indexA: idxA, ids: cycleIds };
    if (idxA < 0) throw new Error('voiceA is not in the Shift+. cycle list');
    const voiceB = cycleIds[(idxA + 1) % cycleIds.length];
    if (!String(voiceB).includes('::')) throw new Error(`Shift+. neighbor is not a plugin voice: ${voiceB}`);
    session.voiceB = voiceB;
    out.voices = { A: voiceA, AName: voicesById[voiceA]?.name ?? null, B: voiceB, BName: voicesById[voiceB]?.name ?? null, pairing: 'actual Shift+. neighbor' };

    // The popup open re-applied the NATIVE per-language memory, which may still name
    // a Fish voice from an earlier session; outside the favorites-only list it is
    // dropped (no controller). Select the local seed voice through the manager now
    // that the pair is known, then pause; the paused pick goes Zotero's native way.
    const selectedNow = String(manager.selectedVoiceID ?? '');
    if (!manager.active || !selectedNow.startsWith('local::af_')) {
      if (!manager.active) {
        internal.toggleReadAloudPopup(true);
        await waitFor(() => { try { return !!manager.active; } catch (_) { return false; } }, 12000, 120);
      }
      try { Components.utils.waiveXrays(manager).selectVoice(voiceA); } catch (e) { out.errors.push('selectVoice A: ' + String(e)); }
      await sleep(500);
    }
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('reseed pause: ' + String(e)); }
    await waitFor(() => { try { return !!manager.active && manager.paused; } catch (_) { return false; } }, 8000);
    out.player = { active: !!manager.active, paused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null };

    // Segment inventory for the later rows: the texts the reading will meet.
    const rows = Components.utils.waiveXrays(internal._readAloudSegments?.segments || manager._segments || []);
    const texts = [];
    for (let i = 0; i < rows.length && i < 40; i++) texts.push(String(Components.utils.waiveXrays(rows[i])?.text ?? '').slice(0, 48));
    out.segments = { count: rows.length, first: texts };

    // Engine session present, a local pair voice (the committed switch persists into
    // Zotero's native per-language map, so the popup may reopen on either member —
    // the behavior scripts treat the observed voice as X and pick the other), paused.
    const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const tab = engine.readers.find(row => Number(row.itemID) === Number(item.id)) || null;
    const voiceX = tab?.session?.voice ?? null;
    session.voiceX = voiceX;
    session.voiceB = voiceX === voiceA ? voiceB : voiceA;
    out.engine = {
      attached: !!tab?.attached, voice: voiceX, position: tab?.session?.position ?? null,
      playing: tab?.session?.playing ?? null, paused: tab?.session?.paused ?? null, ended: tab?.session?.ended ?? null,
      audioState: tab?.audio?.state ?? null, stats: tab?.stats ?? null,
    };
    out.status = out.engine.attached && String(voiceX || '').startsWith('local::af_') && out.engine.paused && !out.engine.ended && out.player.paused ? 'PASS' : 'FAIL';
    if (out.status !== 'PASS' && !out.errors.length) out.errors.push('see checks: engine/player fields above');
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out, null, 1);
})();
