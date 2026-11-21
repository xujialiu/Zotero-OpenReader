(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.beta3Baseline;
  if (!baseline?.prefs || !baseline?.documentVoice || !baseline?.nativeVoices)
    throw new Error('Captured beta3 baseline is incomplete');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const itemA = state.fixtureA?.itemID,
    itemB = state.fixtureB?.itemID;
  if (!itemA || !itemB) throw new Error('Prepared fixture ids are missing');
  const prefix = 'extensions.zotero.zotero-tts.';
  const restore = (full, snapshot, kind) => {
    if (snapshot.user) {
      const setter = kind === 'string' ? 'setStringPref' : kind === 'int' ? 'setIntPref' : 'setBoolPref';
      Services.prefs[setter](full, snapshot.value);
    } else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
  };
  const main = Zotero.getMainWindow();
  if (main.windowState === 2) main.restore();
  main.focus();
  const prefWindow = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWindow) {
    prefWindow.close();
    for (let i = 0; i < 80 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  }
  const readers = Zotero.Reader?._readers ?? [];
  let spliced = 0;
  for (let i = readers.length - 1; i >= 0; i--)
    if (readers[i]?.itemID === itemA && readers[i]?._window?.closed) {
      readers.splice(i, 1);
      spliced++;
    }
  for (const reader of [...(Zotero.Reader?._readers ?? [])])
    if (reader?.itemID === itemB) {
      try {
        if (reader._internalReader?._state?.readAloudState?.popupOpen)
          reader._internalReader.toggleReadAloudPopup(false);
      } catch {}
      const pending = reader.close();
      if (pending && typeof pending.then === 'function') await pending;
    }
  for (let i = 0; i < 100 && (Zotero.Reader?._readers ?? []).some((r) => r?.itemID === itemB); i++) await sleep(50);
  if ((Zotero.Reader?._readers ?? []).some((r) => r?.itemID === itemB)) throw new Error('Fixture B did not close');

  const p = baseline.prefs;
  restore(prefix + 'webdav.enabled', p.webdav, 'bool');
  restore(prefix + 'cacheAudio', p.cacheAudio, 'bool');
  restore(prefix + 'fishspeech.enabled', p.fishEnabled, 'bool');
  restore(prefix + 'fishspeech.baseURL', p.fishURL, 'string');
  restore(prefix + 'fishspeech.headers', p.fishHeaders, 'string');
  restore(prefix + 'readAloud.volume', p.volume, 'int');
  restore(prefix + 'readAloud.speedPercent', p.speed, 'int');
  restore(prefix + 'readAloud.globalSpeed', p.globalSpeed, 'bool');
  restore(prefix + 'readAloud.defaultVoice', p.defaultVoice, 'string');
  if (baseline.nativeVoices.user) Services.prefs.setStringPref(baseline.nativeVoices.key, baseline.nativeVoices.value);
  else if (Services.prefs.prefHasUserValue(baseline.nativeVoices.key))
    Services.prefs.clearUserPref(baseline.nativeVoices.key);
  if (baseline.documentVoice.user)
    Services.prefs.setStringPref(baseline.documentVoice.pref, baseline.documentVoice.value);
  else if (Services.prefs.prefHasUserValue(baseline.documentVoice.pref))
    Services.prefs.clearUserPref(baseline.documentVoice.pref);

  const initialReaderIds = new Set((baseline.readers ?? []).map((r) => r.itemID));
  let liveA = (Zotero.Reader?._readers ?? []).find((r) => r?.itemID === itemA && !r?._window?.closed);
  for (const extra of [...(Zotero.Reader?._readers ?? [])])
    if (extra?.itemID === itemA && extra !== liveA) {
      try {
        const p = extra.close();
        if (p && typeof p.then === 'function') await p;
      } catch {}
    }
  if (initialReaderIds.has(itemA) && !liveA) {
    const opened = Zotero.Reader.open(itemA);
    if (opened && typeof opened.then === 'function') await opened;
    for (let i = 0; i < 200; i++) {
      liveA = (Zotero.Reader?._readers ?? []).find((r) => r?.itemID === itemA && r._internalReader);
      if (liveA) break;
      await sleep(100);
    }
  }
  if (initialReaderIds.has(itemA) && !liveA) throw new Error('Baseline fixture A reader did not return');
  if (!initialReaderIds.has(itemA) && liveA) {
    const pending = liveA.close();
    if (pending && typeof pending.then === 'function') await pending;
    liveA = null;
  }
  if (liveA) {
    const selectedItem = baseline.readers?.find((r) => r.selected)?.itemID;
    if (selectedItem === itemA) main.Zotero_Tabs.select(liveA.tabID);
  }
  let pagesRendered = false;
  if (liveA)
    for (let i = 0; i < 100; i++) {
      try {
        const doc = liveA._internalReader._primaryView._iframeWindow.document;
        const canvases = [...doc.querySelectorAll('.page canvas')];
        if (canvases.length && canvases.every((c) => c.width > 0 && c.height > 0)) {
          pagesRendered = true;
          break;
        }
      } catch {}
      await sleep(100);
    }
  // Memory is restored last, after the reader and its native per-language record are settled.
  restore(prefix + 'readAloud.memory', { value: p.memory.value, user: p.memory.user }, 'string');
  if (baseline.debugStoring !== undefined && !!Zotero.Debug?.storing !== !!baseline.debugStoring)
    Zotero.Debug.setStore(!!baseline.debugStoring);

  const get = (k) => Zotero.Prefs.get(prefix + k, true),
    has = (k) => Services.prefs.prefHasUserValue(prefix + k),
    parse = (s) => {
      try {
        return JSON.parse(s || '{}');
      } catch {
        return {};
      }
    };
  const mem = parse(get('readAloud.memory')),
    def = parse(get('readAloud.defaultVoice'));
  let savedDocument = null;
  try {
    savedDocument = JSON.parse(Services.prefs.getStringPref(baseline.documentVoice.pref, null) || '{}');
  } catch {}
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const finalReaders = (Zotero.Reader?._readers ?? []).map((r, index) => ({
    index,
    itemID: r.itemID,
    gone: Components.utils.isDeadWrapper(r._internalReader) || Components.utils.isDeadWrapper(r._iframeWindow),
  }));
  const mainBefore = {
    state: main.windowState,
    x: main.screenX,
    y: main.screenY,
    w: main.outerWidth,
    h: main.outerHeight,
    selected: main.Zotero_Tabs.selectedID,
  };
  const savedWindow = baseline.window;
  if (savedWindow) {
    if (main.windowState === 2) main.restore();
    await sleep(100);
    if (Number.isFinite(savedWindow.x) && Number.isFinite(savedWindow.y)) main.moveTo(savedWindow.x, savedWindow.y);
    if (Number.isFinite(savedWindow.w) && Number.isFinite(savedWindow.h)) main.resizeTo(savedWindow.w, savedWindow.h);
  }
  main.minimize();
  for (let i = 0; i < 40 && main.windowState !== 2; i++) await sleep(50);
  const out = {
    splicedDeadEntries: spliced,
    readers: finalReaders,
    otherReaders: finalReaders.filter((r) => r.itemID !== itemA && r.itemID !== itemB),
    fixturesRemain: !!Zotero.Items.get(itemA) && !!Zotero.Items.get(itemB),
    baselineReader: { itemID: itemA, selected: !!liveA && main.Zotero_Tabs.selectedID === liveA.tabID, pagesRendered },
    prefs: {
      webdav: { value: get('webdav.enabled'), user: has('webdav.enabled') },
      cacheAudio: { value: get('cacheAudio'), user: has('cacheAudio') },
      fishspeech: {
        enabled: get('fishspeech.enabled'),
        enabledUser: has('fishspeech.enabled'),
        addressMatchesBaseline: get('fishspeech.baseURL') === p.fishURL.value,
        addressUser: has('fishspeech.baseURL'),
        headersLength: String(get('fishspeech.headers') ?? '').length,
        headersUser: has('fishspeech.headers'),
      },
      volume: { value: get('readAloud.volume'), user: has('readAloud.volume') },
      memory: { voice: mem.voice?.id ?? null, lang: mem.voice?.lang ?? null, user: has('readAloud.memory') },
      defaultVoice: { voice: def.id ?? null, lang: def.lang ?? null, user: has('readAloud.defaultVoice') },
      speed: { value: get('readAloud.speedPercent'), user: has('readAloud.speedPercent') },
      globalSpeed: { value: get('readAloud.globalSpeed'), user: has('readAloud.globalSpeed') },
      documentVoice: {
        key: baseline.documentVoice.key,
        voice: savedDocument?.voice?.id ?? null,
        manual: savedDocument?.manual ?? null,
        user: Services.prefs.prefHasUserValue(baseline.documentVoice.pref),
      },
      nativeVoicesUser: Services.prefs.prefHasUserValue(baseline.nativeVoices.key),
    },
    positionFolder: position.folder,
    startup: { version: startup.version, failed: startup.failed },
    debugStoring: !!Zotero.Debug?.storing,
    mainBefore,
    mainAfter: {
      state: main.windowState,
      x: main.screenX,
      y: main.screenY,
      w: main.outerWidth,
      h: main.outerHeight,
      selected: main.Zotero_Tabs.selectedID,
    },
    settingsOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
  };
  state.beta3FinalRestore = out;
  return JSON.stringify(out);
})();
