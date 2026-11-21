// #208: keep the Highlight rows observing the synchronous restore transition,
// then verify the both-off pair is repaired and remains repaired.
return (async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sentenceKey = prefix + 'highlight.sentence';
  const wordKey = prefix + 'highlight.word';
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.fix4Prefs;
  const sentenceOriginal = baseline?.['highlight.sentence'];
  const wordOriginal = baseline?.['highlight.word'];
  const prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (!sentenceOriginal || !wordOriginal) throw new Error('highlight baseline missing; run favorites 00 first');
  if (!prefWin?.Zotero_Preferences) throw new Error('Settings window is not open');
  state.fix4PaneWindow = prefWin;

  const readPair = (doc = prefWin.document) => ({
    sentencePref: p.getBoolPref(sentenceKey),
    wordPref: p.getBoolPref(wordKey),
    sentenceChecked: doc?.getElementById('ztts-highlight-sentence')?.checked ?? null,
    wordChecked: doc?.getElementById('ztts-highlight-word')?.checked ?? null,
  });
  const restoreEntry = (name, key) => {
    const entry = baseline[name];
    if (!entry.user) {
      if (p.prefHasUserValue(key)) p.clearUserPref(key);
    } else p.setBoolPref(key, entry.value);
  };
  const restored = () => ({
    sentenceValue: p.getBoolPref(sentenceKey),
    sentenceUser: p.prefHasUserValue(sentenceKey),
    wordValue: p.getBoolPref(wordKey),
    wordUser: p.prefHasUserValue(wordKey),
  });
  let out = { status: 'FAIL' };
  let failure = null;
  try {
    await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    let ready = false;
    for (let i = 0; i < 60; i++) {
      ready = !!prefWin.document.getElementById('ztts-highlight-sentence')
        && !!prefWin.document.getElementById('ztts-highlight-word');
      if (ready) break;
      await sleep(100);
    }
    if (!ready) throw new Error('Highlight checkboxes did not load');

    // Establish the requested Sentence-only starting state with the pane open.
    p.setBoolPref(sentenceKey, true);
    p.setBoolPref(wordKey, false);
    await sleep(250);
    const sentenceOnly = readPair();
    if (sentenceOnly.sentencePref !== true || sentenceOnly.wordPref !== false
      || sentenceOnly.sentenceChecked !== true || sentenceOnly.wordChecked !== false) {
      throw new Error('Sentence-only starting state did not settle: ' + JSON.stringify(sentenceOnly));
    }

    // Simulate the synchronous pair written by restore: no await between writes.
    p.setBoolPref(sentenceKey, false);
    p.setBoolPref(wordKey, true);
    const wordOnlyImmediate = readPair();
    await sleep(350);
    const wordOnlySettled = readPair();
    const wordOnlyDiagnostic = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlightLevels());
    if (wordOnlySettled.sentencePref !== false || wordOnlySettled.wordPref !== true
      || wordOnlySettled.sentenceChecked !== false || wordOnlySettled.wordChecked !== true) {
      throw new Error('synchronous Word-only transition did not persist: ' + JSON.stringify(wordOnlySettled));
    }

    // A separate synchronous both-off write must repair to Sentence on, Word off.
    p.setBoolPref(sentenceKey, false);
    p.setBoolPref(wordKey, false);
    const bothOffImmediate = readPair();
    await sleep(250);
    const repaired = readPair();
    await sleep(500);
    const repairPersistent = readPair();
    const repairDiagnostic = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlightLevels());
    if (repairPersistent.sentencePref !== true || repairPersistent.wordPref !== false
      || repairPersistent.sentenceChecked !== true || repairPersistent.wordChecked !== false) {
      throw new Error('both-off pair was not persistently repaired: ' + JSON.stringify({ repaired, repairPersistent }));
    }

    out.sentenceOnly = sentenceOnly;
    out.wordOnlyImmediate = wordOnlyImmediate;
    out.wordOnlySettled = wordOnlySettled;
    out.wordOnlyDiagnostic = { switches: wordOnlyDiagnostic.switches, pin: wordOnlyDiagnostic.pin };
    out.bothOffImmediate = bothOffImmediate;
    out.repaired = repaired;
    out.repairPersistent = repairPersistent;
    out.repairDiagnostic = { switches: repairDiagnostic.switches, pin: repairDiagnostic.pin };
  } catch (error) {
    failure = String(error);
  } finally {
    try {
      if (Services.wm.getMostRecentWindow('zotero:pref')) {
        prefWin.close();
        for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100);
      }
      restoreEntry('highlight.sentence', sentenceKey);
      restoreEntry('highlight.word', wordKey);
      await sleep(250);
      const host = Services.wm.getMostRecentWindow('navigator:browser');
      if (host && host.windowState !== 2) host.minimize();
    } catch (error) {
      failure = [failure, 'restore/close failed: ' + String(error)].filter(Boolean).join('; ');
    }
    out.restored = restored();
    out.settingsClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    out.restoredMatches = out.restored.sentenceValue === sentenceOriginal.value
      && out.restored.sentenceUser === sentenceOriginal.user
      && out.restored.wordValue === wordOriginal.value
      && out.restored.wordUser === wordOriginal.user;
    if (!out.restoredMatches || !out.settingsClosed) failure = [failure, 'highlight settings did not restore exactly'].filter(Boolean).join('; ');
    state.fix4PaneWindow = null;
  }

  if (failure) throw new Error(JSON.stringify({ ...out, error: failure }));
  out.status = 'PASS';
  return JSON.stringify(out, null, 1);
})();
