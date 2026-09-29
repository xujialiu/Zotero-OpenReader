// Issue #82 item 2, setup: imports the two fixtures, opens their readers,
// opens each player in its selected tab (muted), probes the audio device while
// the first one plays, then pauses both. Records the pre-change speeds.
// Every provider was disabled in this profile's settings, so the run
// temporarily enables Fish (configured, free; the memory names a fish voice)
// — snapshotted in state.fishEnabledBefore, restored at cleanup.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 24000, step = 300) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params;
  const d = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL' };
  let host = null;

  try {
    // Temporarily enable Fish, exactly once, remembering the original state
    if (!state.fishEnabledBefore) {
      state.fishEnabledBefore = p.prefHasUserValue(prefix + 'fish.enabled')
        ? { user: true, value: p.getBoolPref(prefix + 'fish.enabled') } : { user: false };
      p.setBoolPref(prefix + 'fish.enabled', true);
      out.fishEnabledBefore = state.fishEnabledBefore;
    }

    const lib = Zotero.Libraries.userLibraryID;
    const findByTitle = async title => {
      const s = new Zotero.Search();
      s.addCondition('libraryID', 'is', String(lib));
      s.addCondition('title', 'is', title);
      const ids = await s.search();
      for (const id of ids) {
        const item = Zotero.Items.get(id);
        if (item && item.isAttachment()) return id;
      }
      return null;
    };
    const importFixture = async (title, file) => {
      const existing = await findByTitle(title);
      if (existing !== null) return { itemID: existing, imported: false };
      const item = await Zotero.Attachments.importFromFile({ file, libraryID: lib, title });
      return { itemID: item.id, imported: true };
    };
    const a = state.fixtureA ?? await importFixture(params.fixtureTitleA, PathUtils.join(params.root, 'test', 'fixtures', 'fixture-a.pdf'));
    const b = state.fixtureB ?? await importFixture(params.fixtureTitleB, PathUtils.join(params.root, 'test', 'fixtures', 'fixture-b.pdf'));
    state.fixtureA = a; state.fixtureB = b;
    out.fixtures = { a, b };
    if (!a.itemID || !b.itemID) throw new Error('fixture import failed');

    const readerOf = itemID => (Zotero.Reader._readers ?? []).find(r => r && r.itemID === itemID) ?? null;
    const openReader = async itemID => {
      if (!readerOf(itemID)) await Zotero.Reader.open(itemID);
      const ready = await waitFor(() => {
        const r = readerOf(itemID);
        return r && r._internalReader && r._internalReader._readAloudManager ? r : null;
      }, 24000, 400);
      if (!ready) throw new Error('reader ' + itemID + ' did not become ready (_internalReader/_readAloudManager)');
      return ready;
    };
    const readerA = await openReader(a.itemID);
    const readerB = await openReader(b.itemID);
    state.readerA = { itemID: a.itemID, tabID: readerA.tabID };
    state.readerB = { itemID: b.itemID, tabID: readerB.tabID };

    // The players mount only in the selected tab: restore the host window and drive both there
    host = Services.wm.getMostRecentWindow('navigator:browser');
    if (!host) throw new Error('no main window');
    if (host.windowState === 2) host.restore();
    host.focus();
    await sleep(500);

    if (!state.memoryVoiceSafe) throw new Error('the memory does not name a ::-bearing voice; refusing to open a player');

    const openAndPause = async (reader, label) => {
      host.Zotero_Tabs.select(reader.tabID);
      await waitFor(() => host.Zotero_Tabs.selectedID === reader.tabID, 8000, 100);
      reader._iframeWindow?.focus?.();
      await sleep(300);
      if (!reader._internalReader.popupOpen) reader._internalReader.toggleReadAloudPopup(true);
      const active = await waitFor(() => {
        const m = reader._internalReader._readAloudManager;
        return m && m.active ? m : null;
      }, 24000, 200);
      if (!active) {
        const mem = JSON.parse(await d.readAloudMemory());
        const row = (mem.readers ?? []).find(r => r.itemID === reader.itemID) ?? {};
        throw new Error(label + ': the player did not start a session; ' + JSON.stringify({ voice: row.selectedVoiceID, substitution: row.substitution, listsDefault: row.listsDefault }));
      }
      const voice = String(active.selectedVoiceID ?? '');
      if (voice && !voice.includes('::')) throw new Error(label + ': the session voice is a Zotero metered voice; pausing');
      return active;
    };

    // Player A first: probe the audio while it plays, then pause it
    const managerA = await openAndPause(readerA, 'A');
    const probe = async () => {
      const e = JSON.parse(await d.engine());
      const row = (e.readers ?? []).find(r => r.itemID === state.readerA.itemID) ?? {};
      return { audioState: row.audio?.state ?? null, playbackTime: row.session?.playbackTime ?? null };
    };
    const probe1 = await probe();
    await sleep(600);
    const probe2 = await probe();
    out.audioProbe = { probe1, probe2, device: probe1.audioState === 'running' && probe2.playbackTime !== probe1.playbackTime };
    try { managerA.pause(); } catch (e) { try { managerA.togglePaused(); } catch (e2) {} }
    await waitFor(() => managerA.active && managerA.paused, 8000, 100);

    const managerB = await openAndPause(readerB, 'B');
    try { managerB.pause(); } catch (e) { try { managerB.togglePaused(); } catch (e2) {} }
    await waitFor(() => managerB.active && managerB.paused, 8000, 100);

    // Pre-change state (item 2's "before")
    const before = JSON.parse(await d.readAloudMemory());
    out.before = {
      speedPercent: before.speedPercent,
      memorySpeed: before.memory?.speed ?? null,
      readers: (before.readers ?? []).filter(r => [state.readerA.itemID, state.readerB.itemID].includes(r.itemID))
        .map(r => ({ itemID: r.itemID, speed: r.speed, active: r.active, paused: r.paused, voice: r.selectedVoiceID })),
      zoteroSpeeds: Object.fromEntries(Object.entries(before.zotero ?? {}).map(([k, v]) => [k, v.speed])),
    };
    state.beforeChange = out.before;

    if (host.minimize) host.minimize();
    host = null;
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (host && host.minimize) host.minimize(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
