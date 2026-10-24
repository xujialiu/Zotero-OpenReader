// 232-05 — item 5.4 step 3: open the fixture's Player (missing saved voice —
// any metered Zotero voice is paused at once and reported), identify V (the
// native pool's first System en-US voice) and the old _persistedVoices, then
// choose System + en-US through the Player page itself (zttsCommand).
// Expected: draft {system, en-US}, player voice '' chooseVoice true, the
// saved missing record retained, manager still inactive.
(async () => {
  const Z = Zotero;
  const out = { steps: [] };
  const state = (Z.ZoteroTTSRun.state.ep232 ||= {});
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); return ok ? undefined : detail; };
  const wx = Components.utils.waiveXrays;
  try {
    const reader = (Z.Reader._readers ?? []).find((r) => r.itemID === state.fixture?.itemID) ?? null;
    if (state.schema !== 2 || !state.snapshotComplete || !state.fixture?.created || !reader?._internalReader?._readAloudManager) throw new Error('validated fixture reader not open');
    const internal = reader._internalReader;
    const m = wx(internal._readAloudManager);

    // Open the Player if its voices are not loaded yet (Zotero lists voices
    // on first popup open; the player page iframe is mounted either way);
    // guard the metered fallback in the SAME script
    let sysCount = 0;
    try { const a = m.allVoices; for (let i = 0; i < (a?.length ?? 0); i++) { const v = a[i]; if (v && v.tier === 'system' && v.id) sysCount++; } } catch (e) { /* recount below */ }
    if (sysCount === 0) {
      internal.toggleReadAloudPopup(true);
      await new Promise((r) => setTimeout(r, 800));
    }
    const idNow = String(m.selectedVoiceID ?? '');
    out.popup = { active: !!m.active, selectedVoiceID: idNow.slice(0, 80), hasColons: idNow.includes('::'), toggled: sysCount === 0 };
    if (m.active) {
      try { wx(internal._readAloudManager).pause(); } catch (e) { /* report below */ }
      step('no-metered-fallback', false, `unexpected fixture reading started: ${idNow.slice(0, 60)} — paused at once`);
      out.ok = false;
      return JSON.stringify(out);
    }
    step('no-metered-fallback', true, `active=${!!m.active}`);

    // Wait for the voices list to land (the System entry was just enabled):
    // a draft whose entry has no voices yet is dropped by design. m.tiers is
    // a Set (no .length) — count the pool itself.
    let listed = false, waitMs = 0;
    while (waitMs < 10000) {
      let count = 0, anySystem = 0;
      try {
        const all = m.allVoices;
        for (let i = 0; i < (all?.length ?? 0); i++) {
          const v = all[i];
          if (v && v.tier === 'system' && v.id) anySystem++;
          if (v && v.tier === 'system' && v.language === 'en-US' && v.id) count++;
        }
      } catch (e) { /* retry */ }
      if (anySystem > 0 && count >= 2) { listed = true; break; }
      await new Promise((r) => setTimeout(r, 400));
      waitMs += 400;
    }
    step('listing-landed', listed, `waited ${waitMs} ms`);
    if (!listed) { out.ok = false; return JSON.stringify(out); }

    // V: the native pool's first System en-US voice (index walk — reader realm)
    let pool = [];
    try {
      const all = m.allVoices;
      for (let i = 0; i < all.length; i++) {
        const v = all[i];
        if (v && v.tier === 'system' && v.language === 'en-US' && v.id) pool.push({ id: String(v.id), label: String(v.label ?? '') });
      }
    } catch (e) { step('pool', false, String(e)); }
    const v = pool[0] ?? null;
    state.V = v ? v.id : null;
    out.poolSize = pool.length;
    out.V = v;
    step('native-pool-nonempty', pool.length >= 2, `${pool.length} System en-US voices — need >=2 to pick W != V`);

    // Old persisted selection
    try { out.persistedVoicesBefore = m._persistedVoices ? JSON.stringify({ voice: String(m._persistedVoices.voice ?? ''), region: m._persistedVoices.region ?? null }).slice(0, 120) : null; } catch (e) { out.persistedVoicesBefore = 'unreadable'; }
    state.persistedVoicesBefore = out.persistedVoicesBefore;

    // The Player page frame (mounted with the tab; carries zttsCommand)
    let playerWin = null, frameInfo = null;
    {
      const doc = reader._iframeWindow?.document;
      if (doc) {
        const frames = doc.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
          const w = wx(frames[i].contentWindow);
          if (w && typeof w.zttsCommand === 'function') { playerWin = w; frameInfo = { src: String(frames[i].getAttribute('src') ?? '').slice(0, 50), i }; break; }
        }
      }
    }
    state.playerWin = !!playerWin;
    out.frame = frameInfo;
    step('player-page-found', !!playerWin, JSON.stringify(frameInfo));
    if (!playerWin) { out.ok = false; return JSON.stringify(out); }

    // Pick System, then the exact locale — through the Player page
    await playerWin.zttsCommand('provider', 'system');
    await new Promise((r) => setTimeout(r, 400));
    await playerWin.zttsCommand('locale', 'en-US');
    await new Promise((r) => setTimeout(r, 600));
    out.commandsAccepted = true;

    // Evidence: voiceSwitch + documentVoices
    const vs = JSON.parse(await Z.ZoteroTTS.diagnostics.voiceSwitch());
    const mine = (vs.readers ?? []).find(row => row.index === state.reader.index) ?? null;
    out.draft = mine ? { selected: mine.selected, paused: mine.paused, player: mine.player, draft: mine.handoff?.draft ?? null } : null;
    step('player-shows-draft', !!mine && mine.player?.provider === 'system' && mine.player?.locale === 'en-US' && mine.player?.voice === '' && mine.player?.chooseVoice === true,
      JSON.stringify(mine?.player ?? null));
    step('handoff-draft', !!mine && mine.handoff?.draft?.tier === 'system' && mine.handoff?.draft?.locale === 'en-US',
      JSON.stringify(mine?.handoff?.draft ?? null));
    step('manager-still-idle', !!mine && !mine.selected, `selected=${mine?.selected}`);

    const dv = JSON.parse(await Z.ZoteroTTS.diagnostics.documentVoices());
    const saved = (dv.readers ?? []).find((r) => r.key === `user/${state.fixture.key}`)?.saved ?? null;
    out.savedDuringDraft = saved ? { id: String(saved.voice?.id ?? ''), manual: !!saved.manual } : null;
    step('saved-missing-retained', out.savedDuringDraft?.id === 'ztts-232-missing-voice', JSON.stringify(out.savedDuringDraft));

    // Offered choices of the draft (what the Player lists)
    let offered = [];
    try {
      const all = m.allVoices;
      for (let i = 0; i < all.length; i++) {
        const x = all[i];
        if (x && x.tier === 'system' && x.language === 'en-US' && x.id) offered.push(String(x.id));
      }
    } catch (e) { /* pool read again failed */ }
    out.offered = offered;
    const w = offered.find((id) => id !== state.V) ?? null;
    state.W = w;
    out.W = w;
    step('W-available-and-distinct', !!w && w !== state.V, w ? `W=${w}` : 'no second voice');
    out.ok = out.steps.every((s) => s.ok);
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, fatal: String(e), steps: out.steps });
  }
})()
