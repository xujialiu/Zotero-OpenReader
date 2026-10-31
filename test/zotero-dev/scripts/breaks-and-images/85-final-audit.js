// An independent read-only audit after 80, trusting nothing it reported: the
// installed bundle's SHA-256 and startup(), every captured pref reread by its exact
// full name (value, type, user flag), the Document voice branch against the baseline,
// no item titled ztts209 left, no reader of ours open, the owner's reader and saved
// position, the position row count, the WebDAV folder, the window. Also writes the
// samples 30 collected (state.samples, voices masked) to <run dir>/samples-all.json so
// they outlive Zotero's run state. Read-only apart from that file.
// params: expectedBundle (sha256). state: reads baseline, webdav, fx, owner, samples.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'final-audit' };
  const P = 'extensions.zotero.zotero-tts.';
  const base = state.baseline;
  const win = Zotero.getMainWindow();
  const sha256Hex = (bytes) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256); d.update(bytes, bytes.byteLength);
    const raw = d.finish(false); let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };
  const readPref = (full) => {
    const t = Services.prefs.getPrefType(full);
    if (t === 0) return { type: 'none', value: null, user: false };
    const value = t === 32 ? Services.prefs.getStringPref(full) : t === 64 ? Services.prefs.getIntPref(full) : Services.prefs.getBoolPref(full);
    return { type: ({ 32: 'str', 64: 'int', 128: 'bool' })[t], value, user: Services.prefs.prefHasUserValue(full) };
  };
  const same = (a, b) => a.type === b.type && a.value === b.value && a.user === b.user;

  // The build.
  const xpi = Zotero.Profile.dir + '/extensions/zotero-tts@xujialiu.top.xpi';
  const zr = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
  zr.open(Zotero.File.pathToFile(xpi));
  const tmp = PathUtils.join(Zotero.getTempDirectory().path, 'ztts209-audit.js');
  zr.extract('content/zotero-tts.js', Zotero.File.pathToFile(tmp));
  zr.close();
  out.bundleSha256 = sha256Hex(new Uint8Array(await IOUtils.read(tmp)));
  await IOUtils.remove(tmp);
  out.bundleMatches = out.bundleSha256 === p.expectedBundle;
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.startup = { version: startup.version, steps: (startup.steps || []).length, failed: startup.failed };

  // Prefs, by exact full name.
  out.mismatchedPrefs = Object.keys(base.prefs).filter((n) => !same(readPref(n), base.prefs[n])).map((n) => n.replace(P, 'tts:').replace('extensions.zotero.', 'z:'));
  const dvPrefix = P + 'documentVoices.';
  const now = Services.prefs.getChildList(dvPrefix).filter((n) => n !== dvPrefix);
  out.documentVoices = {
    baselineCount: Object.keys(base.documentVoices).length, nowCount: now.length,
    foreign: now.filter((n) => !(n in base.documentVoices)).length,
    missing: Object.keys(base.documentVoices).filter((n) => !now.includes(n)).length,
    changed: Object.keys(base.documentVoices).filter((n) => now.includes(n) && !same(readPref(n), base.documentVoices[n])).length,
  };
  out.webdav = { value: Services.prefs.getBoolPref(P + 'webdav.enabled', false), user: Services.prefs.prefHasUserValue(P + 'webdav.enabled'), snapshot: state.webdav, folder: JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder };
  out.volume = readPref(P + 'readAloud.volume');

  // Library and readers.
  const s = new Zotero.Search();
  s.libraryID = Zotero.Libraries.userLibraryID;
  s.addCondition('title', 'contains', 'ztts209');
  s.addCondition('includeParentsAndChildren', 'true');
  out.ztts209Items = (await s.search()).length;
  out.fixtureIdsStillThere = Object.values(state.fx).filter((r) => Zotero.Items.get(r.id)).length;
  const titleOf = (id) => { const it = id ? Zotero.Items.get(id) : null; return String((it?.parentItem ?? it)?.getField?.('title') ?? '').slice(0, 40); };
  out.readers = (Zotero.Reader._readers || []).map((r) => {
    let m = null; try { m = r._internalReader?._readAloudManager; } catch (e) { /* none */ }
    return { itemID: r.itemID, title: titleOf(r.itemID), active: !!m?.active };
  });

  // The owner's reader and saved position; position rows.
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const row = (pos.readers || []).find((r) => r.itemID === state.owner.itemID) ?? null;
  out.owner = { open: !!row, active: row?.active ?? null, stored: row?.stored ?? null, storedSameAsBefore: !!row && JSON.stringify(row.stored) === JSON.stringify(state.owner.before.position.row.stored) };
  out.positionRows = { now: pos.database?.rows ?? null, baseline: base.positionRows };

  // Window.
  out.window = { windowState: win.windowState, selectedTab: win.Zotero_Tabs.selectedID, baselineSelectedTab: base.window.selectedTab, settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug.storing };

  // The evidence the run collected, to disk.
  const dir = PathUtils.join(p.tmpDir, p.runId);
  await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
  await IOUtils.writeUTF8(PathUtils.join(dir, 'samples-all.json'), JSON.stringify(state.samples ?? [], null, 1));
  out.samplesWritten = (state.samples ?? []).map((g) => `${g.which}/${g.label}: ${g.samples.map((x) => x.index).join(',')}`);

  out.ok = out.bundleMatches && out.startup.failed.length === 0 && out.mismatchedPrefs.length === 0
    && out.documentVoices.foreign === 0 && out.documentVoices.missing === 0 && out.documentVoices.changed === 0
    && out.webdav.folder === false && out.webdav.value === state.webdav.value && out.webdav.user === state.webdav.user
    && out.ztts209Items === 0 && out.fixtureIdsStillThere === 0 && out.readers.length === 1 && out.readers[0].itemID === state.owner.itemID && out.readers[0].active === false
    && out.owner.storedSameAsBefore && out.positionRows.now === out.positionRows.baseline
    && out.window.windowState === 2 && out.window.selectedTab === out.window.baselineSelectedTab && out.window.settingsWindowOpen === false && out.window.debugStoring === base.debugStoring;
  return JSON.stringify(out, null, 1);
})()
