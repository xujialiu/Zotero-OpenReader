// Baseline for the webdav-reply-bounds pass (issue #169 case, item 0 of
// test/zotero-dev/baseline.md). Startup identity, Zotero and window state,
// the open readers, the named prefs this case may touch (the password only
// as set/length), the debug store on for the run, and the errors ring's
// contents. The pref snapshot lands in Zotero.ZoteroTTSRun.state.prefs for
// webdav-10-cleanup.js; the secret is never expanded.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const step = (name, fn) => {
    try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; }
  };

  // Startup: synchronous — version, steps, failed.
  out.startup = step('startup', () => {
    const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    return { version: s.version, steps: s.steps, failed: s.failed };
  });

  out.zoteroVersion = step('zv', () => Zotero.version);

  // Window: snapshot the state, then minimize for a bridge-only run.
  out.window = step('win', () => {
    const win = Zotero.getMainWindow();
    if (!win) return { error: 'no main window' };
    const before = win.windowState;
    state.windowStateBefore = before;
    if (before !== 2) win.minimize();
    return { before, minimizedNow: before !== 2, selectedTab: win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null };
  });

  // Readers: walk by index; per tab the title and the manager's state.
  out.readers = step('readers', () => {
    const readers = Zotero.Reader._readers ?? [];
    const rows = [];
    for (let i = 0; i < readers.length; i++) {
      const r = readers[i];
      rows.push({
        itemID: r.itemID ?? null,
        title: step('t', () => Zotero.Items.get(r.itemID)?.getField('title') ?? null),
        active: !!r._internalReader?._readAloudManager?.active,
        paused: !!r._internalReader?._readAloudManager?.paused,
      });
    }
    return rows;
  });

  out.settingsWindowOpen = step('setwin', () => !!Services.wm.getMostRecentWindow('zotero:pref'));

  // The prefs this case may touch, by name; the password as set/length only.
  const prefNames = {
    url: 'zotero-tts.webdav.url',
    username: 'zotero-tts.webdav.username',
    password: 'zotero-tts.webdav.password',
    syncPositions: 'zotero-tts.webdav.syncPositions',
    autoUploadSettings: 'zotero-tts.webdav.autoUploadSettings',
    syncSettings: 'zotero-tts.webdav.syncSettings',
  };
  const snapshot = {};
  for (const [key, name] of Object.entries(prefNames)) {
    const v = Zotero.Prefs.get(name);
    snapshot[key] = key === 'password'
      ? { set: v !== undefined && v !== null && v !== '', length: typeof v === 'string' ? v.length : 0 }
      : (v === undefined ? null : v);
  }
  state.prefs = snapshot;
  out.prefs = snapshot;

  // Debug store on for the run; the original state restored at cleanup.
  state.debugWasStoring = step('dbg0', () => Zotero.Debug.storing);
  step('dbg1', () => Zotero.Debug.setStore(true));
  out.debugWasStoring = state.debugWasStoring;

  // The errors ring's contents (length means nothing).
  out.errorsRing = step('errs', () => (Zotero.getErrors() ?? []).map((s) => String(s).slice(0, 160)));

  // Position baseline: rows and legacyPref only.
  out.position = await (async () => {
    try {
      const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
      return { rows: p.database?.rows ?? null, legacyPref: p.legacyPref ?? null };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  })();

  return JSON.stringify(out);
})()
