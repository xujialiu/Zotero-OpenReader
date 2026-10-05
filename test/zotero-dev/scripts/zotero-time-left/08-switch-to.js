// Item 8 (NEW, issue #140 beta5): a voice being switched to counts at once,
// the player reading with another voice keeps its player. Fixture A's session
// is first put on the FREE plugin voice (System voices — the provider pick
// 'system' + a 'system::osx/…' voice, the same drive tab C got; its playback
// goes through the plugin's own muted output — verified live: the engine's
// audio.state stays 'suspended' with gain 0 and window.speechSynthesis never
// speaks). The premium provider figure is set to 0 (kept) and the wrap's
// credits answer { standard: 114, premium: 0 } (used up). PLAY (muted), then
// pick 'Zotero Premium' in the player's first dropdown: the handoff's fetch
// for the premium voice short-circuits at usedUp (getReadAloudAudio 0 calls),
// and a voice being switched to counts AT ONCE — the switch fails with the
// voice notice (#ztts-voice-notice, 'Could not switch to …'), the system
// voice reads on, fixture A's player STAYS OPEN (the handoff leaves the
// manager's selectedTier/voice alone until it commits, so no player counts),
// zotero-premium.enabled goes false, and the used-up reminder opens in
// fixture A with NO other-tabs line; zoteroRefusals() → last { code:
// 'quota-exceeded', tier: 'premium', credits: 0, minutes: 0, action:
// 'used-up', closed: 0 }. The session is paused, the provider figure
// restored, the reminder closed (✕) at the end. params: none. state: reads
// itemID/tabID/item1/item3.
(async () => {
  const out = { step: 'switch-to-voice' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item3 || !S.getAPIClientOriginal) throw new Error('run state missing -- 04/05 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const waitFor = async (test, timeout = 24000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(step);
    }
    return test();
  };
  try {
    if (!host) throw new Error('no main window');

    // --- Premium ON for now (item 7 left it on; the run ends with it off). ---
    if (Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') !== true) p.setBoolPref(prefix + 'zotero-premium.enabled', true);
    out.premiumOn = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    host.Zotero_Tabs.select(S.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === S.tabID, 8000, 100);
    const readers = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < readers.length; i++) if (readers[i] && readers[i].itemID === S.itemID) reader = readers[i];
    if (!reader) throw new Error('fixture reader gone');
    const internal = reader._internalReader;
    const doc = reader._iframeWindow.document;
    let frame = doc.getElementById('ztts-player-frame');
    const m = internal._readAloudManager;
    if (!(m && m.active && frame && !frame.hidden)) throw new Error('fixture A player is not open (item 7 left it open+paused)');
    const child = Components.utils.waiveXrays(frame.contentWindow);
    const isPaused = () => { const mm = internal._readAloudManager; return !!(mm && mm.active && mm.paused); };
    const snap = async () => {
      const diag = JSON.parse(await diagnostics.pluginPlayer());
      const rn = Zotero.Reader._readers || [];
      for (let i = 0; i < rn.length; i++) {
        if (rn[i].itemID !== S.itemID) continue;
        const row = (diag.readers || [])[i];
        return row && row.open && row.state ? row.state : null;
      }
      return null;
    };
    const pick = async (action, value, test) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        child.zttsCommand(action, value);
        const ok = await waitFor(async () => { const st = await snap(); return st && test(st) ? st : null; }, 20000, 150);
        if (ok) return ok;
      }
      throw new Error('pick did not settle: ' + action);
    };

    // --- Drive A to the free plugin voice (System), paused. ---
    await waitFor(async () => { const st = await snap(); return st && (st.providers || []).some((v) => v.value === 'system') ? st : null; }, 45000, 250)
      .then((st) => { if (!st) throw new Error('the System provider never listed'); });
    await pick('provider', 'system', (st) => st.provider === 'system');
    const stSys = await snap();
    const sysRow = (stSys.voices || []).find((v) => String(v.value).startsWith('system::'));
    if (!sysRow) throw new Error('no system voice listed');
    await pick('voice', sysRow.value, (st) => String(st.voice).startsWith('system::'));
    if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 5000, 100); }
    out.onFreeVoice = { provider: (await snap()).provider, voice: (await snap()).voice, paused: isPaused() };

    // --- The premium figure to 0 (kept); the wrap answers used-up credits. ---
    // voicesForLanguage is filtered by the SELECTED tier (system now): the
    // premium voice's provider is reached through the manager's full catalog.
    const list = m.allVoices || m.voicesForLanguage;
    let provider = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const w = Components.utils.waiveXrays(list[i]);
      if (String(w.id) === S.item1.voice) { provider = Components.utils.waiveXrays(w.provider); break; }
    }
    if (!provider) throw new Error('the premium voice provider was not found');
    provider.premiumCreditsRemaining = 0;
    out.figureZeroed = true;
    S.creditsAnswer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 0 };
    S.audioAnswer = 'quota-exceeded';
    out.audioAnswer = S.audioAnswer;
    const callsBefore = S.audioCalls || 0;
    const launchBefore = (S.launchCalls || []).length;

    // --- PLAY (muted engine output), then pick Zotero Premium. ---
    if (doc.notifyUserGestureActivation) doc.notifyUserGestureActivation();
    child.zttsCommand('play');
    const playing = await waitFor(async () => {
      const st = await snap();
      return st && st.playing === true && !isPaused() ? st : null;
    }, 6000, 120);
    out.systemVoicePlaying = !!playing;
    if (!playing) throw new Error('the system voice session did not start playing');
    const tPick = Date.now();
    child.zttsCommand('provider', 'premium');
    const reminderAt = await waitFor(() => {
      const box = doc.getElementById('ztts-zotero-reminder');
      return box && box.textContent.indexOf('Zotero Premium has no remaining time') === 0 ? box : null;
    }, 10000, 100);
    out.refusalLatencyMs = reminderAt ? Date.now() - tPick : null;
    if (!reminderAt) throw new Error('the used-up reminder never appeared at the pick');
    await sleep(600);

    // --- The evidence. ---
    const refusals = JSON.parse(await diagnostics.zoteroRefusals());
    out.last = refusals.last;
    const st = await snap();
    out.playerStillOpen = !!st;
    out.sessionAfter = { provider: st ? st.provider : null, voice: st ? st.voice : null, playing: st ? st.playing : null, error: st ? st.error : null };
    out.systemVoiceReadsOn = !!(st && String(st.voice).startsWith('system::'));
    out.audioCallsDelta = (S.audioCalls || 0) - callsBefore;
    out.prefPremium = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    const box = doc.getElementById('ztts-zotero-reminder');
    const buttons = Array.from(box.querySelectorAll('button'));
    const link = buttons.find((b) => b.textContent === 'Add more time') || null;
    const close = buttons.find((b) => b.getAttribute('aria-label') === 'Close') || null;
    out.reminder = {
      text: box.textContent,
      textHasUsedUp: box.textContent.indexOf('Zotero Premium has no remaining time and has been switched off. Add more time, then enable it again in Zotero-OpenReader settings.') === 0,
      textHasOthersLine: box.textContent.includes('other tab'),
      hasLink: !!link,
      hasClose: !!close,
    };
    const notice = doc.getElementById('ztts-voice-notice');
    out.voiceNotice = notice ? { text: notice.textContent.slice(0, 160), hasCouldNotSwitch: notice.textContent.includes('Could not switch to') } : null;
    out.noLaunchCall = (S.launchCalls || []).length === launchBefore;

    // --- Stop the muted playback, restore the figure, close the reminder. ---
    if (!isPaused()) { child.zttsCommand('play'); await waitFor(isPaused, 5000, 100); }
    out.pausedAtEnd = isPaused();
    provider.premiumCreditsRemaining = S.item3.keptPremium;
    out.figureRestored = provider.premiumCreditsRemaining === S.item3.keptPremium;
    if (close) close.click();
    await sleep(200);
    out.reminderGoneAfterClose = !doc.getElementById('ztts-zotero-reminder');
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
