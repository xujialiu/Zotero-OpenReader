(async () => {
  // Issue #226, item 17 setup: pane state for the handoff's next-sentence gate.
  // Reads the pre-install snapshot left by the direct baseline (Zotero.__ztts226
  // .prefSnapshot) and records every value it changes here with its user-value
  // status; 226-99 restores byte-identically. Pass 1 runs the pane defaults:
  // Custom prefetch on, 5 sentences ahead, 2 requests at once.
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const S = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL', steps: {}, errors: [] };
  const step = (name, fn) => { try { out.steps[name] = fn(); } catch (e) { out.errors.push(name + ': ' + String(e)); } };
  const readPref = (name, type) => {
    try {
      if (type === 'int') return p.getIntPref(name);
      if (type === 'bool') return p.getBoolPref(name);
      return p.getStringPref(name);
    } catch (_) { return null; }
  };
  const snapshotPref = (name, type) => ({ type, value: readPref(name, type), user: p.prefHasUserValue(name) });

  const base = Zotero.__ztts226;
  if (!base?.prefSnapshot) throw new Error('the pre-install baseline snapshot is missing');

  step('mute', () => {
    const name = prefix + 'readAloud.volume';
    base.prefSnapshot[name] = base.prefSnapshot[name] ?? snapshotPref(name, 'int');
    p.setIntPref(name, 0);
    return { volume: p.getIntPref(name) };
  });
  step('sameForAllDocuments-off', () => {
    const name = prefix + 'readAloud.sameForAllDocuments';
    base.prefSnapshot[name] = base.prefSnapshot[name] ?? snapshotPref(name, 'bool');
    p.setBoolPref(name, false);
    return { now: p.getBoolPref(name) };
  });
  step('prefetch-defaults', () => {
    const rows = {};
    for (const [suffix, type, value] of [['readAloud.prefetchCustom', 'bool', true], ['readAloud.prefetchSentences', 'int', 5], ['readAloud.prefetchRequests', 'int', 2]]) {
      const name = prefix + suffix;
      base.prefSnapshot[name] = base.prefSnapshot[name] ?? snapshotPref(name, type);
      if (type === 'bool') p.setBoolPref(name, value); else p.setIntPref(name, value);
      rows[suffix] = { now: readPref(name, type), before: base.prefSnapshot[name].value, userBefore: base.prefSnapshot[name].user };
    }
    return rows;
  });
  step('favoritesOnly', () => {
    const name = prefix + 'readAloud.favoritesOnly';
    base.prefSnapshot[name] = base.prefSnapshot[name] ?? snapshotPref(name, 'bool');
    p.setBoolPref(name, true);
    return { now: p.getBoolPref(name), before: base.prefSnapshot[name].value };
  });
  step('webdav-folder-off', async () => {
    const after = JSON.parse(await S.positionSync());
    out.steps.folderAfterOff = { folder: after.folder, enabled: after.enabled };
    return { folder: after.folder, enabled: after.enabled };
  });

  // The engine reads prefetchOf at every session start; the pane numbers are
  // echoed by the next script's fixture session. Mirror the state for the kit.
  const run = Zotero.ZoteroTTSRun;
  run.state.requests226 = 2;
  out.status = out.errors.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 1);
})()
