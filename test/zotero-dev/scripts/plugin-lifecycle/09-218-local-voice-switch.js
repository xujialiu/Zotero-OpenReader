(async () => {
  const state = Zotero.ZoteroTTSRun.state,
    index = state.liveReader.index,
    reader = Zotero.Reader._readers[index];
  const internal = Components.utils.waiveXrays(reader._internalReader),
    manager = internal._readAloudManager;
  if (manager.active) throw new Error('Voice switch should start from the paused, closed Player state');
  const before = {
    selected: manager.selectedVoiceID ?? null,
    tier: manager._selectedTier ?? null,
    active: !!manager.active,
    paused: !!manager.paused,
    voices: manager._allVoices?.length ?? null,
  };
  const ids = [];
  for (let i = 0; manager._allVoices && i < manager._allVoices.length; i++) {
    const id = manager._allVoices[i]?.id;
    if (typeof id === 'string' && id.startsWith('fishspeech::')) ids.push(id);
  }
  if (!ids.includes('fishspeech::bella') || !ids.includes('fishspeech::cedar'))
    throw new Error('The live manager does not list both Fish Speech voices');
  await manager.selectVoice('fishspeech::bella');
  const bella = manager.selectedVoiceID ?? null;
  await manager.selectVoice('fishspeech::cedar');
  const cedar = manager.selectedVoiceID ?? null;
  const docs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const doc = docs.readers?.find((r) => r.key === state.beta3Baseline.documentVoice.key) ?? null;
  const out = {
    before,
    fishVoices: ids,
    afterBella: bella,
    afterCedar: cedar,
    after: { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused },
    document: { saved: doc?.saved ?? null, selected: doc?.selected ?? null },
    pass:
      bella === 'fishspeech::bella' && cedar === 'fishspeech::cedar' && manager.selectedVoiceID === 'fishspeech::cedar',
  };
  state.beta3LocalVoice = out;
  return JSON.stringify(out);
})();
