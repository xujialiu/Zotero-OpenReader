(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const pref = suffix => prefix + suffix;
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const diag = itemID => {
    let report;
    try { report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); } catch (error) { return { error: String(error) }; }
    const rows = report.readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i];
    return null;
  };
  const select = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); } catch (_) {}
    try { reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const waitReader = async itemID => await waitFor(() => {
    const reader = readerOf(itemID);
    return reader?._internalReader?._readAloudManager ? reader : null;
  }, 24000);
  const openSession = async (item, label) => {
    const opened = Zotero.Reader.open(item.id, null, { openInBackground: false, allowDuplicate: false });
    if (opened?.then) await opened;
    const reader = await waitReader(item.id);
    if (!reader) throw new Error(label + ' reader/manager did not initialize');
    select(reader);
    const internal = reader._internalReader;
    const manager = internal._readAloudManager;
    // Temporarily leave only the deterministic local provider in the list.
    // This prevents a saved Fish/System choice from starting metered audio
    // while the new reader builds its asynchronous voice list.
    prefs.setBoolPref(pref('fish.enabled'), false);
    prefs.setBoolPref(pref('system.enabled'), false);
    const popup = internal._state?.readAloudState?.popupOpen;
    if (!popup) internal.toggleReadAloudPopup(true);
    const target = await waitFor(() => {
      const voices = manager.allVoices || [];
      for (let i = 0; i < Number(voices.length || 0); i++) {
        const voice = voices[i];
        if (String(voice?.id || '') === 'local::af_bella') return voice;
      }
      return null;
    }, 15000);
    if (!target) throw new Error(label + ' deterministic local voice was not offered');
    const tier = String(target.tier || target.provider?.id || 'kokoro');
    if (typeof manager.selectTier === 'function') await manager.selectTier(tier);
    if (typeof manager.selectVoice === 'function') await manager.selectVoice('local::af_bella');
    await waitFor(() => String(manager.selectedVoiceID || '') === 'local::af_bella', 6000);
    const active = await waitFor(() => manager.active && (manager._controller || manager._segments?.length) ? manager : null, 24000);
    if (!active) throw new Error(label + ' Read Aloud session did not start');
    const pluginVoice = String(manager.selectedVoiceID || '').includes('::');
    if (!pluginVoice) throw new Error(label + ' selected a non-plugin voice; refusing metered playback');
    // Let the deterministic server supply at least one clip so the estimate
    // moves from the text prior to a measured finite value, then pause.
    const ready = await waitFor(() => {
      const row = diag(item.id);
      return row?.session?.remainingTime?.status === 'ready' ? row : null;
    }, 18000);
    if (manager.active && !manager.paused) manager.pause();
    await waitFor(() => manager.paused, 3000);
    return { reader, manager, diag: ready || diag(item.id), pluginVoice };
  };
  const importFixture = async (relative, title) => {
    const parts = String(relative).split('/');
    const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(params.fixturesDir, ...parts), libraryID: Zotero.Libraries.userLibraryID, title });
    const record = { id: item.id, key: item.key, title: item.getField('title'), relative };
    return { item, record };
  };
  const closeSession = async reader => {
    if (!reader) return;
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await waitFor(() => !reader._internalReader?._state?.readAloudState?.popupOpen && !reader._internalReader?._readAloudManager?.active, 6000, 80);
    try { reader.close?.(); } catch (_) {}
    await waitFor(() => !readerOf(reader.itemID), 10000, 100);
  };
  const out = { step: 'epub-scope-and-fallback', closedOwnerReaders: [], epub: {}, controlled: {}, pdf: {} };

  // Keep the database row count for cleanup verification. This belongs here
  // because the retained baseline script predates the position-count field.
  try {
    state.positionBefore = await Zotero.ZoteroTTS.diagnostics.position();
    state.posBeforeRows = JSON.parse(state.positionBefore)?.database?.rows ?? null;
  } catch (error) { throw new Error('position baseline failed: ' + String(error)); }

  // The owner left a paused player open. Close it only because this check must
  // change voice/provider settings; never reopen it later.
  const before = state.isolation?.readersBefore || [];
  for (let i = 0; i < before.length; i++) {
    const entry = before[i];
    if (!entry.active) continue;
    const owner = readerOf(entry.itemID);
    if (!owner) continue;
    try { owner._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await waitFor(() => !owner._internalReader?._state?.readAloudState?.popupOpen && !owner._internalReader?._readAloudManager?.active, 6000, 80);
    out.closedOwnerReaders.push({ itemID: entry.itemID, tabID: entry.tabID, wasPaused: entry.paused, popupWasOpen: entry.popupOpen });
  }

  // Deterministic local provider: fixed three-second WAV and fixed word times.
  prefs.setBoolPref(pref('local.enabled'), true);
  prefs.setStringPref(pref('local.baseURL'), String(params.deterministicBaseURL));
  prefs.setStringPref(pref('local.voice'), 'af_bella');
  prefs.setStringPref(pref('local.headers'), '');
  prefs.setBoolPref(pref('prefetchEnabled'), false);
  const deterministicMemory = JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' }});
  prefs.setStringPref(pref('readAloud.defaultVoice'), deterministicMemory);
  prefs.setStringPref(pref('readAloud.memory'), deterministicMemory);
  prefs.setBoolPref(pref('readAloud.remainingTime'), true);
  prefs.setIntPref(pref('readAloud.volume'), 0);

  const runTag = String(params.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const epub = await importFixture('remaining-time/remaining-time.epub', 'Zotero-TTS #150 remaining-time EPUB ' + runTag);
  state.fixtures = state.fixtures || {};
  state.fixtures.epub = epub.record;
  const epubSession = await openSession(epub.item, 'EPUB');
  const er = epubSession.reader;
  const ei = er._internalReader;
  const segments = ei._readAloudSegments?.segments || [];
  if (!segments.length) throw new Error('EPUB has no Read Aloud segments');
  let outline = null;
  try { outline = JSON.parse(JSON.stringify(ei._sdt?.structure?.catalog?.outline || null)); } catch (_) { outline = null; }
  out.epub.segments = segments.length;
  out.epub.outline = outline;
  out.epub.initial = diag(epub.item.id)?.session?.remainingTime || null;
  const indexWith = text => { for (let i = 0; i < segments.length; i++) if (String(segments[i]?.text || '').includes(text)) return i; return -1; };
  const part1Chapter1 = indexWith('Part 1, chapter 1,');
  const part1Chapter2 = indexWith('Part 1, chapter 2,');
  const part2Chapter1 = indexWith('Part 2, chapter 1,');
  const part2Chapter2 = indexWith('Part 2, chapter 2,');
  const part2 = part2Chapter1;
  if (segments.length !== 180 || part1Chapter1 !== 0 || part1Chapter2 < 1 || part2 !== 90 || part2Chapter2 <= part2) {
    throw new Error('EPUB boundaries were not segmented as expected: ' + JSON.stringify({ segments: segments.length, part1Chapter1, part1Chapter2, part2Chapter1, part2Chapter2 }));
  }
  const move = async index => {
    const m = ei._readAloudManager;
    if (!m.active) throw new Error('EPUB manager became inactive before boundary move');
    try { m.repositionTo(index); } catch (error) { throw new Error('repositionTo(' + index + ') failed: ' + String(error)); }
    await sleep(250);
    if (m.active && !m.paused) m.pause();
    await waitFor(() => m.paused, 3000, 50);
    return diag(epub.item.id)?.session?.remainingTime || null;
  };
  out.epub.boundaries = {
    part1Chapter1Start: { index: part1Chapter1, snapshot: await move(part1Chapter1) },
    part1Chapter2Start: { index: part1Chapter2, snapshot: await move(part1Chapter2) },
    part1BeforePart2: { index: part2 - 1, snapshot: await move(part2 - 1) },
    part2Chapter1Start: { index: part2Chapter1, snapshot: await move(part2Chapter1) },
    part2Chapter2Start: { index: part2Chapter2, snapshot: await move(part2Chapter2) },
    documentEnd: { index: segments.length - 1, snapshot: await move(segments.length - 1) },
  };
  out.epub.positionTexts = {
    part1Chapter1: String(segments[part1Chapter1]?.text || '').slice(0, 120),
    part1Chapter2: String(segments[part1Chapter2]?.text || '').slice(0, 120),
    part2Chapter1: String(segments[part2Chapter1]?.text || '').slice(0, 120),
    part2Chapter2: String(segments[part2Chapter2]?.text || '').slice(0, 120),
  };
  const b = out.epub.boundaries;
  const snapshots = Object.values(b).map(value => value.snapshot);
  if (!snapshots.every(value => value?.status === 'ready' && value.scope === 'document')) throw new Error('EPUB boundary estimates were not ready/document scope');
  const expectedTitles = {
    part1Chapter1Start: 'Chapter 1', part1Chapter2Start: 'Chapter 2', part1BeforePart2: 'Chapter 2',
    part2Chapter1Start: 'Chapter 1', part2Chapter2Start: 'Chapter 2', documentEnd: 'Chapter 2',
  };
  for (const [name, expected] of Object.entries(expectedTitles)) {
    if (b[name].snapshot.sectionTitle !== expected) throw new Error('nested section title mismatch at ' + name + ': ' + JSON.stringify(b[name].snapshot));
  }
  for (const value of snapshots) if (!(value.sectionSeconds <= value.seconds)) throw new Error('sectionSeconds exceeded document seconds');
  if (b.documentEnd.snapshot.sectionSeconds !== b.documentEnd.snapshot.seconds) throw new Error('last heading did not extend to document end: ' + JSON.stringify(b.documentEnd.snapshot));

  // The retained EPUB has no introductory text before its first child. Use a
  // controlled outline to exercise parent and nested introductions, then
  // restore the original outline before the fallback fixture is opened.
  const structure = Components.utils.waiveXrays(ei._sdt.structure);
  const originalOutline = structure.catalog.outline;
  // Native EPUB outlines use a page-only SDT ref. Choose segment indices at
  // page starts so controlled entries do not land inside a segment.
  const refAt = index => {
    const start = segments[index]?.position?.start;
    return start?.length ? [Number(start[0])] : null;
  };
  const outlineEntry = (title, index, children = []) => ({ title, ref: refAt(index), children });
  const setOutline = value => { structure.catalog.outline = Components.utils.cloneInto(value, er._iframeWindow); };
  const restoreOutline = () => { structure.catalog.outline = originalOutline; };
  try {
    const controlledOutline = [outlineEntry('Parent introduction', 0, [outlineEntry('Child introduction', 3, [outlineEntry('Grandchild', 6)]), outlineEntry('Child 2', 9)]), outlineEntry('Tail', 12)];
    setOutline(controlledOutline);
    const controlled = {};
    for (const [name, index] of [['parentIntro', 0], ['childIntro', 3], ['grandchild', 6], ['child2', 9], ['tail', 12]]) controlled[name] = { index, snapshot: await move(index) };
    out.controlled.introductions = controlled;
    const introTitles = ['Parent introduction', 'Child introduction', 'Grandchild', 'Child 2', 'Tail'];
    if (!introTitles.every((title, i) => controlled[Object.keys(controlled)[i]].snapshot?.sectionTitle === title)) throw new Error('controlled introduction boundaries did not follow depth-first headings: ' + JSON.stringify(controlled));

    const invalidCases = [
      { name: 'unresolvedRef', outline: [outlineEntry('Unresolved', 999999)] },
      { name: 'unorderedRefs', outline: [outlineEntry('Later', 20), outlineEntry('Earlier', 10)] },
      { name: 'segmentCrossingRef', outline: [{ title: 'Crossing', ref: JSON.parse(JSON.stringify(segments[0]?.position?.end)), children: [] }] },
    ];
    for (const item of invalidCases) {
      setOutline(item.outline);
      const snapshot = await move(0);
      out.controlled[item.name] = { snapshot, documentOnly: snapshot?.scope === 'document' && snapshot?.sectionTitle === undefined && snapshot?.sectionSeconds === undefined };
      if (!out.controlled[item.name].documentOnly) throw new Error(item.name + ' unexpectedly exposed section time: ' + JSON.stringify(snapshot));
    }
  } finally { restoreOutline(); }
  await move(part1Chapter1);

  // An outline-free PDF must retain document scope while still estimating.
  const pdf = await importFixture('fixture-a.pdf', 'Zotero-TTS #150 remaining-time PDF ' + runTag);
  state.fixtures.pdf = pdf.record;
  const pdfSession = await openSession(pdf.item, 'PDF');
  out.pdf.segments = pdfSession.reader._internalReader?._readAloudSegments?.segments?.length || 0;
  out.pdf.remaining = diag(pdf.item.id)?.session?.remainingTime || null;
  const outlineMarkers = (() => { try { return JSON.parse(JSON.stringify(pdfSession.reader._internalReader?._sdt?.structure?.catalog?.outline || null)); } catch (_) { return null; } })();
  out.pdf.outline = outlineMarkers;
  if (out.pdf.remaining?.scope !== 'document' || out.pdf.remaining?.sectionTitle !== undefined || out.pdf.remaining?.sectionSeconds !== undefined) throw new Error('outline-free PDF exposed section estimate: ' + JSON.stringify(out.pdf.remaining));
  state.scopeResults = out;
  return JSON.stringify(out, null, 1);
})()
