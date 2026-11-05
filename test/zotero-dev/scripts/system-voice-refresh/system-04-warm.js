// system-voice-refresh 04: warm the NEW build's helper and measure it (#241 item 2 prep).
// diagnostics.systemProvider() without a voice argument: nothing synthesizes.
// Records the full id list, the sapi5/onecore split, the Andrew token, and the
// running helper's PID (powershell processes with -EncodedCommand, read-only CIM query).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const ANDREW = 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const countBy = (voices, re) => voices.filter((v) => re.test(v.id)).length;
  const zoteroPid = Services.appinfo.processID;
  // Corrected probe (executed in the 2026-11-05 mini-pass via system-06): only powershell
  // children of the Zotero process whose command line carries -EncodedCommand, excluding
  // the enumerator itself via $PID — the part-1 probe matched its own command line.
  const helperPids = async () => {
    const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const proc = await Subprocess.call({
      command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      arguments: ['-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | ForEach-Object { if ($_.ProcessId -ne $PID -and $_.ParentProcessId -eq " + zoteroPid + " -and $_.CommandLine -match '-EncodedCommand') { \"{0}|{1}\" -f $_.ProcessId, $_.CreationDate.ToString('yyyy-MM-ddTHH:mm:ss') } }"],
      stderr: 'pipe',
    });
    let out = '';
    for (;;) {
      const chunk = await proc.stdout.readString();
      if (!chunk) break;
      out += chunk;
    }
    try { await proc.wait(); } catch (e) { proc.kill(); }
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+\|/.test(s)).sort();
  };
  try {
    const started = Date.now();
    const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const voices = rep.voices || [];
    const out = {
      ms: Date.now() - started,
      enabled: rep.enabled,
      platform: rep.platform,
      backend: rep.backend ? { running: rep.backend.running, starts: rep.backend.starts, sent: rep.backend.sent, lastError: rep.backend.lastError } : null,
      count: voices.length,
      sapi5: countBy(voices, /^sapi5\//),
      onecore: countBy(voices, /^onecore\//),
      andrew: voices.find((v) => v.id === ANDREW) || null,
      firstVoice: voices[0] ? { id: voices[0].id, name: voices[0].name } : null,
      voicesError: rep.voicesError ?? null,
      ids: voices.map((v) => v.id),
    };
    out.helperPids = await helperPids();
    state.warm = out;
    state.helperPidsBefore = out.helperPids;
    return JSON.stringify({
      ms: out.ms, enabled: out.enabled, count: out.count, sapi5: out.sapi5, onecore: out.onecore,
      andrewToken: out.andrew ? out.andrew.id : null,
      andrewName: out.andrew ? out.andrew.name : null,
      firstVoice: out.firstVoice, backend: out.backend,
      helperPids: out.helperPids,
      countVsResearch39: out.count === 39 ? 'matches research (39 = 33 sapi5 + 6 onecore)' : `differs: ${out.count} (${out.sapi5} sapi5 + ${out.onecore} onecore)`,
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
