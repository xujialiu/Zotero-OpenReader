// Case: system-voice-selection, item 4 (paused part) — with the fixture
// session paused, selects AndrewMultilingual Online and then Andrew (Natural
// HD). Each pick must land the requested token (committed manager id, or the
// paused handoff's pending target — the case permits either), show the
// exact label on the Player's voice trigger, keep paused true with no
// unwanted playback, and raise no failure notice.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => Components.utils.waiveXrays(v);
  const HD = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const MULTI = 'system::sapi5/Edge-en-US-AndrewMultilingualNeural';
  const LABELS = { [HD]: 'Andrew (Natural HD)', [MULTI]: 'AndrewMultilingual Online (Natural)' };
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === S.svsFixtureItemID);
  if (!reader) throw new Error('fixture reader gone');
  const m = () => waive(reader._internalReader._readAloudManager);
  if (!(m().paused && m().active && m().selectedVoiceID === HD)) throw new Error('fixture session not paused on Andrew HD before the paused picks');

  const frame = reader._iframeWindow.document.querySelector('#ztts-player-frame');
  const fd = frame ? frame.contentDocument : null;
  const notices = () => {
    const main = reader._iframeWindow.document;
    return [...main.querySelectorAll('#ztts-voice-notice, #ztts-playback-notice')].map((n) => n.textContent).filter(Boolean);
  };

  const pick = async (id, name) => {
    const before = { paused: !!m().paused, voice: m().selectedVoiceID ?? null };
    await m().selectVoice(id);
    let committed = null;
    for (let i = 0; i < 20; i++) { await sleep(300); if ((m().selectedVoiceID ?? null) === id) { committed = true; break; } }
    // Paused handoff may park a pending target instead of committing
    let pending = null;
    try {
      const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
      const mine = (vs.readers || []).find((r) => r.selected === (m().selectedVoiceID ?? null) && (r.handoff || (r.player && (r.player.voice === id || r.player.chooseVoice))));
      if (!mine) {
        const byHandoff = (vs.readers || []).find((r) => r.handoff && JSON.stringify(r.handoff).includes(id));
        pending = byHandoff ? { handoff: byHandoff.handoff, player: byHandoff.player } : null;
      } else pending = { handoff: mine.handoff, player: mine.player };
    } catch (e) { pending = 'error: ' + String(e).slice(0, 80); }
    await sleep(300);
    const trig = fd ? fd.querySelector('button.picker[data-pick="voice"] .value') : null;
    return {
      pick: name, target: id, expectedLabel: LABELS[id],
      pausedBefore: before.paused, voiceBefore: before.voice,
      committedOk: !!committed, committedVoice: m().selectedVoiceID ?? null,
      pausedAfter: !!m().paused, playingAfter: !!(m().active && !m().paused),
      pendingHandoffOrPlayer: pending,
      triggerLabel: trig ? trig.textContent : null,
      notices: notices(),
    };
  };
  out.pickMultilingual = await pick(MULTI, 'AndrewMultilingual Online (Natural)');
  out.pickHD = await pick(HD, 'Andrew (Natural HD)');

  const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const mine = (eng.readers || []).find((r) => r.itemID === S.svsFixtureItemID);
  out.engineAfter = mine ? { voice: mine.session?.voice ?? null, paused: mine.session?.paused ?? null, playing: mine.session?.playing ?? null, notices: mine.session?.notices ?? null, playbackTime: mine.session?.playbackTime ?? null } : null;
  out.sessionEnd = { paused: !!m().paused, voice: m().selectedVoiceID ?? null, active: !!m().active };
  return JSON.stringify(out, null, 1);
})()
