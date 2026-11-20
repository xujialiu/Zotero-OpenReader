(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const webdav = prefix + 'webdav.enabled';
  const native = 'extensions.zotero.reader.readAloudVoices';
  const state = Zotero.ZoteroTTSRun?.state?.vc261;
  const original = state?.prefs;
  if (!original || !original[webdav] || !original[native] || !state.docVoices ||
      typeof state.positionRowsBaseline !== 'number') {
    throw new Error('Original private snapshot missing. No cleanup writes were made.');
  }
  const initialSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  if (initialSync.folder !== false) throw new Error('WebDAV must be isolated before cleanup');

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const outcome = { fixtureReadersRemaining: [], fixtureItemsRemaining: [],
    fixtureRecordsRemaining: [], prefMismatches: [], errors: [] };
  const win = Zotero.getMainWindow();
  const fullName = name => name.startsWith('extensions.zotero.') ? name : prefix + name;
  const read = key => {
    const type = Services.prefs.getPrefType(key);
    const user = Services.prefs.prefHasUserValue(key);
    const value = type === 32 ? Services.prefs.getStringPref(key)
      : type === 64 ? Services.prefs.getIntPref(key)
      : type === 128 ? Services.prefs.getBoolPref(key) : null;
    return { user, value };
  };
  const matches = (key, expected) => {
    const current = read(key);
    return current.user === expected.user && current.value === expected.value;
  };
  const restore = (key, expected) => {
    if (!expected) throw new Error('Original value missing for ' + key);
    if (matches(key, expected)) return;
    if (!expected.user) Services.prefs.clearUserPref(key);
    else if (expected.type === 'string') Services.prefs.setStringPref(key, expected.value);
    else if (expected.type === 'int') Services.prefs.setIntPref(key, expected.value);
    else if (expected.type === 'bool') Services.prefs.setBoolPref(key, expected.value);
    else throw new Error('Unsupported original preference type for ' + key);
  };

  const prefs = original;
  const fixtures = ['fixtureA', 'fixtureB'].flatMap(slot => {
    const fixture = state[slot];
    return fixture ? [{ ...fixture, slot }] : [];
  });
  const positionRowsBaseline = state.positionRowsBaseline;

  const docBranch = Services.prefs.getBranch(prefix + 'documentVoices.');
  const ownedRecords = new Set(fixtures.map(fixture => 'user/' + fixture.key));
  const closedTabs = new Set();
  for (const fixture of fixtures) {
    if (typeof fixture.key !== 'string' || !fixture.key) {
      outcome.errors.push(fixture.slot + ' has no captured item key');
      continue;
    }
    try {
      const item = Zotero.Items.get(fixture.itemID);
      if (item && (item.key !== fixture.key || !item.isAttachment() || item.parentID)) {
        outcome.errors.push(fixture.slot + ' item identity did not match');
        continue;
      }
      const reader = Zotero.Reader._readers.find(reader => reader.itemID === fixture.itemID);
      if (reader?.tabID) {
        closedTabs.add(reader.tabID);
        win.Zotero_Tabs.close(reader.tabID);
      }
      if (item) await item.eraseTx();
    } catch (_) {
      outcome.errors.push(fixture.slot + ' could not be closed and erased');
    }
  }
  await sleep(800);
  for (const key of ownedRecords) {
    if (docBranch.prefHasUserValue(key)) docBranch.clearUserPref(key);
  }

  Services.prefs.setBoolPref(prefix + 'local.enabled', false);
  const restoreOrder = Object.keys(prefs).filter(name =>
    ![webdav, 'local.enabled', 'readAloud.memory'].includes(name));
  restoreOrder.push('local.enabled', 'readAloud.memory');
  for (const name of restoreOrder) {
    try { restore(fullName(name), prefs[name]); }
    catch (_) { outcome.errors.push('Could not restore ' + name); }
  }

  const recordedTab = state.winState?.before?.selectedTab;
  const savedTab = closedTabs.has(recordedTab) ? null : recordedTab;
  if (savedTab && win.Zotero_Tabs.selectedID !== savedTab) {
    try { win.Zotero_Tabs.select(savedTab); }
    catch (_) { outcome.errors.push('Could not select the original tab'); }
  }
  if (win.windowState !== 2) win.minimize();
  Zotero.Debug.setStore(!!state.debug?.storing);
  await sleep(1200);

  outcome.fixtureReadersRemaining = fixtures.filter(fixture =>
    Zotero.Reader._readers.some(reader => reader.itemID === fixture.itemID)).map(f => f.slot);
  outcome.fixtureItemsRemaining = fixtures.filter(fixture =>
    !!Zotero.Items.get(fixture.itemID)).map(f => f.slot);
  outcome.fixtureRecordsRemaining = [...ownedRecords].filter(key => docBranch.prefHasUserValue(key));
  outcome.prefMismatches = restoreOrder.filter(name => !matches(fullName(name), prefs[name]));
  outcome.nonFixtureRecords = { checked: 0, mismatches: 0 };
  for (const [key, original] of Object.entries(state.docVoices)) {
    if (ownedRecords.has(key)) continue;
    outcome.nonFixtureRecords.checked++;
    if (!matches(prefix + 'documentVoices.' + key, original)) outcome.nonFixtureRecords.mismatches++;
  }
  const rows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database.rows;
  outcome.position = { baseline: positionRowsBaseline, rows, match: rows === positionRowsBaseline };
  outcome.nativeChoiceMatches = matches(native, prefs[native]);
  outcome.debugMatches = !!Zotero.Debug.storing === !!state.debug?.storing;
  outcome.minimized = win.windowState === 2;
  outcome.selectedTabMatches = !savedTab || savedTab === win.Zotero_Tabs.selectedID;
  const clean = outcome.errors.length === 0 && outcome.fixtureReadersRemaining.length === 0 &&
    outcome.fixtureItemsRemaining.length === 0 && outcome.fixtureRecordsRemaining.length === 0 &&
    outcome.prefMismatches.length === 0 && outcome.nonFixtureRecords.mismatches === 0 &&
    outcome.position.match && outcome.nativeChoiceMatches && outcome.debugMatches &&
    outcome.minimized && outcome.selectedTabMatches;
  if (clean) restore(webdav, prefs[webdav]);
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  outcome.webdav = { matches: matches(webdav, prefs[webdav]), folder: sync.folder };
  outcome.restored = clean === true && outcome.webdav.matches;
  return JSON.stringify(outcome);
})()
