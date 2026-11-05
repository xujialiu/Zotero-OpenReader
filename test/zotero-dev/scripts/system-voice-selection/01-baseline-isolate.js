// Case: system-voice-selection, item 1 — baseline, isolation, mute.
// Corrected order (the 2026-11-05 first revision computed folderOffConfirmed
// from the pre-write folder state and never enforced transport idleness):
// (1) snapshot the named prefs' effective values AND user flags plus the
// documentVoices values, before any mutation; a retained snapshot is never
// replaced on resume; (2) require all four transports (positions, shared
// positions, settings-sync, settings auto-upload) idle and stable within a
// bounded settle — failing closed with NO preference write; (3) only then
// set the WebDAV folder off and confirm folder:false; (4) only then mute.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.zotero-tts.';
  const PREFS = [
    P + 'webdav.enabled',
    P + 'system.enabled',
    P + 'readAloud.volume',
    P + 'readAloud.defaultVoice',
    P + 'readAloud.memory',
    P + 'readAloud.favoriteVoices',
    P + 'readAloud.favoritesOnly',
    P + 'readAloud.sameForAllDocuments',
    'extensions.zotero.reader.readAloudVoices',
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefs = Services.prefs;

  // 1. Snapshot before any mutation; never replace a retained snapshot
  if (S.svsPrefs) throw new Error('fail-closed: a retained snapshot already exists in run state; refusing to replace it (resume protection)');
  const readPref = (name) => {
    const t = prefs.getPrefType(name);
    if (t === 0) return { user: false, value: null, effective: null, type: 'none' };
    const user = prefs.prefHasUserValue(name);
    let effective = null;
    if (t === 32) effective = prefs.getStringPref(name);
    else if (t === 64) effective = prefs.getIntPref(name);
    else if (t === 128) effective = prefs.getBoolPref(name);
    return { user, value: user ? effective : null, effective, type: t === 32 ? 'string' : t === 64 ? 'int' : t === 128 ? 'bool' : String(t) };
  };
  const snap = {};
  for (const name of PREFS) snap[name] = readPref(name);
  const docBranch = prefs.getBranch(P + 'documentVoices.');
  const doc = {};
  for (const k of docBranch.getChildList('')) {
    const full = P + 'documentVoices.' + k;
    if (prefs.prefHasUserValue(full) && prefs.getPrefType(full) === 32) doc[k] = prefs.getStringPref(full);
  }
  snap.__documentVoices = doc;
  S.svsPrefs = snap;
  try { S.svsSettingsWindowAtBaseline = !!Services.wm.getMostRecentWindow('zotero:pref'); } catch (e) { S.svsSettingsWindowAtBaseline = false; }
  out.prefs = PREFS.map((n) => ({ pref: n.replace('extensions.zotero.', ''), user: snap[n].user, effective: snap[n].effective }));
  out.documentVoices = { keys: Object.keys(doc).length };
  out.settingsWindowAtBaseline = S.svsSettingsWindowAtBaseline;

  // 2. Record-only: debug store, errors ring, window/tabs, readers, position rows
  try {
    S.svsDebugStoring = Zotero.Debug.storing;
    Zotero.Debug.setStore(true);
    out.debugStore = { was: S.svsDebugStoring };
    S.svsErrorsBaseline = Zotero.getErrors();
    out.errorsBaseline = { count: S.svsErrorsBaseline.length };
  } catch (e) { out.errorsError = String(e); }
  try {
    const win = Zotero.getMainWindow();
    const st = { windowState: win.windowState, screenX: win.screenX, screenY: win.screenY, width: win.innerWidth, height: win.innerHeight, selectedID: win.Zotero_Tabs?.selectedID ?? null };
    S.svsWindow = st;
    out.window = st;
    out.readers = (Zotero.Reader._readers ?? []).map((r) => {
      const m = r?._internalReader?._readAloudManager;
      const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
      return { title: ((item?.parentItem ?? item)?.getField('title') || '').slice(0, 44), active: m ? !!m.active : null, paused: m ? !!m.paused : null, voice: m?.selectedVoiceID ?? null };
    });
  } catch (e) { out.windowError = String(e); }
  try {
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    S.svsRowsBaseline = pos.database?.rows ?? null;
    out.position = { rows: pos.database?.rows ?? null, legacyPref: pos.legacyPref ?? null };
  } catch (e) { out.positionError = String(e); }

  // 3. Settle all four transports (bounded) — no preference write before this passes
  const readAll = async () => {
    const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const ss = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const su = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    return {
      folder: ps.folder,
      positions: { running: ps.transport?.running ?? null, outcome: ps.transport?.lastOutcome ?? null, error: ps.transport?.lastError ?? null },
      sharedPositions: { running: ps.shared?.transport?.running ?? null, outcome: ps.shared?.transport?.lastOutcome ?? null, error: ps.shared?.transport?.lastError ?? null },
      settingsSync: { running: ss.transport?.running ?? null, pendingChange: ss.transport?.pendingChange ?? null, outcome: ss.transport?.lastOutcome ?? null, error: ss.transport?.lastError ?? null },
      settingsUpload: { pending: su.autoUpload?.pending ?? null, outcome: su.autoUpload?.lastOutcome ?? null, error: su.autoUpload?.lastError ?? null },
    };
  };
  const idle = (x) => x.positions.running === false && x.sharedPositions.running === false && x.settingsSync.running === false && x.settingsSync.pendingChange === false && x.settingsUpload.pending === false;
  let t1 = await readAll();
  let ok = idle(t1);
  for (let i = 0; i < 20 && !ok; i++) { await sleep(500); t1 = await readAll(); ok = idle(t1); }
  const t2 = await readAll();
  const settled = ok && idle(t2) && JSON.stringify(t1) === JSON.stringify(t2);
  out.transports = { settled, observed: t2 };
  if (!settled) throw new Error('fail-closed: the four transports did not settle idle before isolation; no preference write was made — ' + JSON.stringify(t2));

  // 4. Isolate: folder off (only if effective on), confirm, then mute
  const webdav = P + 'webdav.enabled';
  const w = snap[webdav];
  if ((w.effective ?? false) === true) Services.prefs.setBoolPref(webdav, false);
  await sleep(500);
  const after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.folderOff = { wasEffective: w.effective ?? null, hadUser: w.user ?? false, folderNow: after.folder, confirmed: after.folder === false };
  if (out.folderOff.confirmed !== true) throw new Error('fail-closed: folder:false was not confirmed after the write; mute skipped — ' + JSON.stringify(after));
  const vol = P + 'readAloud.volume';
  const v = snap[vol];
  Services.prefs.setIntPref(vol, 0);
  out.mute = { hadUser: v.user ?? false, effectiveBefore: v.effective ?? null, now: prefs.getIntPref(vol, -1) };
  return JSON.stringify(out, null, 1);
})()
