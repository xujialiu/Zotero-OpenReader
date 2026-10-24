// 232-06 — item 5.4 steps 4–5: commit W through the Player page and verify
// the fix's mechanism-sensitive outcome: manager selected, Player voice,
// native 'en' entry and the independently read saved Document voice ALL W;
// manual true, draft null, chooseVoice false, no selection failure; W != V.
// The idle native ingress may activate: evidence first, then pause promptly.
(async () => {
  const Z = Zotero;
  const out = { steps: [] };
  const state = (Z.ZoteroTTSRun.state.ep232 ||= {});
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); return ok ? undefined : detail; };
  const wx = Components.utils.waiveXrays;
  const latestConsoleT = () => {
    try {
      const msgs = Services.console.getMessageArray();
      let t = 0;
      for (let i = 0; i < msgs.length; i++) { const x = Number(msgs[i]?.timeStamp ?? 0); if (x > t) t = x; }
      return t;
    } catch (e) { return 0; }
  };
  try {
    const reader = (Z.Reader._readers ?? []).find((r) => r.itemID === state.fixture?.itemID) ?? null;
    if (state.schema !== 2 || !state.snapshotComplete || !state.fixture?.created || !reader?._internalReader?._readAloudManager) throw new Error('validated fixture reader not open');
    const m = wx(reader._internalReader._readAloudManager);
    const W = state.W, V = state.V;
    if (!W || !V) throw new Error('232-05 has not run');

    // Player page frame
    let playerWin = null;
    const doc = reader._iframeWindow?.document;
    if (doc) {
      const frames = doc.querySelectorAll('iframe');
      for (let i = 0; i < frames.length; i++) {
        const w = wx(frames[i].contentWindow);
        if (w && typeof w.zttsCommand === 'function') { playerWin = w; break; }
      }
    }
    step('player-page-found', !!playerWin, 'frame with zttsCommand');
    if (!playerWin) { out.ok = false; return JSON.stringify(out); }

    const consoleBefore = latestConsoleT();
    state.preCommitConsoleT = consoleBefore;

    // Commit W through the Player page
    try { await playerWin.zttsCommand('voice', W); }
    finally { if (m.active) m.pause(); } // Observe the choice, not extended local playback.
    let after = null;
    for (let i = 0; i < 12; i++) {
      after = JSON.parse(await Z.ZoteroTTS.diagnostics.voiceSwitch());
      const mine = (after.readers ?? []).find(row => row.index === state.reader.index) ?? null;
      if (mine && mine.handoff?.draft == null && mine.player?.voice === W) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const mine = (after?.readers ?? []).find(row => row.index === state.reader.index) ?? null;
    out.after = mine ? {
      selected: mine.selected, paused: mine.paused,
      player: mine.player, draft: mine.handoff?.draft ?? null,
    } : null;

    step('manager-selected-W', mine?.selected === W, `selected=${String(mine?.selected ?? '').slice(0, 60)}`);
    step('player-voice-W', mine?.player?.voice === W, `voice=${String(mine?.player?.voice ?? '').slice(0, 60)}`);
    step('chooseVoice-cleared', mine?.player?.chooseVoice === false, `chooseVoice=${mine?.player?.chooseVoice}`);
    step('draft-null', mine?.handoff?.draft == null, JSON.stringify(mine?.handoff?.draft ?? null));

    // Native language entry (the pref's 'en' lane)
    try {
      const name = 'extensions.zotero.reader.readAloudVoices';
      const raw = Services.prefs.getPrefType(name) === 32 ? Services.prefs.getStringPref(name) : '';
      const map = raw ? JSON.parse(raw) : {};
      const en = map['en'] ?? null;
      state.nativeEntryAfter = en ? { voice: String(en.voice ?? ''), region: en.region ?? null, hasTierVoices: !!en.tierVoices, tiers: en.tierVoices ? Object.keys(en.tierVoices) : [] } : null;
      out.nativeEntry = state.nativeEntryAfter ? { voice: state.nativeEntryAfter.voice.slice(0, 70), region: state.nativeEntryAfter.region, tiers: state.nativeEntryAfter.tiers } : null;
      step('native-entry-W', !!en && en.voice === W, out.nativeEntry ? `voice=${out.nativeEntry.voice}` : 'no en entry');
    } catch (e) { step('native-entry', false, String(e)); }

    // Independent saved Document voice read (the plugin's own diagnostic)
    const dv = JSON.parse(await Z.ZoteroTTS.diagnostics.documentVoices());
    const saved = (dv.readers ?? []).find((r) => r.key === `user/${state.fixture.key}`)?.saved ?? null;
    out.savedAfter = saved ? { id: String(saved.voice?.id ?? ''), lang: String(saved.voice?.lang ?? ''), manual: !!saved.manual } : null;
    step('saved-W-manual', out.savedAfter?.id === W && out.savedAfter?.manual === true, JSON.stringify(out.savedAfter));

    step('W-distinct-from-V', W !== V, `W=${String(W).split('.').pop()} V=${String(V).split('.').pop()}`);

    // Console movement is evidence to classify, not a selection failure by itself.
    const consoleAfter = latestConsoleT();
    out.newConsoleSinceCommit = consoleAfter > consoleBefore;
    const notice = mine?.handoff?.notice;
    step('no-selection-failure', notice !== 'failed' && notice !== 'unavailable', `notice=${notice ?? 'none'}; console review required`);

    // The idle native ingress: pause promptly once the evidence is captured
    out.activated = !!m.active;
    if (m.active) {
      out.pausedAfter = !!wx(reader._internalReader._readAloudManager).paused;
      out.pausedPromptly = out.pausedAfter;
      step('paused-promptly', out.pausedAfter === true, `paused=${out.pausedAfter}`);
    } else {
      out.pausedAfter = null;
      step('paused-promptly', true, 'never activated');
    }

    out.ok = out.steps.every((s) => s.ok);
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, fatal: String(e), steps: out.steps });
  }
})()
