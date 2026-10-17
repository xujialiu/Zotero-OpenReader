// Items 6.22/6.25/6.26 + 6.23/6.24 (issues #184, #205, #203, #192, #193),
// 1.16.12-beta2: "Test WebDAV first" opener, run BEFORE the build is installed.
// Adapted from the executed late-audio/70-webdav-isolate.js (2026-10-01, proven
// pattern): typed snapshot of the WebDAV settings and of every pref the run may
// touch, transports settled, sync/backup suspended, webdav.url moved to the
// dedicated test configuration (~/.secrets/Zotero-TTS/test_webdav.txt, contents
// never reported), destination confirmed (pref string + effective client URL,
// match results only), THEN the switch under test (webdav.syncSettings) on and
// its seeding sync waited out, the shared file's baseline captured (exact text
// kept in state only), the real Azure key kept in state only, volume muted.
// State: Zotero.ZoteroTTSRun.state.isolate / .fileBaselineText / .realAzureKey.
(async () => {
  const out = { step: 'isolate-and-baseline' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const Ci = Components.interfaces;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, stepMs = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const readTyped = (key) => {
    const type = p.getPrefType(key);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(key);
      else if (type === p.PREF_INT) value = p.getIntPref(key);
      else if (type === p.PREF_STRING) value = p.getStringPref(key);
    } catch (_) {}
    return { key, type, user: p.prefHasUserValue(key), value };
  };

  const S = Zotero.ZoteroTTSRun.state;
  try {
    // --- Typed snapshot of the settings this run may touch. ---
    const named = [
      'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
      'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
      'fishspeech.baseURL', 'fishspeech.enabled', 'fishspeech.headers',
      'azure.apiKey', 'azure.enabled', 'readAloud.volume',
    ];
    const baseline = {};
    for (const suffix of named) baseline[suffix] = readTyped(prefix + suffix);
    baseline['sync.autoSync'] = readTyped('extensions.zotero.sync.autoSync'); // recorded only, not changed
    const secret = (suffix) => /(?:password|username|url|machineId|syncState|apiKey|headers)$/.test(suffix);
    const safeSnapshot = {};
    for (const [suffix, rec] of Object.entries(baseline)) {
      safeSnapshot[suffix] = secret(suffix)
        ? { type: rec.type, user: rec.user, chars: typeof rec.value === 'string' ? rec.value.length : null }
        : { type: rec.type, user: rec.user, value: rec.value };
    }
    S.isolate = { baseline: {} };
    S.isolate.baseline = baseline;
    out.baseline = safeSnapshot;

    // The real Azure key stays in memory only (issue #68, 3.20: the adoption
    // overwrites the local pref and it cannot be read back afterwards).
    S.realAzureKey = typeof baseline['azure.apiKey'].value === 'string' ? baseline['azure.apiKey'].value : '';
    out.azure = { keyChars: S.realAzureKey.length, enabledAtBaseline: baseline['azure.enabled'].value };

    // --- The dedicated test configuration file. ---
    const home = Services.dirsvc.get('Home', Ci.nsIFile).path;
    const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
    let configText;
    try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (_) { throw new Error('test WebDAV config unavailable'); }
    if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');

    // --- The plugin's own add-on record before the install. ---
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addons = await AddonManager.getAllAddons();
    let ttsBefore = null;
    for (const addon of addons) {
      if (addon.id === 'zotero-tts@xujialiu.top') ttsBefore = { version: addon.version, active: !!addon.isActive };
    }
    S.ttsBefore = ttsBefore;
    out.ttsBefore = ttsBefore;

    // --- Settle every WebDAV transport before touching destinations. ---
    const diagnostics = Zotero.ZoteroTTS && Zotero.ZoteroTTS.diagnostics;
    if (!diagnostics) throw new Error('Zotero.ZoteroTTS.diagnostics missing before install');
    const settled = await waitFor(async () => {
      const position = JSON.parse(await diagnostics.position());
      const sync = JSON.parse(await diagnostics.positionSync());
      const settings = JSON.parse(await diagnostics.settingsSync());
      const upload = JSON.parse(await diagnostics.settingsUpload());
      return position.store && position.store.queued === 0 && position.store.writing === false && position.store.lastError === null
        && sync.transport && sync.transport.running === false
        && settings.transport && settings.transport.pendingChange === false && settings.transport.running === false
        && upload.autoUpload && upload.autoUpload.pending === false;
    });
    if (!settled) throw new Error('WebDAV transports did not settle before destination isolation');
    out.transportsSettledBefore = true;

    // --- Suspend automatic sync/backup, move the destination, confirm it. ---
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + suffix, false);
    p.setStringPref(prefix + 'webdav.url', configText);
    const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
    const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
    if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');
    // The effective destination: the URL the client itself normalizes to.
    const files = JSON.parse(await diagnostics.settingsFiles());
    const effectiveDestinationMatched = !files.error && typeof files.url === 'string'
      && trimSlash(files.url) === trimSlash(configText) + '/' ? true : trimSlash(files.url) === trimSlash(configText);
    if (!effectiveDestinationMatched) throw new Error('effective client destination does not match the test configuration');
    S.destinationMatched = true;
    out.webdav = { configAvailable: true, destinationMatched, effectiveDestinationMatched, configChars: configText.length };

    // --- The shared file's baseline, on the test folder. ---
    const url = trimSlash(configText) + '/zotero-tts-shared-settings.json';
    const auth = baseline['webdav.username'].value
      ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${baseline['webdav.username'].value}:${baseline['webdav.password'].value || ''}`))) }
      : {};
    let fileText = null;
    try {
      const response = await fetch(url, { method: 'GET', headers: { ...auth, cache: 'no-store' } });
      if (response.ok) fileText = await response.text();
      else if (response.status !== 404) throw new Error(`unexpected GET status ${response.status}`);
    } catch (e) { throw new Error(`baseline GET failed: ${e}`); }
    S.fileBaselineText = fileText; // exact text, memory only
    let fileKeys = null;
    if (fileText !== null) {
      try { fileKeys = JSON.parse(fileText).items.map((i) => ({ key: i.key, ts: i.ts, by: i.by })); } catch (_) { fileKeys = 'unreadable'; }
    }
    out.fileBaseline = { existed: fileText !== null, chars: fileText === null ? 0 : fileText.length, items: fileKeys };

    // --- The switch under test on; wait out its seeding sync. ---
    p.setBoolPref(prefix + 'webdav.syncSettings', true);
    const syncDone = await waitFor(async () => {
      const settings = JSON.parse(await diagnostics.settingsSync());
      const t = settings.transport;
      return t && t.syncs > 0 && t.running === false && t.pendingChange === false
        && t.lastTrigger === 'switch-on' && (t.lastOutcome === 'ok' || t.lastOutcome === 'error');
    }, 25000, 250);
    if (!syncDone) throw new Error('switch-on sync did not complete');
    const settingsAfter = JSON.parse(await diagnostics.settingsSync());
    out.afterSwitchOn = {
      enabled: settingsAfter.enabled, folder: settingsAfter.folder, configured: settingsAfter.configured,
      machine: settingsAfter.machine, heldSections: settingsAfter.heldSections,
      seeded: settingsAfter.state && settingsAfter.state.seeded, stamps: settingsAfter.state && settingsAfter.state.stamps,
      held: settingsAfter.state && settingsAfter.state.held,
      transport: {
        lastTrigger: settingsAfter.transport.lastTrigger, lastOutcome: settingsAfter.transport.lastOutcome,
        remoteItems: settingsAfter.transport.remoteItems, adopted: settingsAfter.transport.adopted,
        pushed: settingsAfter.transport.pushed, uploaded: settingsAfter.transport.uploaded,
        lastError: settingsAfter.transport.lastError,
      },
    };

    // --- Mute (readAloud.volume 0) unless already there; original kept above. ---
    const volRec = baseline['readAloud.volume'];
    if (volRec.value !== 0) {
      p.setIntPref(prefix + 'readAloud.volume', 0);
      out.muted = { from: volRec.value, userBefore: volRec.user };
      // Its change sync (10 s quiet) rides along with later traffic; noted, not waited out here.
    } else out.muted = 'already 0';

    // --- Baseline state: readers, settings window, errors, locale. ---
    const readersBefore = [];
    const list = Zotero.Reader && Zotero.Reader._readers ? Zotero.Reader._readers : [];
    for (let i = 0; i < list.length; i++) {
      const reader = list[i];
      try {
        const manager = reader._internalReader && reader._internalReader._readAloudManager;
        const item = Zotero.Items.get(reader.itemID);
        const parent = item && item.parentItemID ? Zotero.Items.get(item.parentItemID) : null;
        readersBefore.push({
          itemID: reader.itemID,
          title: (parent || item) && (parent || item).getField ? (parent || item).getField('title') : null,
          active: !!(manager && manager.active),
          paused: manager ? !!manager.paused : null,
        });
      } catch (e) { readersBefore.push({ itemID: reader && reader.itemID, error: String(e) }); }
    }
    S.readersBefore = readersBefore;
    out.readersBefore = readersBefore;
    S.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');
    out.settingsWindowOpenBefore = S.settingsWindowOpenBefore;
    S.locale = Zotero.locale;
    out.zoteroVersion = Zotero.version;

    S.debugStoringBefore = !!Zotero.Debug.storing;
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
    const errs = Zotero.getErrors(true) || [];
    S.errorsBefore = errs.map(String);
    S.errorsBeforeCount = S.errorsBefore.length;
    out.errorsBeforeCount = S.errorsBefore.length;

    // --- Minimize the host (minimize by default). ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host) {
      S.hostBefore = { windowState: host.windowState, screenX: host.screenX, screenY: host.screenY, outerWidth: host.outerWidth, outerHeight: host.outerHeight, selectedTab: host.Zotero_Tabs ? host.Zotero_Tabs.selectedID : null };
      if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED;
      await sleep(700);
      out.hostMinimized = host.windowState === host.STATE_MINIMIZED || host.windowState === 2;
    } else out.hostMinimized = 'no host window found';
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
