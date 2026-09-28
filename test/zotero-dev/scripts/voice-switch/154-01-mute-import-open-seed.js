(async () => {
  // Issue #154: mute, safe memory, fixture-a.pdf in, player open + paused, free voice pair.
  const session = Zotero.__ztts154;
  if (!session?.baseline || !session.destinationMatched) throw new Error('154 isolation baseline is missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
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
  const out = { status: 'FAIL', steps: {}, errors: [] };
  try {
    // Mute before anything can play; keep writes suspended.
    p.setIntPref(prefix + 'readAloud.volume', 0);
    p.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + suffix, false);
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

    // Import the isolated PDF fixture.
    const file = PathUtils.join(fixturesDir, 'fixture-a.pdf');
    const title = `Zotero-TTS issue 154 pdf ${Date.now()}`;
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    session.fixtures = [{ kind: 'pdf', itemID: item.id, key: item.key, title }];
    Zotero.ZoteroTTSRun.state.fixtures154 = session.fixtures;

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

    // Memory must name a free plugin voice before the popup opens (owner credits).
    // The configured local/Kokoro tier is currently disabled; enabling a configured
    // provider for a test is authorized (restored from baseline at cleanup).
    const localEnabledBefore = (() => { try { return p.getBoolPref(prefix + 'local.enabled'); } catch (_) { return null; } })();
    session.localEnabledBefore = localEnabledBefore;
    if (localEnabledBefore !== true) { try { p.setBoolPref(prefix + 'local.enabled', true); } catch (_) {} }
    out.localTier = { enabledBefore: localEnabledBefore, now: true };
    session.memoryOriginal = p.getStringPref(prefix + 'readAloud.memory');
    let memoryNow = null;
    try { memoryNow = JSON.parse(session.memoryOriginal); } catch (_) {}
    const memoryFree = !!memoryNow?.voice?.id && String(memoryNow.voice.id).includes('::');
    if (!memoryFree) {
      const safeJSON = JSON.stringify({ speed: memoryNow?.speed ?? 1, voice: { id: 'local::af_bella', lang: 'en' } });
      p.setStringPref(prefix + 'readAloud.memory', safeJSON);
      await sleep(200);
      out.memoryRepointed = { from: memoryNow?.voice?.id ?? null, to: 'local::af_bella' };
    }
    out.memory = { originalChars: session.memoryOriginal.length, wasFree: memoryFree };

    // Open the player: plays at once on a listed voice; pause in the same script.
    // toggleReadAloudPopup(false) DEACTIVATES the manager (reader.js 84212), so the
    // pause is manager.pause() with the popup left open.
    internal.toggleReadAloudPopup(true);
    await waitFor(() => !!manager.active && !manager.paused, 12000, 120);
    try { manager.pause(); } catch (e) { out.errors.push('seed pause: ' + String(e)); }
    await waitFor(() => !!manager.active && manager.paused, 8000, 100);
    out.player = { active: !!manager.active, paused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null };

    // Discover free plugin voices now that the lists are built. Voice entries carry
    // their language in `language` (fish and local alike). The local tier was just
    // enabled: poll for its voices, rebuilding the popup once if needed.
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
    const all = Object.keys(voicesById).map(id => voicesById[id]);
    const localEnglish = Object.keys(voicesById).filter(id => id.startsWith('local::') && String(voicesById[id].language || '').toLowerCase().startsWith('en'));
    out.voiceInventory = {
      allVoices: all.length,
      local: Object.keys(voicesById).filter(id => id.startsWith('local::')).length,
      localEnglish,
      fishspeech: Object.keys(voicesById).filter(id => id.startsWith('fishspeech::')).length,
    };
    const selected = String(manager.selectedVoiceID ?? '');
    const memoryID = String(memoryNow?.voice?.id ?? '');
    const voiceA = localEnglish.includes(memoryID) ? memoryID : (localEnglish.includes(selected) ? selected : (localEnglish.includes('local::af_bella') ? 'local::af_bella' : localEnglish[0] || null));
    if (!voiceA) throw new Error('no free local English voice to seed with');
    session.voiceA = voiceA;
    out.voices = { A: voiceA, AName: voicesById[voiceA]?.name ?? null };

    // The Shift+. cycle walks playerVoices(manager.voicesForLanguage): entries with
    // an id, sorted by creditsPerMinute (core/voice-switch.ts). B is A's actual
    // next neighbor there, whatever provider it belongs to; it must be a plugin
    // voice ('::') so the run never lands on a Zotero metered voice.
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
      // Rebuild the lists with a deactivate/reactivate cycle, pause again after.
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
    out.voices.B = voiceB;
    out.voices.BName = voicesById[voiceB]?.name ?? null;
    out.voices.pairing = 'actual Shift+. neighbor';
    if (!voiceA || !voiceB) throw new Error(`need two free plugin voices, got A=${voiceA} B=${voiceB} of ${JSON.stringify(localEnglish)}`);
    session.voiceA = voiceA;
    session.voiceB = voiceB;
    out.voices = { A: voiceA, B: voiceB, AName: voicesById[voiceA]?.name ?? null, BName: voicesById[voiceB]?.name ?? null };

    // Favorites stay as set above (cleanup restores both); they shape the player
    // dropdown, not the key cycle. Verify the engine session and adjacency next.
    const idsAfter = [];
    const rowList = manager.voicesForLanguage || [];
    for (let i = 0; i < rowList.length; i++) idsAfter.push(Components.utils.waiveXrays(rowList[i])?.id ?? null);
    let adjacency = { count: idsAfter.length, indexA: idsAfter.indexOf(voiceA), indexB: idsAfter.indexOf(voiceB) };
    adjacency.ok = adjacency.indexA >= 0 && adjacency.count > 1 && adjacency.indexB === (adjacency.indexA + 1) % adjacency.count;
    out.adjacency = adjacency;

    // Engine session present, voice A, paused.
    const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const tab = engine.readers.find(row => Number(row.itemID) === Number(item.id)) || null;
    out.engine = {
      attached: !!tab?.attached, voice: tab?.session?.voice ?? null, position: tab?.session?.position ?? null,
      playing: tab?.session?.playing ?? null, paused: tab?.session?.paused ?? null, ended: tab?.session?.ended ?? null,
      audioState: tab?.audio?.state ?? null, stats: tab?.stats ?? null,
      segments: segments?.length ?? null,
    };
    const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const vsIndex = (Zotero.Reader._readers || []).indexOf(reader);
    out.voiceSwitch = { index: vsIndex, selected: vs.readers[vsIndex]?.selected ?? null, controlsAttached: vs.readers[vsIndex]?.handoff?.controlsAttached ?? null, bindings: vs.bindings };
    out.status = out.engine.attached && out.engine.voice === voiceA && out.player.paused && out.adjacency.ok ? 'PASS' : 'FAIL';
    if (out.status !== 'PASS' && !out.errors.length) out.errors.push('see checks: engine/player/adjacency fields above');
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out, null, 1);
})();
