// system-voice-refresh 10: the actual Disable→Enable path with only the fixture Player
// closed (#241 item 4). Enable must perform the same refresh (stop-refresh line + fresh
// helper), end enabled, list the same voices including local Andrew HD, and subsequent
// ordinary listings must REUSE the refreshed helper (no process per request).
// PID probe corrected: only powershell children of the Zotero process whose command line
// carries -EncodedCommand, excluding the enumerator itself via $PID.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const ANDREW = 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waived = (v) => Components.utils.waiveXrays(v);
  const zoteroPid = Services.appinfo.processID;
  const helperPids = async () => {
    const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const proc = await Subprocess.call({
      command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      arguments: ['-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | ForEach-Object { if ($_.ProcessId -ne $PID -and $_.ParentProcessId -eq " + zoteroPid + " -and $_.CommandLine -match '-EncodedCommand') { \"{0}|{1}\" -f $_.ProcessId, $_.CreationDate.ToString('HH:mm:ss') } }"],
      stderr: 'pipe',
    });
    let out = '';
    for (;;) { const chunk = await proc.stdout.readString(); if (!chunk) break; out += chunk; }
    try { await proc.wait(); } catch (e) { proc.kill(); }
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+\|/.test(s)).sort();
  };
  try {
    if (!state.fixture) throw new Error('fixture state missing');
    const fixtureReader = () => (Zotero.Reader._readers || []).find((r) => r.itemID === state.fixture.itemID);
    // 1. Close ONLY the fixture Player (the permitted exception), noting its state first
    const beforeClose = {
      active: !!waived(fixtureReader()._internalReader._readAloudManager).active,
      paused: !!waived(fixtureReader()._internalReader._readAloudManager).paused,
      selectedVoiceID: waived(fixtureReader()._internalReader._readAloudManager).selectedVoiceID ?? null,
    };
    fixtureReader()._internalReader.toggleReadAloudPopup(false);
    let closed = false;
    for (let i = 0; i < 30; i++) { await sleep(200); const m = waived(fixtureReader()._internalReader?._readAloudManager); if (m && !m.active) { closed = true; break; } }
    // 2. The pane
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed; reopen needed');
    const doc = win.document.getElementById('ztts-provider-system') ? win.document : null;
    if (!doc) throw new Error('plugin pane not shown');
    const toggle = doc.getElementById('ztts-enable-system');
    const resultLine = doc.getElementById('ztts-test-result-system');
    const mark = 'MARKER-ENABLE-' + Date.now();
    Zotero.debug(mark);
    const pidsBefore = await helperPids();
    // 3. Disable
    toggle.click();
    let disabled = false;
    for (let i = 0; i < 100; i++) {
      await sleep(150);
      if ((toggle.getAttribute('label') || '') === 'Enable' && !toggle.disabled && Services.prefs.getBoolPref(prefix + 'system.enabled') === false) { disabled = true; break; }
    }
    const enabledAfterDisable = Services.prefs.getBoolPref(prefix + 'system.enabled');
    await sleep(300);
    // 4. Enable
    toggle.click();
    const trace = [];
    const t0 = Date.now();
    let enabled = false;
    for (let i = 0; i < 200; i++) {
      await sleep(150);
      const label = toggle.getAttribute('label') || '';
      const result = (resultLine?.textContent || '').trim();
      trace.push({ at: Date.now() - t0, label, disabled: toggle.disabled, result: result.slice(0, 100) });
      if (label === 'Disable' && !toggle.disabled && result && Services.prefs.getBoolPref(prefix + 'system.enabled') === true) { enabled = true; break; }
    }
    const resultText = (resultLine?.textContent || '').trim();
    const enabledAfterEnable = Services.prefs.getBoolPref(prefix + 'system.enabled');
    // 5. The refresh trace
    const debugText = await Zotero.Debug.get();
    const lines = debugText.split('\n');
    const markAt = lines.findIndex((l) => l.includes(mark));
    const daemonLines = (markAt >= 0 ? lines.slice(markAt) : lines).filter((l) => /speech daemon/.test(l)).map((l) => l.trim().slice(0, 140));
    const stoppedRefreshing = daemonLines.filter((l) => /speech daemon stopped: refreshing the installed voice list/.test(l)).length;
    const startedLines = daemonLines.filter((l) => /speech daemon started/.test(l)).length;
    const pidsAfter = await helperPids();
    // 6. Ordinary listings REUSE the helper: two listings, starts unchanged
    const l1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const s1 = { starts: l1.backend ? l1.backend.starts : null, sent: l1.backend ? l1.backend.sent : null, count: (l1.voices || []).length, andrew: (l1.voices || []).some((v) => v.id === ANDREW) };
    const l2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const s2 = { starts: l2.backend ? l2.backend.starts : null, sent: l2.backend ? l2.backend.sent : null, count: (l2.voices || []).length, andrew: (l2.voices || []).some((v) => v.id === ANDREW) };
    const debugText2 = await Zotero.Debug.get();
    const lines2 = debugText2.split('\n');
    const daemonLines2 = (markAt >= 0 && lines2.findIndex((l) => l.includes(mark)) >= 0 ? lines2.slice(lines2.findIndex((l) => l.includes(mark))) : lines2).filter((l) => /speech daemon/.test(l)).map((l) => l.trim().slice(0, 140));
    // 7. No silent remap beyond the known fixture write
    const memoryNow = Services.prefs.getStringPref(prefix + 'readAloud.memory', '');
    const memoryUnchanged = (memoryNow === (state.prefs[prefix + 'readAloud.memory'].value ?? ''));
    return JSON.stringify({
      fixtureBeforeClose: beforeClose, fixtureClosed: closed,
      pidsBefore, pidsAfter,
      disabled, enabledAfterDisable, enabled, resultText, enabledAfterEnable,
      stoppedRefreshingLines: stoppedRefreshing, startedLines,
      daemonLines: daemonLines.slice(0, 6),
      ordinaryListing1: s1, ordinaryListing2: s2,
      daemonLinesAfterListings: daemonLines2.length,
      memoryUnchanged,
      traceHead: trace.slice(0, 2).concat(trace.slice(-2)),
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 500) });
  }
})()
