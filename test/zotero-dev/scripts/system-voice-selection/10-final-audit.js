// Case: system-voice-selection, item 6 — final audit, run AFTER 09's WebDAV
// restore once the folder-on debounce has had time to drain. Requires, in one
// retained record: all four transports idle and stable across two reads, the
// folder flag at its snapshot value, every snapshotted pref's user flag and
// effective value equal to the snapshot, and the documentVoices branch equal
// in key set and contents. Read-only — no writes of any kind.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = 'extensions.zotero.zotero-tts.';
  const snap = S.svsPrefs;
  if (!snap) throw new Error('no retained snapshot');
  const prefs = Services.prefs;
  const readAll = async () => {
    const prefsNow = {};
    for (const name of Object.keys(snap).filter((n) => n && !n.startsWith('__'))) {
      const before = snap[name];
      const t = prefs.getPrefType(name);
      const user = t !== 0 && prefs.prefHasUserValue(name);
      let effective = null;
      if (t === 32) effective = prefs.getStringPref(name);
      else if (t === 64) effective = prefs.getIntPref(name);
      else if (t === 128) effective = prefs.getBoolPref(name);
      prefsNow[name] = user === before.user && JSON.stringify(effective) === JSON.stringify(before.effective ?? before.value) ? 'match' : 'DIFF';
    }
    const docBranch = prefs.getBranch(P + 'documentVoices.');
    const docNow = {};
    for (const k of docBranch.getChildList('')) {
      const full = P + 'documentVoices.' + k;
      if (prefs.prefHasUserValue(full) && prefs.getPrefType(full) === 32) docNow[k] = prefs.getStringPref(full);
    }
    const docBefore = snap.__documentVoices || {};
    const docMatch = JSON.stringify(Object.keys(docBefore).sort()) === JSON.stringify(Object.keys(docNow).sort())
      && Object.keys(docBefore).every((k) => docNow[k] === docBefore[k]);
    const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const ss = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const su = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    return JSON.stringify({
      folder: ps.folder,
      prefs: prefsNow, documentVoices: docMatch ? 'match' : 'DIFF',
      rows: pos.database ? pos.database.rows : null,
      positions: { running: ps.transport?.running ?? null, outcome: ps.transport?.lastOutcome ?? null },
      sharedPositions: { running: ps.shared?.transport?.running ?? null, outcome: ps.shared?.transport?.lastOutcome ?? null },
      settingsSync: { running: ss.transport?.running ?? null, pendingChange: ss.transport?.pendingChange ?? null, outcome: ss.transport?.lastOutcome ?? null },
      settingsUpload: { pending: su.autoUpload?.pending ?? null, outcome: su.autoUpload?.lastOutcome ?? null },
      readers: (Zotero.Reader._readers || []).map((r) => { const um = r._internalReader ? r._internalReader._readAloudManager : null; return um ? { active: !!um.active, paused: !!um.paused, voice: um.selectedVoiceID ?? null } : null; }),
      windowState: Zotero.getMainWindow().windowState,
    });
  };
  // Stability compares a canonical subset: volatile counters (uploads) are excluded
  const drain = async () => {
    for (let i = 0; i < 24; i++) {
      const s = JSON.parse(await readAll());
      const t = JSON.parse(await readAll());
      const idle = s.settingsUpload.pending === false && t.settingsUpload.pending === false && s.settingsSync.running === false && t.settingsSync.running === false && s.settingsSync.pendingChange === false && t.settingsSync.pendingChange === false && s.positions.running === false && t.positions.running === false && s.sharedPositions.running === false && t.sharedPositions.running === false;
      const stable = JSON.stringify([s.folder, s.prefs, s.documentVoices, s.rows, s.positions, s.sharedPositions, s.settingsSync, s.settingsUpload, s.readers, s.windowState]) === JSON.stringify([t.folder, t.prefs, t.documentVoices, t.rows, t.positions, t.sharedPositions, t.settingsSync, t.settingsUpload, t.readers, t.windowState]);
      if (idle && stable) return JSON.stringify(s);
      await sleep(2000);
    }
    return null;
  };
  const settled = await drain();
  out.audit = settled ? JSON.parse(settled) : null;
  out.allFourIdle = !!settled && (() => { const a = JSON.parse(settled); return a.positions.running === false && a.sharedPositions.running === false && a.settingsSync.running === false && a.settingsSync.pendingChange === false && a.settingsUpload.pending === false; })();
  out.valuesFlagsDocsEqual = !!settled && !JSON.parse(settled).prefs['x'] && Object.values(JSON.parse(settled).prefs).every((v) => v === 'match') && JSON.parse(settled).documentVoices === 'match';
  out.rowsAtBaseline = !!settled && JSON.parse(settled).rows === S.svsRowsBaseline;
  return JSON.stringify(out, null, 1);
})()
