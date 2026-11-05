// system-voice-refresh 06: the real Test connection on the System section, clicked ONCE,
// with every measurement around it (#241 item 2). Click and poll in ONE script.
// Before: helper PID set (creation times), applied count, identities.
// Click ztts-test-system, poll the result line into a trace.
// After: system.enabled, debug trace for the daemon stop/start lines, PID replacement,
// manager list + selected voice/controller identity + paused, applied count rise.
// REVISED after the executed 2026-11-05 run: the liveVoiceList entry is matched by
// itemID (the first run read the closed owner reader), and the PID probe counts only
// powershell children of the Zotero process, excluding its own enumerator via $PID.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const ANDREW = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const DAVID = 'system::sapi5/TTS_MS_EN-US_DAVID_11.0';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waived = (v) => Components.utils.waiveXrays(v);
  const idsOf = (list) => {
    const out = [];
    try {
      const w = waived(list);
      for (let i = 0; i < (w ? w.length : 0); i++) if (typeof w[i]?.id === 'string') out.push(w[i].id);
    } catch (e) { out.push('walk-error: ' + String(e).slice(0, 80)); }
    return out;
  };
  const zoteroPid = Services.appinfo.processID;
  const helperPids = async () => {
    const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const proc = await Subprocess.call({
      command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      arguments: ['-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | ForEach-Object { if ($_.ProcessId -ne $PID -and $_.ParentProcessId -eq " + zoteroPid + " -and $_.CommandLine -match '-EncodedCommand') { \"{0}|{1}\" -f $_.ProcessId, $_.CreationDate.ToString('yyyy-MM-ddTHH:mm:ss') } }"],
      stderr: 'pipe',
    });
    let out = '';
    for (;;) { const chunk = await proc.stdout.readString(); if (!chunk) break; out += chunk; }
    try { await proc.wait(); } catch (e) { proc.kill(); }
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+\|/.test(s)).sort();
  };
  // One entry per reader, in Zotero.Reader._readers order: match the fixture by itemID
  const liveEntryFor = (live, itemID) => {
    const readers = Zotero.Reader._readers || [];
    const index = readers.findIndex((r) => r.itemID === itemID);
    return index >= 0 ? live[index] : null;
  };
  const reader = () => (Zotero.Reader._readers || []).find((r) => r.itemID === state.fixture.itemID);
  const managerState = () => {
    const m = waived(reader()._internalReader._readAloudManager);
    return {
      selectedVoiceID: m.selectedVoiceID ?? null,
      active: !!m.active, paused: !!m.paused,
      controllerPaused: m._controller ? !!m._controller.paused : null,
      sameVoiceRef: state.fixtureManager.voiceRef === m._voice,
      sameControllerRef: state.fixtureManager.controllerRef === m._controller,
      andrewInList: idsOf(m._allVoices).includes(ANDREW),
      davidInList: idsOf(m._allVoices).includes(DAVID),
      listCount: idsOf(m._allVoices).length,
    };
  };
  try {
    if (!state.fixture) throw new Error('fixture state missing: run 05 first');
    const pidsBefore = await helperPids();
    const liveBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    const liveBeforeFixture = liveEntryFor(liveBefore, state.fixture.itemID);
    const managerBefore = managerState();
    const debugMark = 'MARKER-' + Date.now();
    Zotero.debug(debugMark);
    // The settings pane, on the plugin's own section (closed windows first: none known)
    const closePrefs = async () => {
      const w = Services.wm.getMostRecentWindow('zotero:pref');
      if (w?.close) w.close();
      const end = Date.now() + 7000;
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < end) await sleep(200);
    };
    await closePrefs();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let prefWin = null;
    for (let i = 0; i < 35 && !prefWin; i++) { await sleep(200); prefWin = Services.wm.getMostRecentWindow('zotero:pref'); }
    if (!prefWin) throw new Error('settings window did not open');
    if (prefWin.Zotero_Preferences?.navigateToPane) await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    let doc = null;
    for (let i = 0; i < 50 && !doc; i++) { await sleep(200); doc = prefWin.document.getElementById('ztts-provider-system') ? prefWin.document : null; }
    if (!doc) throw new Error('Zotero-OpenReader pane did not load');
    const testButton = doc.getElementById('ztts-test-system');
    const resultLine = doc.getElementById('ztts-test-result-system');
    const toggleButton = doc.getElementById('ztts-enable-system');
    if (!testButton || testButton.disabled) throw new Error('Test connection button missing or disabled before the click');
    // THE click, once, then a poll trace
    const trace = [];
    const t0 = Date.now();
    testButton.click();
    for (let i = 0; i < 200; i++) {
      await sleep(150);
      const label = toggleButton?.getAttribute('label') || '';
      const result = (resultLine?.textContent || '').trim();
      const disabled = testButton.disabled;
      trace.push({ at: Date.now() - t0, label, disabled, result: result.slice(0, 120) });
      if (result && !disabled) break;
    }
    const finalTrace = trace.slice(0, 3).concat(trace.length > 6 ? [{ skipped: trace.length - 6 }] : [], trace.slice(-3));
    const resultText = (resultLine?.textContent || '').trim();
    const enabledAfter = Services.prefs.getBoolPref(prefix + 'system.enabled');
    // Debug trace: the daemon's stop/start lines since the marker
    const debugText = await Zotero.Debug.get();
    const lines = debugText.split('\n');
    const markAt = lines.findIndex((l) => l.includes(debugMark));
    const daemonLines = (markAt >= 0 ? lines.slice(markAt) : lines)
      .filter((l) => /speech daemon/.test(l)).map((l) => l.trim().slice(0, 160));
    const stoppedRefreshing = daemonLines.filter((l) => /speech daemon stopped: refreshing the installed voice list/.test(l)).length;
    const startedLines = daemonLines.filter((l) => /speech daemon started/.test(l)).length;
    // The helper: old PID gone, a new one appears
    const pidsAfter = await helperPids();
    const gone = pidsBefore.filter((p) => !pidsAfter.includes(p));
    const fresh = pidsAfter.filter((p) => !pidsBefore.includes(p));
    // The already-open Player: applied count rises, identities stay, paused stays
    let liveAfterFixture = null;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const live = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
      const mine = liveEntryFor(live, state.fixture.itemID);
      if (mine && liveBeforeFixture && mine.applied > liveBeforeFixture.applied) { liveAfterFixture = mine; break; }
      liveAfterFixture = mine;
    }
    await sleep(800);
    const managerAfter = managerState();
    state.afterTest = { pidsBefore, pidsAfter, resultText, daemonLines, managerAfter, liveAfter: liveAfterFixture, liveBeforeFixture };
    return JSON.stringify({
      pidsBefore, pidsAfter, pidGone: gone, pidFresh: fresh,
      resultText, systemEnabledAfter: enabledAfter,
      traceHead: finalTrace,
      stoppedRefreshingLines: stoppedRefreshing, startedLines,
      daemonLines: daemonLines.slice(0, 8),
      managerBefore, managerAfter,
      liveBeforeFixture, liveAfter: liveAfterFixture,
      appliedRose: !!(liveBeforeFixture && liveAfterFixture && liveAfterFixture.applied > liveBeforeFixture.applied),
      prefWinStillOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 500) });
  }
})()
