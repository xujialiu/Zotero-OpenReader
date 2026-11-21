// One disposable fixture-a.pdf; a Player opened with a selected free System
// voice. The plugin's default voice is pointed at one listed free System
// voice first, the popup is opened after a bounded refresh, and the session
// is paused in the same script. The exact pref state written here is in the
// baseline snapshot for cleanup.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixturesDir = String(run.params.fixturesDir || '');
  const pdfPath = PathUtils.join(fixturesDir, 'fixture-a.pdf');
  const defaultVoiceKey = prefix + 'readAloud.defaultVoice';
  const voicesKey = 'extensions.zotero.reader.readAloudVoices';
  const provider = JSON.parse(await Zotero.ZoteroTTS.diagnostics.systemProvider());
  if (!provider.enabled) throw new Error('System provider is off; the brief requires System voices only');
  const en = (provider.voices ?? []).filter((v) => typeof v.lang === 'string' && v.lang.startsWith('en'));
  const free = en.filter((v) => v.id.includes('compact.') || v.id.includes('speech.synthesis.'));
  if (!en.length) throw new Error('no English System voices listed');
  const voiceRecord = free[0] ?? en[0];
  const encoded = 'system::' + voiceRecord.id;
  const choice = { id: encoded, lang: 'en' };

  const stamp = Date.now();
  const title = `Zotero-TTS #195 fixture ${stamp}`;
  const imported = await Zotero.Attachments.importFromFile({
    file: pdfPath,
    libraryID: Zotero.Libraries.userLibraryID,
    title,
  });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('fixture import returned no item');
  state.fix4Fixture = { itemID: item.id, key: item.key, title };

  let reader = null;
  for (let round = 0; round < 4 && !reader; round++) {
    for (let i = 0; i < 40 && !reader; i++) {
      reader = (Zotero.Reader._readers ?? []).find((candidate) => candidate?.itemID === item.id
        && candidate?._internalReader?._readAloudManager);
      if (!reader) {
        try { await Zotero.Reader.open(item.id); } catch (e) { if (round === 0 && i === 0) throw e; }
      }
      if (!reader) await sleep(150);
    }
  }
  if (!reader?._internalReader?._readAloudManager) {
    throw new Error('fixture reader did not expose a read-aloud manager within the ceiling');
  }

  const main = Zotero.getMainWindow?.();
  try { main?.Zotero_Tabs?.select(reader.tabID); } catch (e) {}
  await sleep(300);

  const hadDefaultUser = p.prefHasUserValue(defaultVoiceKey);
  const hadVoicesUser = p.prefHasUserValue(voicesKey);
  p.setStringPref(defaultVoiceKey, JSON.stringify(choice));
  await sleep(600);

  try { reader._internalReader.toggleReadAloudPopup(true); } catch (e) {
    throw new Error('player open failed: ' + String(e));
  }
  const manager = reader._internalReader._readAloudManager;
  let selected = null;
  for (let i = 0; i < 200; i++) {
    selected = manager.selectedVoiceID ?? null;
    if (selected === encoded && manager.active) break;
    await sleep(100);
  }
  if (manager.active && !manager.paused) {
    try { manager.pause(); } catch (e) {}
  }
  for (let i = 0; i < 60 && !(manager.active && manager.paused); i++) await sleep(100);
  await sleep(300);

  const observed = {
    active: !!manager.active,
    paused: !!manager.paused,
    selectedVoiceID: manager.selectedVoiceID ?? null,
    expectedVoice: encoded,
    voiceCount: manager._allVoices?.length ?? null,
    controllerPresent: !!manager._controller,
    popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
  };
  state.fix4FixtureManager = manager;
  state.fix4FixtureReader = reader;
  state.fix4Voice = { encoded, label: voiceRecord.label, rawId: voiceRecord.id, lang: voiceRecord.lang };
  state.fix4DefaultVoiceWritten = !hadDefaultUser;
  state.fix4VoicesWritten = !hadVoicesUser;

  const mainAfter = Zotero.getMainWindow?.();
  if (mainAfter && mainAfter.windowState !== 2) mainAfter.minimize();
  const ok = observed.active && observed.paused && observed.selectedVoiceID === encoded
    && observed.voiceCount && observed.controllerPresent && observed.popupOpen;
  return JSON.stringify({
    fixture: { itemID: item.id, key: item.key, title },
    tabID: reader.tabID,
    voice: state.fix4Voice,
    observed,
    hostState: mainAfter ? mainAfter.windowState : null,
    ok,
  }, null, 1);
})()
