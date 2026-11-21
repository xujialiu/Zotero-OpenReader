// #195: exercise the real Player favorite command with a paused System voice.
// Positive: removing the last favorite expands the list and keeps the voice.
// Negative: removing that in-use voice while another favorite remains is blocked.
return (async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const favoriteKey = prefix + 'readAloud.favoriteVoices';
  const onlyKey = prefix + 'readAloud.favoritesOnly';
  const state = Zotero.ZoteroTTSRun.state;
  const reader = state.fix4FixtureReader;
  const manager = reader?._internalReader?._readAloudManager;
  const wanted = state.fix4Voice;
  const fixture = state.fix4Fixture;
  const favoriteOriginal = state.fix4Prefs['readAloud.favoriteVoices'];
  const onlyOriginal = state.fix4Prefs['readAloud.favoritesOnly'];
  if (!reader || !manager || !wanted || !fixture) throw new Error('fixture session missing; rerun from 02');

  const A = wanted.encoded;
  const title = fixture.title;
  const rawFavoritePref = () => p.getStringPref(favoriteKey, '');
  const favorites = () => JSON.parse(rawFavoritePref() || '[]');
  const impact = async (changes = {}) => JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify(changes)));
  const hasProtectedA = (report) => report.sessions?.some((session) => session.title === title
    && session.voices?.some((voice) => voice.id === A)) ?? false;
  const restore = () => {
    if (!favoriteOriginal.user && p.prefHasUserValue(favoriteKey)) p.clearUserPref(favoriteKey);
    else if (favoriteOriginal.user) p.setStringPref(favoriteKey, favoriteOriginal.value);
    if (!onlyOriginal.user && p.prefHasUserValue(onlyKey)) p.clearUserPref(onlyKey);
    else if (onlyOriginal.user) p.setBoolPref(onlyKey, onlyOriginal.value);
  };
  const checkpoint = (tag) => ({
    tag,
    favorites: favorites(),
    favoriteRaw: rawFavoritePref(),
    favoritesOnly: p.getBoolPref(onlyKey),
    selectedVoice: manager.selectedVoiceID ?? null,
    popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
    active: !!manager.active,
    paused: !!manager.paused,
    controllerPresent: !!manager._controller,
  });
  const frameEl = reader._iframeWindow?.document?.getElementById('ztts-player-frame');
  const frameWindow = frameEl && Components.utils.waiveXrays(frameEl.contentWindow);
  if (!frameWindow || typeof frameWindow.zttsCommand !== 'function') throw new Error('Player zttsCommand is not exported');
  const command = async (voiceId) => {
    try {
      const value = await frameWindow.zttsCommand('favorite', voiceId);
      return { completed: true, value: value ?? null };
    } catch (error) {
      // Player commands may report a refusal in the UI instead of throwing.
      return { completed: false, message: String(error) };
    }
  };
  const held = (snapshot) => snapshot.selectedVoice === A && snapshot.popupOpen
    && snapshot.active && snapshot.paused && snapshot.controllerPresent;
  const requireHeld = (snapshot) => {
    if (!held(snapshot)) throw new Error('fixture Player changed state: ' + JSON.stringify(snapshot));
  };
  const requireNoAffected = (report, step) => {
    if ((report.affected ?? []).length) throw new Error(step + ' unexpectedly affects ' + JSON.stringify(report.affected));
  };
  const requireSessionA = (report, step) => {
    if (!hasProtectedA(report)) throw new Error(step + ' did not observe the fixture protecting ' + A);
  };

  let out = { status: 'FAIL', voice: A, secondVoice: null, steps: [] };
  let failure = null;
  try {
    if (favorites().length || p.getBoolPref(onlyKey)) throw new Error('favorite baseline is not empty/off');
    if (manager.selectedVoiceID !== A || !manager.active || !manager.paused) throw new Error('fixture is not paused on the expected voice');
    const startup = await impact({});
    requireSessionA(startup, 'starting observation');
    out.steps.push({ start: checkpoint('start'), protected: startup.sessions.find((session) => session.title === title) });

    const provider = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
    const second = (provider.voices ?? []).find((voice) => typeof voice.lang === 'string'
      && voice.lang.startsWith('en') && voice.id !== wanted.rawId
      && (voice.id.includes('compact.') || voice.id.includes('speech.synthesis.')));
    if (!second) throw new Error('no second free English System voice listed');
    const B = 'system::' + second.id;
    let listedB = false;
    for (let i = 0; i < (manager._allVoices?.length ?? 0); i++) {
      if (manager._allVoices[i]?.id === B) { listedB = true; break; }
    }
    if (!listedB) throw new Error('second favorite is absent from the fixture Player catalog');
    out.secondVoice = B;

    // Start through the Player command with the filter off.
    let before = await impact({ 'readAloud.favoriteVoices': JSON.stringify([A]) });
    requireNoAffected(before, 'mark A with the filter off');
    let result = await command(A);
    await sleep(250);
    let after = checkpoint('mark-A');
    if (JSON.stringify(after.favorites) !== JSON.stringify([A])) throw new Error('Player did not store the first favorite');
    requireHeld(after);
    out.steps.push({ action: 'mark-A', impactBefore: before, command: result, after });

    // With A held and marked, turn the filter on. Removing the last favorite
    // must be safe because an empty favorites list offers every voice.
    before = await impact({ 'readAloud.favoritesOnly': true });
    requireNoAffected(before, 'enable favorites-only with A marked');
    p.setBoolPref(onlyKey, true);
    await sleep(300);
    before = await impact({ 'readAloud.favoriteVoices': JSON.stringify([]) });
    requireNoAffected(before, 'remove the last favorite');
    requireSessionA(before, 'pre-removal observation');
    const beforeLast = checkpoint('before-last-favorite-removal');
    result = await command(A);
    await sleep(350);
    after = checkpoint('remove-last-A');
    const afterLast = await impact({});
    if (after.favorites.length) throw new Error('last favorite remained stored: ' + JSON.stringify(after.favorites));
    requireHeld(after);
    requireSessionA(afterLast, 'post-removal observation');
    out.steps.push({ action: 'remove-last-A', impactBefore: before, protectedBefore: before.sessions, command: result,
      before: beforeLast, after, protectedAfter: afterLast.sessions });

    // Seed the two-favorite state while the filter is off. The tested removal
    // remains a real Player command; B is a listed free System voice.
    p.setBoolPref(onlyKey, false);
    await sleep(250);
    p.setStringPref(favoriteKey, JSON.stringify([A, B]));
    await sleep(300);
    after = checkpoint('stage-two-favorites');
    if (JSON.stringify(after.favorites) !== JSON.stringify([A, B])) throw new Error('could not stage two listed favorites');
    requireHeld(after);
    out.steps.push({ action: 'stage-two-favorites', voices: [A, B], after });

    before = await impact({ 'readAloud.favoritesOnly': true });
    requireNoAffected(before, 'enable favorites-only with both favorites marked');
    p.setBoolPref(onlyKey, true);
    await sleep(300);
    after = checkpoint('two-favorites-filter-on');
    requireHeld(after);
    out.steps.push({ action: 'enable-filter-for-refusal', impactBefore: before, after });

    // A genuine Player removal is attempted. The command may show its refusal
    // in the Player UI without throwing; the protected id and stored state decide.
    const observedBefore = await impact({});
    requireSessionA(observedBefore, 'pre-refusal observation');
    const blocked = await impact({ 'readAloud.favoriteVoices': JSON.stringify([B]) });
    requireSessionA(blocked, 'proposed removal');
    if (!(blocked.affected ?? []).includes(title)) throw new Error('proposed two-favorite removal did not affect the fixture');
    const beforeBlocked = checkpoint('before-blocked-removal');
    result = await command(A);
    await sleep(500);
    const observedAfter = await impact({});
    after = checkpoint('blocked-removal');
    if (JSON.stringify(after.favorites) !== JSON.stringify([A, B])) throw new Error('blocked removal changed the stored favorites');
    requireHeld(after);
    requireSessionA(observedAfter, 'post-refusal observation');
    out.steps.push({ action: 'blocked-remove-A', impactBefore: blocked, protectedBefore: observedBefore.sessions,
      command: result, before: beforeBlocked, after, protectedAfter: observedAfter.sessions });
  } catch (error) {
    failure = String(error);
  } finally {
    try { restore(); await sleep(300); }
    catch (error) { failure = [failure, 'restore failed: ' + String(error)].filter(Boolean).join('; '); }
    out.restored = {
      favorites: favorites(),
      favoriteRawMatches: rawFavoritePref() === favoriteOriginal.value,
      favoritesUser: p.prefHasUserValue(favoriteKey),
      favoritesOnly: p.getBoolPref(onlyKey),
      favoritesOnlyUser: p.prefHasUserValue(onlyKey),
      favoriteUserExpected: favoriteOriginal.user,
      favoritesOnlyUserExpected: onlyOriginal.user,
    };
    if (out.restored.favoriteRawMatches !== true
      || out.restored.favoritesUser !== favoriteOriginal.user
      || out.restored.favoritesOnly !== onlyOriginal.value
      || out.restored.favoritesOnlyUser !== onlyOriginal.user) {
      failure = [failure, 'favorite settings did not restore exactly'].filter(Boolean).join('; ');
    }
  }

  if (failure) throw new Error(JSON.stringify({ ...out, error: failure }));
  out.status = 'PASS';
  return JSON.stringify(out, null, 1);
})();
