// Read-only build/baseline gate. The driver owns WebDAV isolation and debug
// storage before installation; no preference, Player or window is changed here.
(async () => {
  const Z = Zotero, run = Z.ZoteroTTSRun;
  const out = { steps: [] };
  try {
    const expected = run.params.expectedVersion;
    const startup = JSON.parse(await Z.ZoteroTTS.diagnostics.startup());
    if (!expected || startup.version !== expected || !Array.isArray(startup.failed) || startup.failed.length) {
      throw new Error('Install and verify params.expectedVersion before starting this kit');
    }
    const previous = run.state.ep232;
    if (previous && Object.keys(previous).length && !previous.cleaned) {
      throw new Error('Existing run state must not be overwritten; finish recovery before starting a fresh runner state');
    }
    const state = { schema: 2, startedAt: Date.now(), expectedVersion: expected };
    state.errorsBaseline = Z.getErrors() ?? [];
    state.debugStoring = !!Z.Debug.storing;
    state.consoleBaseline = Services.console.getMessageArray().map(m => ({
      t: Number(m.timeStamp ?? 0), msg: String(m.errorMessage ?? m.message ?? '').slice(0, 160),
      source: String(m.sourceName ?? ''), line: m.lineNumber ?? null,
    }));
    state.consoleBaselineMaxT = state.consoleBaseline.reduce((t, m) => Math.max(t, m.t), state.startedAt);
    state.readersBaseline = [];
    const readers = Z.Reader._readers ?? [];
    for (let i = 0; i < readers.length; i++) {
      const r = readers[i], m = r?._internalReader?._readAloudManager;
      if (m?.active) throw new Error('An owner Reading session is open; do not operate or close it');
      state.readersBaseline.push({ itemID: r.itemID, tabID: r.tabID, active: !!m?.active });
    }
    const win = Z.getMainWindow();
    state.window = { state: win.windowState, x: win.screenX, y: win.screenY,
      w: win.outerWidth, h: win.outerHeight, selectedTab: win.Zotero_Tabs?.selectedID ?? null };
    if (state.window.state !== 2) throw new Error('Driver must prepare the minimized host before this read-only baseline');
    run.state.ep232 = state;
    out.version = startup.version;
    out.ownerReaders = state.readersBaseline.length;
    out.ok = true;
  } catch (e) { out.ok = false; out.error = String(e); }
  return JSON.stringify(out);
})()
