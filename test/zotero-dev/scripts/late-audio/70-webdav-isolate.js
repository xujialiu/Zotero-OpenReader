// Issue #165 verification: "Test WebDAV first" opener, run BEFORE the build is
// installed. Adapted from the executed zotero-credits/00-isolate-and-baseline.js
// (2026-09, proven pattern): typed snapshot of the WebDAV settings this run may
// touch, transports settled, the three plugin WebDAV switches suspended and
// webdav.url moved to the dedicated test configuration
// (~/.secrets/Zotero-TTS/test_webdav.txt, contents never reported),
// host minimized, readers/settings window/error ring recorded, debug store
// armed. State: Zotero.ZoteroTTSRun.state.isolate (95-webdav-restore.js reads
// it). Executed 2026-10-01 from .tmp/zotero-dev/late-audio-165/ under the name
// 00-isolate-and-baseline.js (PASS); copied here verbatim for the next run.
(async () => {
  const out = { step: 'isolate-and-baseline' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const Ci = Components.interfaces;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, stepMs = 150) => {
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
    // --- Typed snapshot of the WebDAV settings this run may touch. ---
    const named = [
      'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState',
      'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings',
    ];
    const baseline = {};
    for (const suffix of named) baseline[suffix] = readTyped(prefix + suffix);
    baseline['sync.autoSync'] = readTyped('extensions.zotero.sync.autoSync'); // recorded only, not changed
    const secret = (suffix) => /(?:password|username|url|machineId|syncState)$/.test(suffix);
    const safeSnapshot = {};
    for (const [suffix, rec] of Object.entries(baseline)) {
      safeSnapshot[suffix] = secret(suffix)
        ? { type: rec.type, user: rec.user, chars: typeof rec.value === 'string' ? rec.value.length : null }
        : { type: rec.type, user: rec.user, value: rec.value };
    }
    S.isolate = { baseline: {} };
    S.isolate.baseline = baseline;
    out.baseline = safeSnapshot;

    // --- Test WebDAV first: the dedicated configuration file. ---
    const home = Services.dirsvc.get('Home', Ci.nsIFile).path;
    const configPath = PathUtils.join(home, '.secrets', 'Zotero-TTS', 'test_webdav.txt');
    let configText;
    try { configText = (await IOUtils.readUTF8(configPath)).trim(); } catch (_) { throw new Error('test WebDAV config unavailable'); }
    if (!(configText.startsWith('http://') || configText.startsWith('https://'))) throw new Error('test WebDAV config is not an URL');

    // --- The plugin's own add-on record. ---
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addons = await AddonManager.getAllAddons();
    let ttsBefore = null;
    for (const addon of addons) {
      if (addon.id === 'zotero-tts@xujialiu.top') {
        ttsBefore = { version: addon.version, active: !!addon.isActive };
      }
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
        && sync.transport && sync.transport.running === false && (!sync.shared || !sync.shared.transport || sync.shared.transport.running === false)
        && settings.transport && settings.transport.pendingChange === false && settings.transport.running === false
        && upload.autoUpload && upload.autoUpload.pending === false;
    });
    if (!settled) throw new Error('WebDAV transports did not settle before destination isolation');
    out.transportsSettledBefore = true;

    // --- Suspend automatic sync/backup, move the destination, confirm. ---
    for (const suffix of ['webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings']) p.setBoolPref(prefix + suffix, false);
    p.setStringPref(prefix + 'webdav.url', configText);
    const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
    const destinationMatched = trimSlash(p.getStringPref(prefix + 'webdav.url')) === trimSlash(configText);
    if (!destinationMatched) throw new Error('test WebDAV destination did not take effect');
    S.destinationMatched = true;
    out.webdav = { configAvailable: true, destinationMatched, switchesSuspended: true, configChars: configText.length };

    // --- Baseline state: readers, windows, errors, locale. ---
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
          selectedVoice: manager ? manager.selectedVoiceID ?? null : null,
        });
      } catch (e) {
        readersBefore.push({ itemID: reader && reader.itemID, error: String(e) });
      }
    }
    S.readersBefore = readersBefore;
    out.readersBefore = readersBefore;

    S.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');
    out.settingsWindowOpenBefore = S.settingsWindowOpenBefore;
    S.locale = Zotero.locale;
    S.zoteroVersion = Zotero.version;
    out.zoteroVersion = Zotero.version;

    S.debugStoringBefore = !!Zotero.Debug.storing;
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
    out.debugStoreArmed = true;
    const errs = Zotero.getErrors(true) || [];
    S.errorsBefore = errs.map(String);
    S.errorsBeforeCount = S.errorsBefore.length;
    out.errorsBeforeCount = S.errorsBefore.length;

    // --- Minimize the host (minimize by default; restored only for trusted input). ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (host) {
      S.hostBefore = { windowState: host.windowState, screenX: host.screenX, screenY: host.screenY, outerWidth: host.outerWidth, outerHeight: host.outerHeight, selectedTab: host.Zotero_Tabs ? host.Zotero_Tabs.selectedID : null };
      if (host.minimize) host.minimize(); else host.windowState = host.STATE_MINIMIZED;
      await sleep(700);
      out.hostMinimized = host.windowState === host.STATE_MINIMIZED || host.windowState === 2;
    } else {
      out.hostMinimized = 'no host window found';
    }
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
