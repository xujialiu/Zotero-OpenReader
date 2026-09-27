(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 24000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readTyped = key => {
    const type = prefs.getPrefType(key), user = prefs.prefHasUserValue(key);
    let value = null;
    try {
      if (type === prefs.PREF_BOOL) value = prefs.getBoolPref(key);
      else if (type === prefs.PREF_INT) value = prefs.getIntPref(key);
      else if (type === prefs.PREF_STRING) value = prefs.getStringPref(key);
    } catch (_) {}
    return { type, user, value };
  };
  const readerOf = itemID => {
    for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === itemID) return reader;
    return null;
  };
  const focus = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const openReader = async fixture => {
    const opened = Zotero.Reader.open(fixture.id, null, { openInBackground: false, allowDuplicate: false });
    if (opened?.then) await opened;
    const reader = await waitFor(() => {
      const candidate = readerOf(fixture.id);
      return candidate?._internalReader?._readAloudManager ? candidate : null;
    });
    if (!reader) throw new Error('reader did not initialize for ' + fixture.title);
    focus(reader);
    return reader;
  };
  const diag = itemID => {
    try {
      const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      for (const row of report.readers || []) if (row?.itemID === itemID) return row;
    } catch (_) {}
    return null;
  };
  const fixtureFromFile = async (file, title, relative) => {
    const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    return { id: item.id, key: item.key, title: item.getField('title'), relative };
  };
  const runTag = String(params.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const tempKeys = [
    'fish.enabled', 'system.enabled', 'local.enabled', 'local.baseURL', 'local.voice', 'local.headers',
    'prefetchEnabled', 'readAloud.volume', 'readAloud.remainingTime', 'readAloud.sameForAllDocuments',
    'readAloud.defaultVoice', 'readAloud.memory', 'readAloud.globalSpeed', 'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs', 'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
  ];
  state.tempPrefs = state.tempPrefs || {};
  for (const suffix of tempKeys) if (!state.tempPrefs[suffix]) state.tempPrefs[suffix] = readTyped(prefix + suffix);
  state.tempNative = state.tempNative || readTyped('extensions.zotero.reader.readAloudVoices');

  // All playback in this kit is muted. The original value is in tempPrefs and
  // is restored by 99-cleanup-restore.js.
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  prefs.setBoolPref(prefix + 'readAloud.remainingTime', true);
  prefs.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
  prefs.setBoolPref(prefix + 'fish.enabled', false);
  prefs.setBoolPref(prefix + 'system.enabled', false);
  prefs.setBoolPref(prefix + 'local.enabled', true);
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  prefs.setStringPref(prefix + 'local.voice', 'af_bella');
  prefs.setStringPref(prefix + 'local.headers', '');
  prefs.setBoolPref(prefix + 'prefetchEnabled', false);
  const deterministicMemory = JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } });
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', deterministicMemory);
  prefs.setStringPref(prefix + 'readAloud.memory', deterministicMemory);
  // The native memory can name a different local voice than the plugin
  // memory. Seed only the temporary English local lane with Bella so the
  // deterministic fixture starts from a known voice; cleanup restores the
  // complete native value byte-for-byte.
  try {
    const nativeKey = 'extensions.zotero.reader.readAloudVoices';
    const native = JSON.parse(prefs.getStringPref(nativeKey));
    if (native?.en && typeof native.en === 'object') {
      native.en.voice = 'local::af_bella';
      native.en.tierVoices = { ...(native.en.tierVoices || {}), local: 'local::af_bella', kokoro: 'local::af_bella' };
      prefs.setStringPref(nativeKey, JSON.stringify(native));
    }
  } catch (_) {}

  const fixturesDir = params.fixturesDir;
  const deterministicPath = PathUtils.join(fixturesDir, 'remaining-time', 'remaining-time.epub');
  const deterministic = await fixtureFromFile(
    await IOUtils.getFile(deterministicPath),
    'Zotero-TTS remaining-time beta12 deterministic ' + runTag,
    'remaining-time/remaining-time.epub',
  );
  const allItems = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
  let original = null;
  for (const item of allItems) if (item.getField('title') === 'Four Thousand Weeks') { original = item; break; }
  if (!original) throw new Error('Four Thousand Weeks title was not found');
  const attachments = original.getAttachments();
  let sourceAttachment = null;
  for (const id of attachments || []) {
    const candidate = Zotero.Items.get(id);
    if (candidate?.isEPUBAttachment?.() || /epub/i.test(candidate?.attachmentContentType || '')) { sourceAttachment = candidate; break; }
  }
  if (!sourceAttachment) throw new Error('Four Thousand Weeks EPUB attachment was not found');
  const sourceFile = sourceAttachment.getFile();
  if (!sourceFile?.exists?.()) throw new Error('Four Thousand Weeks EPUB file is unavailable');
  const bookCopy = await fixtureFromFile(
    sourceFile,
    'Zotero-TTS remaining-time beta12 body-copy ' + runTag,
    'Four Thousand Weeks (title/path copy)',
  );
  state.fixtures = state.fixtures || {};
  state.fixtures.epub = deterministic;
  state.fixtures.book = bookCopy;

  const deterministicReader = await openReader(deterministic);
  const deterministicInternal = deterministicReader._internalReader;
  if (!deterministicInternal._state?.readAloudState?.popupOpen) deterministicInternal.toggleReadAloudPopup(true);
  const deterministicManager = deterministicInternal._readAloudManager;
  const deterministicVoice = await waitFor(() => {
    const voices = deterministicManager?.allVoices || [];
    for (let i = 0; i < Number(voices.length || 0); i++) if (String(voices[i]?.id || '') === 'local::af_bella') return voices[i];
    return null;
  }, 15000);
  if (!deterministicVoice) throw new Error('deterministic local voice was not offered');
  if (typeof deterministicManager.selectTier === 'function') await deterministicManager.selectTier(String(deterministicVoice.tier || 'kokoro'));
  if (typeof deterministicManager.selectVoice === 'function') await deterministicManager.selectVoice('local::af_bella');
  await waitFor(() => deterministicManager?.active ? deterministicManager : null);
  if (!deterministicManager?.active) throw new Error('deterministic manager did not activate');
  if (!deterministicManager.paused) deterministicManager.pause();
  await waitFor(() => deterministicManager.paused === true, 5000);
  if (!diag(deterministic.id)) throw new Error('deterministic diagnostic session did not appear');

  // The body index is found from the temporary copy's real text. The opening
  // title/contents runs are deliberately skipped for stability evidence.
  const bookReader = await openReader(bookCopy);
  const bookInternal = bookReader._internalReader;
  const bookManager = bookInternal._readAloudManager;
  if (!bookInternal._state?.readAloudState?.popupOpen) bookInternal.toggleReadAloudPopup(true);
  await waitFor(() => bookManager?.active ? bookManager : null);
  const bookVoice = await waitFor(() => {
    const voices = bookManager?.allVoices || [];
    for (let i = 0; i < Number(voices.length || 0); i++) if (String(voices[i]?.id || '') === 'local::af_bella') return voices[i];
    return null;
  }, 15000);
  if (!bookVoice) throw new Error('body-copy local voice was not offered');
  if (typeof bookManager.selectTier === 'function') await bookManager.selectTier(String(bookVoice.tier || 'kokoro'));
  if (typeof bookManager.selectVoice === 'function') await bookManager.selectVoice('local::af_bella');
  await waitFor(() => (bookInternal._readAloudSegments?.segments || []).length ? bookManager : null, 15000);
  const bodySegments = bookInternal._readAloudSegments?.segments || [];
  if (!bodySegments.length) throw new Error('Four Thousand Weeks has no Read Aloud segments');
  let bodyIndex = -1;
  const candidates = [];
  for (let i = 0; i < bodySegments.length; i++) {
    const text = String(bodySegments[i]?.text || '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (i >= 116 && words.length >= 8) candidates.push({ index: i, words: words.length, text: text.slice(0, 120) });
  }
  for (const candidate of candidates) if (/average human lifespan/i.test(candidate.text)) { bodyIndex = candidate.index; break; }
  if (bodyIndex < 0 && candidates.length) bodyIndex = candidates[0].index;
  if (bodyIndex < 0) throw new Error('Four Thousand Weeks body prose candidate was not found');
  state.docSamples = { bodyIndex, candidates: candidates.slice(0, 8), segmentCount: bodySegments.length };
  try { bookManager.repositionTo(bodyIndex); } catch (error) { throw new Error('body reposition failed: ' + String(error)); }
  await sleep(300);
  if (bookManager.active && !bookManager.paused) bookManager.pause();
  await waitFor(() => bookManager.paused === true, 5000);
  state.docSegments = { count: bodySegments.length, bodyIndex, bodyText: String(bodySegments[bodyIndex]?.text || '').slice(0, 200) };

  const host = Zotero.getMainWindow();
  host?.minimize?.();
  return JSON.stringify({
    step: 'stable-time-fixtures',
    deterministic: { id: deterministic.id, key: deterministic.key, segments: deterministicInternal._readAloudSegments?.segments?.length || 0, paused: deterministicManager.paused },
    bookCopy: { id: bookCopy.id, key: bookCopy.key, segments: bodySegments.length, bodyIndex, bodyText: String(bodySegments[bodyIndex]?.text || '').slice(0, 120), paused: bookManager.paused },
    originalLookup: { title: original.getField('title'), attachment: sourceAttachment.getField('title'), contentType: sourceAttachment.attachmentContentType },
  }, null, 1);
})()
