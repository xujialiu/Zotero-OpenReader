// Check 8, teardown (playback 3.26), restricted and fail-closed. Fixture
// scope: readers/tabs/items whose id is in state.fx or state.fx2 (unioned by
// item id, never by map key), and only their documentVoices keys. Named
// prefs are restored from state.baseline.prefs (supplied by
// 01-baseline-snapshot.js) at each pref's own FULL name — Zotero's
// extensions.zotero.reader.readAloudVoices is NOT prefixed — with value and
// user-value flag verified; memory last. Without the baseline snapshot the
// script must not pretend: fixture cleanup still runs, no pref is touched,
// ok is false. WebDAV and window state belong to 81.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'cleanup-teardown' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const win = Zotero.getMainWindow();
  const T = win.Zotero_Tabs;
  const prefix = 'extensions.zotero.zotero-tts.';

  // Union both fixture registries by item id (a map merge would drop old
  // entries that share a key name with newer ones).
  const fixtures = [];
  const seenIds = new Set();
  for (const registry of [state.fx || {}, state.fx2 || {}]) {
    for (const row of Object.values(registry)) {
      if (row && row.id && !seenIds.has(row.id)) { seenIds.add(row.id); fixtures.push(row); }
    }
  }
  const fixtureIds = new Set(fixtures.map((r) => r.id));
  const fixtureKeys = new Set(fixtures.map((r) => r.key).filter(Boolean));
  out.fixtureItems = fixtures.map((r) => r.id);

  // 1. Players closed on fixture readers only.
  const playersClosed = [];
  for (const r of (Zotero.Reader._readers || []).slice()) {
    if (!fixtureIds.has(r.itemID)) continue;
    const internal = waive(r._internalReader);
    const m = waive(internal._readAloudManager);
    if (m?.active) {
      try { internal.toggleReadAloudPopup(false); playersClosed.push(r.itemID); } catch (e) { out['playerErr' + r.itemID] = String(e); }
    }
  }
  out.playersClosed = playersClosed;
  await sleep(600);

  // 2. Fixture tabs only (owner tabs are never touched).
  const closedTabs = [];
  for (const r of (Zotero.Reader._readers || []).slice()) {
    if (!fixtureIds.has(r.itemID)) continue;
    try { if (r.tabID) T.close(r.tabID); closedTabs.push(r.itemID); } catch (e) { out['tabErr' + r.itemID] = String(e); }
    await sleep(300);
  }
  out.closedFixtureTabs = closedTabs;
  for (let i = 0; i < 60 && (Zotero.Reader._readers || []).some((r) => fixtureIds.has(r.itemID)); i++) await sleep(200);
  out.fixtureReadersLeft = (Zotero.Reader._readers || []).filter((r) => fixtureIds.has(r.itemID)).length;
  out.otherReadersLeft = (Zotero.Reader._readers || []).filter((r) => !fixtureIds.has(r.itemID)).length;

  // 3. Erase fixture items (snapshot parents cascade their children).
  const erased = [], eraseErrors = [];
  for (const id of [...fixtureIds].sort((a, b) => a - b)) {
    try { const item = Zotero.Items.get(id); if (item) { await item.eraseTx(); erased.push(id); } } catch (e) { eraseErrors.push(id + ': ' + String(e)); }
  }
  out.erased = erased;
  out.eraseErrors = eraseErrors;

  // 4. documentVoices keys of the fixture item keys only.
  const dvPrefix = prefix + 'documentVoices.';
  const nowKeys = Services.prefs.getChildList(dvPrefix).filter((n) => n !== dvPrefix && n.startsWith(dvPrefix));
  const pruned = [];
  for (const k of nowKeys) {
    const itemKey = k.slice(dvPrefix.length).split('/').pop();
    if (fixtureKeys.has(itemKey)) {
      try { Services.prefs.clearUserPref(k); pruned.push(k); } catch (e) { out['dvErr' + k] = String(e); }
    }
  }
  out.documentVoiceKeysPruned = pruned;
  out.documentVoiceKeysLeft = Services.prefs.getChildList(dvPrefix).filter((n) => n !== dvPrefix && n.startsWith(dvPrefix)).length;

  // 5. Close only a test-created settings window BEFORE restoring prefs;
  // its deferred bindings must not write test values over the restoration.
  const baseline = state.baseline || null;
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin && baseline?.settingsWindowOpen === false) {
    prefWin.close();
    await sleep(250);
  }
  // Named prefs from the 01 baseline, each at its own FULL name.
  // Fail closed: no baseline snapshot -> no restoration, ok false.
  const baselinePrefs = baseline?.prefs || null;
  const targets = [
    { name: 'readAloud.volume', full: prefix + 'readAloud.volume', type: 'int' },
    { name: 'azure.enabled', full: prefix + 'azure.enabled', type: 'bool' },
    { name: 'reader.readAloudVoices', full: 'extensions.zotero.reader.readAloudVoices', type: 'str' },
    { name: 'readAloud.memory', full: prefix + 'readAloud.memory', type: 'str' }, // last
  ];
  const readCur = (t) => {
    if (t.type === 'int') return Services.prefs.getIntPref(t.full, -1);
    if (t.type === 'bool') return Services.prefs.getBoolPref(t.full, false);
    return Services.prefs.getPrefType(t.full) === 0 ? null : Services.prefs.getStringPref(t.full);
  };
  out.restoredPrefs = {};
  let prefsOk = true;
  if (!baselinePrefs) {
    for (const t of targets) out.restoredPrefs[t.name] = { full: t.full, current: { value: readCur(t), user: Services.prefs.prefHasUserValue(t.full) }, error: 'no state.baseline.prefs; nothing restored (fail closed)' };
    prefsOk = false;
  } else {
    for (const t of targets) {
      const snap = baselinePrefs[t.name];
      const row = { full: t.full };
      if (!snap) { row.error = 'no baseline snapshot for ' + t.name; prefsOk = false; out.restoredPrefs[t.name] = row; continue; }
      if (snap.set) {
        if (t.type === 'int') Services.prefs.setIntPref(t.full, snap.value);
        else if (t.type === 'bool') Services.prefs.setBoolPref(t.full, snap.value);
        else Services.prefs.setStringPref(t.full, snap.value);
      } else if (Services.prefs.prefHasUserValue(t.full)) {
        Services.prefs.clearUserPref(t.full);
      }
      row.after = { value: readCur(t), user: Services.prefs.prefHasUserValue(t.full) };
      row.matches = row.after.value === snap.value && row.after.user === snap.set;
      if (!row.matches) prefsOk = false;
      out.restoredPrefs[t.name] = row;
    }
  }

  // 6. Position rows and final startup.
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { out.posErr = String(e); }
  out.positionRows = position?.database?.rows ?? null;
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.finalStartup = { version: startup.version, failed: startup.failed };

  out.ok = out.fixtureReadersLeft === 0 && eraseErrors.length === 0 && prefsOk && startup.failed.length === 0
    && baseline?.positionRows !== undefined && out.positionRows === baseline.positionRows;
  state.cleanupOk = out.ok === true;
  return JSON.stringify(out, null, 1);
})()
