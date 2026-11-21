// #195: click the Settings voice-browser heart for a listed System voice
// while this fixture's real Player is open with no selected voice.
return (async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const favoriteKey = prefix + 'readAloud.favoriteVoices';
  const onlyKey = prefix + 'readAloud.favoritesOnly';
  const defaultKey = prefix + 'readAloud.defaultVoice';
  const memoryKey = prefix + 'readAloud.memory';
  const voicesKey = 'extensions.zotero.reader.readAloudVoices';
  const state = Zotero.ZoteroTTSRun.state;
  const reader = state.fix4FixtureReader;
  const wanted = state.fix4Voice;
  const baseline = state.fix4Prefs;
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (!reader || !wanted || !baseline || !prefWin) throw new Error('fixture, baseline, or Settings pane missing');
  const expectedLabel = wanted.label || wanted.name || String(wanted.rawId).split('.').pop();

  const saved = [
    ['readAloud.favoriteVoices', favoriteKey],
    ['readAloud.defaultVoice', defaultKey],
    ['readAloud.memory', memoryKey],
    ['reader.readAloudVoices', voicesKey],
  ];
  const rawFavorites = () => p.getStringPref(favoriteKey, '');
  const favorites = () => JSON.parse(rawFavorites() || '[]');
  const value = (key, type) => {
    try {
      if (type === p.PREF_BOOL) return p.getBoolPref(key);
      if (type === p.PREF_INT) return p.getIntPref(key);
      if (type === p.PREF_STRING) return p.getStringPref(key);
    } catch (e) {}
    return null;
  };
  const restoreEntry = (name, key) => {
    const entry = baseline[name];
    if (!entry.user) {
      if (p.prefHasUserValue(key)) p.clearUserPref(key);
    } else if (entry.type === p.PREF_BOOL) p.setBoolPref(key, entry.value);
    else if (entry.type === p.PREF_INT) p.setIntPref(key, entry.value);
    else if (entry.type === p.PREF_STRING) p.setStringPref(key, entry.value);
  };
  const restoreVoicePrefs = () => { for (const [name, key] of saved) restoreEntry(name, key); };
  const restored = () => Object.fromEntries(saved.map(([name, key]) => {
    const entry = baseline[name];
    return [name, { valueMatches: value(key, entry.type) === entry.value,
      flagMatches: p.prefHasUserValue(key) === entry.user }];
  }));
  const playerState = (manager) => ({
    popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
    active: !!manager?.active,
    paused: manager ? !!manager.paused : null,
    selectedVoice: manager?.selectedVoiceID ?? null,
    catalogCount: manager?._allVoices?.length ?? null,
  });
  const impact = async (changes = {}) => JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify(changes)));

  let out = { status: 'FAIL', voice: wanted.encoded, label: expectedLabel };
  let failure = null;
  try {
    if (favorites().length || p.getBoolPref(onlyKey)) throw new Error('favorite baseline is not empty/off');

    // Clear saved choices for the disposable item, then open its Player with
    // no selected voice. No provider sample or network request is made.
    if (reader._internalReader?._state?.readAloudState?.popupOpen) reader._internalReader.toggleReadAloudPopup(false);
    await sleep(250);
    for (const [name, key] of saved.slice(1)) {
      if (p.prefHasUserValue(key)) p.clearUserPref(key);
    }
    await sleep(250);
    reader._internalReader.toggleReadAloudPopup(true);
    let manager = null;
    for (let i = 0; i < 60 && !reader._internalReader?._state?.readAloudState?.popupOpen; i++) await sleep(100);
    if (!reader._internalReader?._state?.readAloudState?.popupOpen) throw new Error('fixture Player did not open');
    manager = reader._internalReader._readAloudManager;
    const noVoice = playerState(manager);
    if (noVoice.selectedVoice) throw new Error('Player opened with a selected voice: ' + noVoice.selectedVoice);

    const doc = prefWin.document;
    const tiers = doc.getElementById('ztts-voices-tiers');
    const locales = doc.getElementById('ztts-voices-locales');
    const list = doc.getElementById('ztts-voices-list');
    if (!tiers || !locales || !list) throw new Error('voice-browser columns are missing');
    const tierButton = [...tiers.querySelectorAll('button')].find((button) => /^System\s*\(/.test(button.textContent.trim()));
    if (!tierButton) throw new Error('System voice-browser tier is not listed');
    tierButton.click();
    await sleep(200);
    const localeButton = [...locales.querySelectorAll('button')].find((button) => button.textContent.includes('English (United States)'));
    if (!localeButton) throw new Error('English (United States) locale is not listed');
    localeButton.click();
    await sleep(200);

    const findRow = () => [...list.children].find((row) => {
      const label = [...row.querySelectorAll('button')].find((button) => button.title.includes('default voice'));
      return label?.textContent.trim() === expectedLabel;
    });
    const row = findRow();
    if (!row) throw new Error('listed System voice row not found for ' + expectedLabel);
    const heart = [...row.querySelectorAll('button')].find((button) => button.title === 'Favorite');
    if (!heart || heart.textContent.trim() !== '♡') throw new Error('unmarked voice heart is not shown');

    const impactBefore = await impact({ 'readAloud.favoriteVoices': JSON.stringify([wanted.encoded]) });
    if ((impactBefore.affected ?? []).length) throw new Error('voiceless mark unexpectedly affects a reading session');
    heart.click();
    for (let i = 0; i < 30 && !favorites().includes(wanted.encoded); i++) await sleep(100);
    const managerAfter = reader._internalReader._readAloudManager;
    const after = { ...playerState(managerAfter), favorites: favorites(), heart: findRow()?.querySelector('button[title="Favorite"]')?.textContent.trim() ?? null };
    if (!after.favorites.includes(wanted.encoded)) throw new Error('shown heart did not store the favorite');
    if (after.selectedVoice || !after.popupOpen) throw new Error('heart click selected a voice or closed the Player');
    if (after.heart !== '♥') throw new Error('shown heart did not repaint as marked');

    out.noVoice = noVoice;
    out.impactBefore = impactBefore;
    out.after = after;
    out.control = 'Settings voice-browser heart, System / English (United States)';
  } catch (error) {
    failure = String(error);
  } finally {
    try {
      if (reader._internalReader?._state?.readAloudState?.popupOpen) {
        reader._internalReader.toggleReadAloudPopup(false);
        await sleep(250);
      }
      restoreVoicePrefs();
      await sleep(350);
    } catch (error) {
      failure = [failure, 'restore failed: ' + String(error)].filter(Boolean).join('; ');
    }
    out.restored = restored();
    if (Object.values(out.restored).some((entry) => !entry.valueMatches || !entry.flagMatches)) {
      failure = [failure, 'favorite and saved voice preferences did not restore exactly'].filter(Boolean).join('; ');
    }
  }

  if (failure) throw new Error(JSON.stringify({ ...out, error: failure }));
  out.status = 'PASS';
  return JSON.stringify(out, null, 1);
})();
