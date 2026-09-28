(async () => {
  // Issue #154: post-install identity, list adjacency, audio device probe.
  const session = Zotero.__ztts154;
  if (!session?.baseline || !session.fixtures) throw new Error('154 baseline/fixtures are missing');
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 120) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const itemID = session.fixtureItemID;
  const out = { status: 'FAIL', errors: [] };
  try {
    // Installed build identity (mechanism proof via installPath follows outside).
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addons = await AddonManager.getAllAddons();
    for (let i = 0; i < addons.length; i++) {
      if (addons[i]?.id === 'zotero-tts@xujialiu.top') {
        let path = null;
        try { path = addons[i].installPath ? addons[i].installPath.path : null; } catch (_) {}
        out.addon = { version: addons[i].version, active: !!addons[i].isActive, installPath: path };
      }
    }
    if (!out.addon) throw new Error('zotero-tts@xujialiu.top not found after install');

    const list = Zotero.Reader?._readers || [];
    let reader = null;
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) { reader = list[i]; break; } } catch (_) {}
    }
    if (!reader) throw new Error('fixture reader is gone after install');
    session.fixtureReader = reader;
    const internal = reader._internalReader;
    const manager = internal?._readAloudManager;
    if (!manager) throw new Error('fixture manager is gone after install');

    // Re-seed if the in-place install ended the session: open popup (plays) and pause at once.
    const engine0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    let tab0 = engine0.readers.find(row => Number(row.itemID) === Number(itemID)) || null;
    if (!tab0?.session || tab0.session.ended) {
      const main = Zotero.getMainWindow?.();
      if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
      await sleep(300);
      internal.toggleReadAloudPopup(true);
      await waitFor(() => !!manager.active && !manager.paused, 12000, 120);
      try { Components.utils.waiveXrays(manager).pause(); } catch (e) {}
      await waitFor(() => !!manager.active && manager.paused, 8000, 100);
    }

    // List adjacency for the Shift+. keys (waiveXrays: reader-compartment content).
    const mw = Components.utils.waiveXrays(manager);
    const ids = [];
    const vsRow = mw.voicesForLanguage || [];
    for (let i = 0; i < vsRow.length; i++) ids.push(Components.utils.waiveXrays(vsRow[i])?.id ?? null);
    out.voicesForLanguage = ids;
    out.adjacency = {
      selected: mw.selectedVoiceID ?? null,
      indexA: ids.indexOf(session.voiceA), indexB: ids.indexOf(session.voiceB),
      count: ids.length,
    };
    out.adjacency.ok = out.adjacency.indexA >= 0 && out.adjacency.indexB === (out.adjacency.indexA + 1) % ids.length;

    const readEngine = async () => {
      const engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      return engine.readers.find(row => Number(row.itemID) === Number(itemID)) || null;
    };

    // Audio device probe: session started any way must run and advance.
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (_) {}
    const playError = (() => { try { mw.play(); return null; } catch (e) { return String(e); } })();
    await waitFor(async () => {
      const t = await readEngine();
      return t?.session?.playing === true;
    }, 8000, 100);
    let first = await readEngine();
    // Give the output a moment, then sample twice.
    await waitFor(async () => {
      first = await readEngine();
      return first?.audio?.state === 'running' || first?.session?.playbackTime > 0;
    }, 6000, 150);
    await sleep(500);
    const second = await readEngine();
    out.probe = {
      playError,
      audioState: second?.audio?.state ?? first?.audio?.state ?? null,
      playbackTimeA: first?.session?.playbackTime ?? null,
      playbackTimeB: second?.session?.playbackTime ?? null,
      advanced: (Number(second?.session?.playbackTime) || 0) > (Number(first?.session?.playbackTime) || 0),
      positionA: first?.session?.position ?? null,
      positionB: second?.session?.position ?? null,
      voiceA: first?.session?.voice ?? null,
    };
    // Pause again for a quiet starting state.
    try { if (mw.active && !mw.paused) mw.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); }
    const engineFinal = await readEngine();
    out.finalState = { paused: !!engineFinal?.session?.paused, position: engineFinal?.session?.position ?? null, voice: engineFinal?.session?.voice ?? null };
    out.status = out.addon.version === '1.16.2-beta' && out.adjacency.ok && out.probe.audioState === 'running' && out.probe.advanced ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out, null, 1);
})();
