// Issue #82 item 1, first half — still on the OLD build (1.16.2-beta7).
// Records the old build's global speed (the `speed` field of readAloud.memory),
// confirms the two new prefs hold no user value yet, removes any stale shared
// settings file and sync stamps so the seed is clean, then turns the settings
// sync on against the test WebDAV and lets it seed.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state;
  const K = n => prefix + n;

  // The recorded speed: the `speed` field of the old memory JSON (not a secret)
  let oldSpeed = null, memoryParseError = null;
  try {
    const parsed = JSON.parse(String(state.baseline['readAloud.memory'].value ?? '{}'));
    if (typeof parsed.speed === 'number' && Number.isFinite(parsed.speed) && parsed.speed > 0) oldSpeed = parsed.speed;
  } catch (e) { memoryParseError = String(e); }
  state.oldSpeed = oldSpeed;
  // What the migration should produce: speed × 100, null when it was exactly 1.0
  // (a user value equal to the default is dropped by Gecko) or null (nothing to copy)
  state.expectedSpeedPercent = oldSpeed === null ? null : (oldSpeed === 1 ? null : Math.round(oldSpeed * 100));

  const flags = {
    globalSpeedMigratedUser: p.prefHasUserValue(K('globalSpeedMigrated')),
    speedPercentUser: p.prefHasUserValue(K('readAloud.speedPercent')),
    speedPercentType: p.getPrefType(K('readAloud.speedPercent')),
  };

  // Raw shared-file access on the plugin's own client terms: Basic auth built
  // here, the password never printed. url/username/password come from the prefs.
  const cfg = () => ({
    url: p.getStringPref(K('webdav.url')),
    username: p.prefHasUserValue(K('webdav.username')) ? p.getStringPref(K('webdav.username')) : '',
    password: p.prefHasUserValue(K('webdav.password')) ? p.getStringPref(K('webdav.password')) : '',
  });
  const auth = () => {
    const c = cfg();
    if (!c.username) return {};
    const bytes = new TextEncoder().encode(c.username + ':' + c.password);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { Authorization: 'Basic ' + btoa(binary) };
  };
  const fileName = 'zotero-tts-shared-settings.json';
  const url = () => cfg().url.replace(/\/?$/, '/') + fileName;
  const rawGet = async () => {
    const r = await fetch(url(), { method: 'GET', headers: { ...auth(), 'cache': 'no-store' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GET shared file: HTTP ' + r.status);
    return r.text();
  };
  const rawDelete = async () => {
    const r = await fetch(url(), { method: 'DELETE', headers: auth() });
    if (r.status !== 404 && !r.ok) throw new Error('DELETE shared file: HTTP ' + r.status);
    return r.status;
  };
  const keysOf = text => { try { return (JSON.parse(text).items ?? []).map(i => String(i.key)); } catch (e) { return ['<unparsed>']; } };

  // Clean slate for the seed: remove any stale file, remember its bytes for cleanup
  const fileBefore = await rawGet();
  state.sharedFileBefore = fileBefore;
  const deleteStatus = fileBefore !== null ? await rawDelete() : null;

  // Clear the sync stamps the old build holds (the baseline snapshot restores it)
  state.syncStateBefore = {
    user: p.prefHasUserValue(K('webdav.syncState')),
    value: p.prefHasUserValue(K('webdav.syncState')) ? p.getStringPref(K('webdav.syncState')) : null,
  };
  if (p.prefHasUserValue(K('webdav.syncState'))) p.clearUserPref(K('webdav.syncState'));

  // Close a settings window left open, so no sync trigger races the seed
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { try { prefWin.close(); } catch (e) {} await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000, 100); }

  // Switch on: the old build seeds the file with its own (pre-#82) key set
  p.setBoolPref(K('webdav.syncSettings'), true);
  const seeded = await waitFor(async () => {
    try {
      const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
      return d.state?.seeded === true && d.transport?.lastOutcome === 'ok' && d.transport?.running === false ? d : null;
    } catch (e) { return null; }
  }, 25000, 250);
  if (!seeded) throw new Error('the old build did not seed the settings sync: ' + JSON.stringify((() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync()); } catch (e) { return null; } })()));

  const fileAfterSeed = await rawGet();
  if (fileAfterSeed === null) throw new Error('the seeded shared file is missing after a successful seed');
  state.seededFileBytes = fileAfterSeed;

  return JSON.stringify({
    oldSpeed, expectedSpeedPercent: state.expectedSpeedPercent, memoryParseError,
    flags,
    staleFile: fileBefore !== null ? { existed: true, keys: keysOf(fileBefore), chars: fileBefore.length, deleteStatus } : { existed: false },
    syncStateBeforeUser: state.syncStateBefore.user,
    seed: {
      stampedCount: seeded.state?.stamps, stamped: seeded.state?.stamped,
      pushed: seeded.transport?.pushed, uploaded: seeded.transport?.uploaded,
      machine: seeded.machine ? String(seeded.machine).length + 'chars' : null,
      syncable: seeded.syncable,
    },
    seededFileKeys: keysOf(fileAfterSeed),
    hasSpeedPercentItem: keysOf(fileAfterSeed).includes('readAloud.speedPercent'),
  });
})()
