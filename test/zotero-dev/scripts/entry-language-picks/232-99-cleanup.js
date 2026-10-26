// Generic cleanup, not the one-off incident recovery. Missing snapshots fail
// closed; values, registered defaults AND user flags must match. No guesses.
// The driver owns final restoration of its pre-install WebDAV/debug baseline.
(async () => {
  const Z = Zotero, S = Services.prefs, state = Z.ZoteroTTSRun.state.ep232;
  const P = 'extensions.zotero.zotero-tts.';
  const names = {
    nativeVoices: 'extensions.zotero.reader.readAloudVoices',
    memory: P + 'readAloud.memory', speedPercent: P + 'readAloud.speedPercent',
    systemEnabled: P + 'system.enabled', volume: P + 'readAloud.volume',
    pulse: P + 'documentVoiceChanged', defaultVoice: P + 'readAloud.defaultVoice',
  };
  const out = { steps: [], restored: {} };
  const check = (name, ok) => { out.steps.push({ name, ok: !!ok }); return !!ok; };
  const read = n => {
    const type = ({ 0: 'none', 32: 'string', 64: 'int', 128: 'bool' })[S.getPrefType(n)];
    if (!type) throw new Error('Unknown preference type');
    return { type, value: type === 'string' ? S.getStringPref(n) : type === 'int' ? S.getIntPref(n) : type === 'bool' ? S.getBoolPref(n) : null,
      hasUser: S.prefHasUserValue(n) };
  };
  const same = (a, b) => a.type === b.type && a.value === b.value && a.hasUser === b.hasUser;
  const records = () => {
    const values = {}, branch = S.getBranch(P);
    for (const key of branch.getChildList('').sort()) if (key.startsWith('documentVoices.')) values[key] = read(P + key);
    return values;
  };
  const restore = slot => {
    const n = names[slot], saved = state.prefs[slot];
    if (saved.hasUser) {
      if (saved.type === 'string') S.setStringPref(n, saved.value);
      else if (saved.type === 'int') S.setIntPref(n, saved.value);
      else if (saved.type === 'bool') S.setBoolPref(n, saved.value);
    } else if (S.prefHasUserValue(n)) S.clearUserPref(n);
  };
  // Switching System can queue a refresh. Observe it, never request another
  // list. Two quiet samples allow queued work to start; five seconds is a
  // recovery bound, not permission to accept an unfinished or unknown load.
  const settleVoiceLists = async () => {
    let quiet = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const lists = JSON.parse(await Z.ZoteroTTS.diagnostics.liveVoiceList());
      if (!Array.isArray(lists) || lists.some(row => row !== null &&
        (!Number.isInteger(row?.loading) || row.loading < 0))) throw new Error('Unknown voice-list refresh state; keep isolation');
      quiet = lists.every(row => row === null || row.loading === 0) ? quiet + 1 : 0;
      if (quiet === 2) return;
    }
    throw new Error('Voice-list refresh did not settle; keep isolation and retry cleanup after it finishes');
  };
  try {
    if (state?.schema === 2) state.cleaned = false;
    if (state?.schema !== 2 || !state.snapshotComplete || !state.window || !state.docVoiceRecords
      || !Array.isArray(state.readersBaseline) || typeof state.debugStoring !== 'boolean' || !Number.isInteger(state.rowsBaseline)) {
      throw new Error('Validated baseline missing; keep isolation and request recovery');
    }
    for (const slot of Object.keys(names)) {
      const s = state.prefs?.[slot];
      if (!s || typeof s.hasUser !== 'boolean' || !['none', 'string', 'int', 'bool'].includes(s.type)
        || !Object.prototype.hasOwnProperty.call(s, 'value') || (s.type === 'none' && (s.hasUser || s.value !== null))
        || (s.type === 'string' && typeof s.value !== 'string') || (s.type === 'int' && !Number.isInteger(s.value))
        || (s.type === 'bool' && typeof s.value !== 'boolean')) {
        throw new Error('Incomplete preference snapshot; do not restore or guess');
      }
    }
    const fixture = state.fixture;
    if (fixture) {
      if (!fixture.created || !Number.isInteger(fixture.itemID) || !/^[A-Z0-9]{8}$/.test(fixture.key)
        || state.readersBaseline?.some(reader => reader.itemID === fixture.itemID)) throw new Error('Fixture identity is not proven or points to an owner reader');
      const item = Z.Items.get(fixture.itemID);
      if (item && item.key !== fixture.key) throw new Error('Fixture key mismatch; do not erase');
      const readers = Z.Reader._readers ?? [];
      for (let i = 0; i < readers.length; i++) {
        const reader = readers[i];
        if (reader.itemID !== fixture.itemID) continue;
        if (reader._internalReader?._readAloudManager?.active) reader._internalReader.toggleReadAloudPopup(false);
        Z.getMainWindow().Zotero_Tabs.close(reader.tabID);
        break;
      }
      if (item) await item.eraseTx();
      check('fixture-erased', !Z.Items.get(fixture.itemID));
      const recordKey = `documentVoices.user/${fixture.key}`;
      if (!Object.prototype.hasOwnProperty.call(state.docVoiceRecords, recordKey) && S.prefHasUserValue(P + recordKey)) S.clearUserPref(P + recordKey);
      check('fixture-record-removed', !S.prefHasUserValue(P + recordKey) || Object.prototype.hasOwnProperty.call(state.docVoiceRecords, recordKey));
    }
    const ownerEqual = JSON.stringify(records()) === JSON.stringify(state.docVoiceRecords);
    check('owner-records-equal', ownerEqual);
    if (!ownerEqual || !same(read(names.defaultVoice), state.prefs.defaultVoice)) throw new Error('Owner data changed; do not overwrite it with the baseline');
    // Global speed rewrites native entries synchronously; System can refresh
    // them asynchronously. Finish both before restoring the exact native map.
    for (const slot of ['systemEnabled', 'speedPercent', 'volume']) restore(slot);
    await settleVoiceLists();
    check('voice-lists-settled', true);
    // Native restore can notify memory observers, so memory remains last.
    for (const slot of ['nativeVoices', 'pulse', 'memory']) restore(slot);
    const win = Z.getMainWindow();
    if (state.window.selectedTab && win.Zotero_Tabs.selectedID !== state.window.selectedTab) win.Zotero_Tabs.select(state.window.selectedTab);
    check('owner-tab', win.Zotero_Tabs.selectedID === state.window.selectedTab);
    check('owner-readers-unchanged', state.readersBaseline.every(owner => (Z.Reader._readers ?? []).some(reader =>
      reader.itemID === owner.itemID && !!reader._internalReader?._readAloudManager?.active === owner.active)));
    check('window-unchanged', win.windowState === state.window.state && win.screenX === state.window.x && win.screenY === state.window.y
      && win.outerWidth === state.window.w && win.outerHeight === state.window.h);
    check('debug-unchanged', !!Z.Debug.storing === state.debugStoring);
    check('rows-at-baseline', JSON.parse(await Z.ZoteroTTS.diagnostics.position()).database?.rows === state.rowsBaseline);
    // No WebDAV write: the driver restores its original switch only after all case gates pass.
    check('folder-still-isolated', JSON.parse(await Z.ZoteroTTS.diagnostics.positionSync()).folder === false);
    // Final synchronous audit AFTER every write and await. An earlier pref's
    // successful write/readback is not evidence after a later observer runs.
    for (const [slot, n] of Object.entries(names)) {
      const saved = state.prefs[slot], now = read(n);
      out.restored[slot] = { typeEqual: now.type === saved.type, valueEqual: now.value === saved.value, userEqual: now.hasUser === saved.hasUser };
      check('pref-' + slot, same(now, saved));
    }
    check('owner-records-still-equal', JSON.stringify(records()) === JSON.stringify(state.docVoiceRecords));
    out.ok = out.steps.every(s => s.ok);
    if (out.ok) state.cleaned = true;
  } catch (e) { out.ok = false; out.error = String(e); }
  return JSON.stringify(out);
})()
