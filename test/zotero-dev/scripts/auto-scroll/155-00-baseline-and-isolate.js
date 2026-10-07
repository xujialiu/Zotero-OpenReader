// Issue #155 run, baseline and isolation (2026-09-29, 1.16.2-beta2).
// Runs before the install: snapshots the state this pass may touch, verifies
// the test WebDAV destination from ~/.secrets/Zotero-TTS/test_webdav.txt,
// suspends the three sync switches, and minimizes the host window.
// Secret-valued prefs are reported as presence/length only.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const read = name => {
    const key = name === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + name;
    const type = p.getPrefType(key);
    const hasUser = p.prefHasUserValue(key);
    let value = null;
    if (type === p.PREF_BOOL) value = p.getBoolPref(key);
    else if (type === p.PREF_INT) value = p.getIntPref(key);
    else if (type === p.PREF_STRING) value = p.getStringPref(key);
    return { key, type, hasUser, value };
  };
  const plain = name => ({ ...read(name), value: undefined });
  const names = [
    'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
    'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    'readAloud.readingLine', 'readAloud.autoScrollMode', 'readAloud.keepFollowingWhileVisible',
    'readAloud.playerLayout', 'shortcuts.toggleAutoScroll',
    'readAloud.volume', 'readAloud.memory', 'reader.readAloudVoices',
  ];
  const baseline = {};
  for (const name of names) baseline[name] = read(name);
  // What the report may show: the memory's voice id and the voices map by hash
  let memoryVoice = null, memoryChars = null, voicesHash = null, voicesChars = null;
  try {
    memoryChars = String(baseline['readAloud.memory'].value ?? '').length;
    memoryVoice = JSON.parse(String(baseline['readAloud.memory'].value)).voice?.id ?? null;
  } catch (e) {}
  try {
    const raw = String(baseline['reader.readAloudVoices'].value ?? '');
    voicesChars = raw.length;
    voicesHash = await (async () => {
      const converter = Components.classes['@mozilla.org/security/hash;1']
        .createInstance(Components.interfaces.nsICryptoHash);
      converter.init(converter.SHA256);
      const bytes = new TextEncoder().encode(raw);
      converter.update(bytes, bytes.length);
      const hex = b => b.toString(16).padStart(2, '0');
      return converter.finish(false).split('').map(hex).join('');
    })();
  } catch (e) {}

  // The two fixtures this kit drives, and what restoration needs from each
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params;
  const fixtures = {};
  for (const slot of [['pdf', params.pdfItemID], ['epub', params.epubItemID]]) {
    const [kind, itemID] = slot;
    const item = Zotero.Items.get(itemID);
    if (!item) { fixtures[kind] = { itemID, present: false }; continue; }
    const parent = item.parentItem ?? item;
    const entry = {
      itemID, present: true, libraryID: item.libraryID, key: item.key,
      title: parent.getField('title') ?? null,
      openInTab: (Zotero.Reader._readers ?? []).some(r => r && r.itemID === itemID),
    };
    try {
      entry.nativePageIndex = item.getAttachmentLastPageIndex?.() ?? null;
      entry.nativeReadAloudPosition = item.getAttachmentLastReadAloudPosition?.() ?? null;
      const dir = Zotero.Attachments.getStorageDirectory(item);
      const file = dir.clone(); file.append('.zotero-reader-state');
      entry.stateFileExists = await IOUtils.exists(file.path);
      entry.stateFileBytes = entry.stateFileExists ? (await IOUtils.readUTF8(file.path)).length : null;
      entry.stateFile = entry.stateFileExists ? await IOUtils.readUTF8(file.path) : null;
    } catch (e) { entry.snapshotError = String(e); }
    fixtures[kind] = entry;
  }

  // Test WebDAV: read the dedicated destination, prove the effective URL matches
  const home = Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
  const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
  let configText;
  try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (e) { throw new Error('test WebDAV config unavailable'); }
  if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');
  const trimSlash = value => { let out = String(value); while (out.endsWith('/')) out = out.slice(0, -1); return out; };

  // Settle pending writes before anything is suspended or switched
  const d = Zotero.ZoteroTTS?.diagnostics;
  const settledBefore = d ? await waitFor(async () => {
    try {
      const position = JSON.parse(await d.position());
      const sync = JSON.parse(await d.positionSync());
      const settings = JSON.parse(await d.settingsSync());
      const upload = JSON.parse(await d.settingsUpload());
      return position.store?.queued === 0 && position.store?.writing === false && position.store?.lastError === null
        && sync.transport?.running === false && sync.shared?.transport?.running === false
        && settings.transport?.pendingChange === false && settings.transport?.running === false
        && upload.autoUpload?.pending === false;
    } catch (e) { return false; }
  }) : 'no diagnostics';
  if (settledBefore !== true) throw new Error('WebDAV transports did not settle before isolation: ' + JSON.stringify(settledBefore));

  for (const name of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + name, false);
  p.setStringPref(prefix + 'webdav.url', configText);
  const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
  if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');

  // Host window: snapshot, then minimize for the bridge-only work
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host ? {
    windowState: host.windowState, screenX: host.screenX, screenY: host.screenY,
    outerWidth: host.outerWidth, outerHeight: host.outerHeight,
    selectedTab: host.Zotero_Tabs?.selectedID ?? null,
  } : null;
  if (host?.minimize) host.minimize();
  else if (host) host.windowState = host.STATE_MINIMIZED;
  await sleep(700);

  // Readers already open: observed, never operated
  const readersBefore = [];
  for (const reader of Zotero.Reader?._readers || []) {
    if (!reader) continue;
    const manager = reader._internalReader?._readAloudManager;
    const item = Zotero.Items.get(reader.itemID);
    readersBefore.push({
      itemID: reader.itemID,
      title: (item?.parentItem ?? item)?.getField?.('title') ?? null,
      active: !!manager?.active, paused: manager ? !!manager.paused : null,
      popupOpen: !!reader._internalReader?.popupOpen,
    });
  }
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');

  state.baseline = baseline;
  state.fixtures = fixtures;
  state.hostBefore = hostBefore;
  state.readersBefore = readersBefore;
  state.memoryVoiceSafe = typeof memoryVoice === 'string' && memoryVoice.includes('::');
  state.debugStoringBefore = !!Zotero.Debug?.storing;
  if (!state.debugStoringBefore) { try { Zotero.Debug.setStore(true); } catch (e) {} }
  return JSON.stringify({
    zoteroVersion: Services.appinfo.version + ' / ' + (Zotero.version ?? '?'),
    pluginPrefs: {
      readingLine: { value: baseline['readAloud.readingLine'].value, user: baseline['readAloud.readingLine'].hasUser },
      autoScrollMode: { value: baseline['readAloud.autoScrollMode'].value, user: baseline['readAloud.autoScrollMode'].hasUser },
      keepFollowingWhileVisible: { value: baseline['readAloud.keepFollowingWhileVisible'].value, user: baseline['readAloud.keepFollowingWhileVisible'].hasUser },
      playerLayout: { value: baseline['readAloud.playerLayout'].value, user: baseline['readAloud.playerLayout'].hasUser },
      toggleAutoScroll: { value: baseline['shortcuts.toggleAutoScroll'].value, user: baseline['shortcuts.toggleAutoScroll'].hasUser },
      volume: { value: baseline['readAloud.volume'].value, user: baseline['readAloud.volume'].hasUser },
    },
    memoryVoice: state.memoryVoiceSafe ? memoryVoice : 'unsafe:' + (memoryVoice ? String(memoryVoice).length + 'chars' : 'none'),
    memoryChars, voicesHash, voicesChars,
    webdav: {
      switches: { positions: baseline['webdav.syncPositions'].value, autoUpload: baseline['webdav.autoUploadSettings'].value, settings: baseline['webdav.syncSettings'].value },
      destinationMatched, urlChars: String(baseline['webdav.url'].value ?? '').length,
      configChars: configText.length,
    },
    fixtures: {
      pdf: { present: fixtures.pdf?.present, itemID: params.pdfItemID, title: fixtures.pdf?.title, openInTab: fixtures.pdf?.openInTab, stateFileExists: fixtures.pdf?.stateFileExists, nativePageIndex: fixtures.pdf?.nativePageIndex, snapshotError: fixtures.pdf?.snapshotError },
      epub: { present: fixtures.epub?.present, itemID: params.epubItemID, title: fixtures.epub?.title, openInTab: fixtures.epub?.openInTab, stateFileExists: fixtures.epub?.stateFileExists, snapshotError: fixtures.epub?.snapshotError },
    },
    readersBefore, settingsWindowOpen: !!prefWin,
    debugStoringBefore: state.debugStoringBefore,
    hostMinimized: host ? host.windowState === 2 : null,
  });
})()
