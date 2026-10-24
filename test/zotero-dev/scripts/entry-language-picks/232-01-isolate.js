// Capture every exact leaf BEFORE any write. Never replace a captured baseline.
// Driver isolates WebDAV before installation and restores its original switch
// after this kit; this script only verifies that the folder is already off.
(async () => {
  const Z = Zotero, S = Services.prefs, state = Z.ZoteroTTSRun.state.ep232;
  const P = 'extensions.zotero.zotero-tts.';
  const names = {
    nativeVoices: 'extensions.zotero.reader.readAloudVoices',
    memory: P + 'readAloud.memory', speedPercent: P + 'readAloud.speedPercent',
    systemEnabled: P + 'system.enabled', volume: P + 'readAloud.volume',
    pulse: P + 'documentVoiceChanged', defaultVoice: P + 'readAloud.defaultVoice',
  };
  const out = { steps: [] };
  const read = n => {
    const type = ({ 0: 'none', 32: 'string', 64: 'int', 128: 'bool' })[S.getPrefType(n)];
    if (!type) throw new Error('Unknown preference type');
    const value = type === 'string' ? S.getStringPref(n) : type === 'int' ? S.getIntPref(n) : type === 'bool' ? S.getBoolPref(n) : null;
    return Object.freeze({ type, value, hasUser: S.prefHasUserValue(n) });
  };
  try {
    if (state?.schema !== 2 || state.snapshotComplete || state.prefs) throw new Error('A fresh validated baseline is required; never resnapshot a running case');
    const startup = JSON.parse(await Z.ZoteroTTS.diagnostics.startup());
    if (startup.version !== state.expectedVersion) throw new Error('Installed build changed');
    if (JSON.parse(await Z.ZoteroTTS.diagnostics.positionSync()).folder !== false) throw new Error('Driver must isolate WebDAV before this case');
    const snapshots = Object.fromEntries(Object.entries(names).map(([slot, name]) => [slot, read(name)]));
    const records = {};
    const branch = S.getBranch(P);
    for (const key of branch.getChildList('').sort()) {
      if (key.startsWith('documentVoices.')) records[key] = read(P + key);
    }
    const rows = JSON.parse(await Z.ZoteroTTS.diagnostics.position()).database?.rows;
    if (!Number.isInteger(rows) || rows < 0) throw new Error('Position baseline unavailable');
    const native = snapshots.nativeVoices;
    if (native.type !== 'none' && native.type !== 'string') throw new Error('Native voice memory is not a string');
    const map = native.value ? JSON.parse(native.value) : {};
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Native voice memory is not a map');
    state.prefs = Object.freeze(snapshots);
    state.docVoiceRecords = Object.freeze(records);
    state.rowsBaseline = rows;
    state.snapshotComplete = true;
    // Only the fixture's en lane is isolated; other lanes remain semantically unchanged.
    delete map.en;
    S.setStringPref(names.nativeVoices, JSON.stringify(map));
    S.setIntPref(names.volume, 0);
    out.prefShapes = Object.fromEntries(Object.entries(snapshots).map(([slot, s]) => [slot, { type: s.type, hasUser: s.hasUser }]));
    out.positionRows = rows;
    out.ownerRecordCount = Object.keys(records).length;
    out.ok = S.getIntPref(names.volume) === 0;
  } catch (e) { out.ok = false; out.error = String(e); }
  return JSON.stringify(out);
})()
