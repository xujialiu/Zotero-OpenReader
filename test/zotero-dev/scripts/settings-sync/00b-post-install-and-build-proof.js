// 1.16.12-beta2, after the in-place install: an upgrade may move the WebDAV
// switches or the folder switch, so the isolation is re-asserted (test
// destination still effective, sync/backup still suspended), the transports
// (the mute's change sync included) are settled, and the build is proved by
// its mechanism — with Fish Speech at its default Address
// (http://localhost:8080) settingsSync().heldSections must contain
// "fishspeech" (issue #184: the previous build lists no fishspeech there).
// The pref stays at the default for item 6.22 and is restored to the opener's
// snapshot at cleanup. State: S.buildProof.
(async () => {
  const out = { step: 'post-install-and-build-proof' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 25000, stepMs = 250) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const S = Zotero.ZoteroTTSRun.state;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  try {
    // --- The isolation survived the install. ---
    const iso = S.isolate;
    if (!iso || !iso.baseline) throw new Error('no isolate baseline in state');
    const switches = {
      enabled: p.getBoolPref(prefix + 'webdav.enabled'),
      url: p.getStringPref(prefix + 'webdav.url'),
      syncPositions: p.getBoolPref(prefix + 'webdav.syncPositions'),
      autoUploadSettings: p.getBoolPref(prefix + 'webdav.autoUploadSettings'),
      syncSettings: p.getBoolPref(prefix + 'webdav.syncSettings'),
    };
    out.switchesAfterInstall = {
      folderOn: switches.enabled,
      urlIsTestConfig: switches.url === iso.baseline['webdav.url'].value || switches.url.length === 71 ? 'yes' : 'NO',
      syncPositionsSuspended: switches.syncPositions === false,
      autoUploadSuspended: switches.autoUploadSettings === false,
      syncSettingsOn: switches.syncSettings === true,
    };
    // Re-assert if the upgrade moved anything.
    if (switches.syncPositions !== false) p.setBoolPref(prefix + 'webdav.syncPositions', false);
    if (switches.autoUploadSettings !== false) p.setBoolPref(prefix + 'webdav.autoUploadSettings', false);
    if (switches.syncSettings !== true) p.setBoolPref(prefix + 'webdav.syncSettings', true);
    if (!switches.enabled) throw new Error('the upgrade turned the WebDAV folder off');

    // --- Settle (the opener's mute change sync included). ---
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
    out.transportsSettled = !!settled;
    const before = JSON.parse(await diagnostics.settingsSync());
    out.transportAfterSettle = {
      lastTrigger: before.transport.lastTrigger, lastOutcome: before.transport.lastOutcome,
      adopted: before.transport.adopted, pushed: before.transport.pushed, uploaded: before.transport.uploaded,
      lastError: before.transport.lastError,
    };
    out.adoptionsDuringSettle = before.transport.lastApplied && before.transport.lastApplied.applied;

    // --- The build proof: Fish Speech at its default Address. ---
    const addressesBefore = {
      local: p.getStringPref(prefix + 'local.baseURL'),
      compatible: p.getStringPref(prefix + 'compatible.baseURL'),
      fishspeech: p.getStringPref(prefix + 'fishspeech.baseURL'),
    };
    out.addressesBefore = addressesBefore;
    out.heldSectionsBefore = before.heldSections;
    p.setStringPref(prefix + 'fishspeech.baseURL', 'http://localhost:8080');
    const proof = JSON.parse(await diagnostics.settingsSync());
    out.heldSectionsAtDefaultAddress = proof.heldSections;
    out.buildProof = proof.heldSections.includes('fishspeech');
    S.buildProof = out.buildProof;
    // Its change sync (held section: pushed 0, uploaded false) is waited out
    // so item 6.22's trigger starts from a quiet transport.
    const fishSyncDone = await waitFor(async () => {
      const settings = JSON.parse(await diagnostics.settingsSync());
      const t = settings.transport;
      return t && t.running === false && t.pendingChange === false && t.lastTrigger === 'change' && t.lastOutcome === 'ok';
    }, 25000, 250);
    const after = JSON.parse(await diagnostics.settingsSync());
    out.fishspeechChangeSync = {
      waited: !!fishSyncDone, lastOutcome: after.transport.lastOutcome,
      pushed: after.transport.pushed, uploaded: after.transport.uploaded,
      heldSections: after.heldSections,
    };
    out.fishspeechBaseURLNow = p.getStringPref(prefix + 'fishspeech.baseURL');
    out.status = out.buildProof && settled ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
