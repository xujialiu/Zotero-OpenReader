(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const gone = state.deadReader.index,
    live = state.liveReader.index;
  const voice = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
  const tiers = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
  const levels = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const key = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightKey(false));
  const before = voice.readers?.[live]?.selected ?? null;
  const targeted = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, gone));
  const after = targeted.readers?.[live]?.selected ?? null;
  const out = {
    voiceSwitch: {
      gone: voice.readers?.[gone]?.gone ?? false,
      live: voice.readers?.[live] ?? null,
      afterGoneTarget: targeted.readers?.[live] ?? null,
      before,
      after,
      noOp: before === after && before === 'fishspeech::cedar',
    },
    providerTiers: {
      feature: tiers.feature,
      gone: tiers.readers?.[gone]?.gone ?? false,
      live: tiers.readers?.[live] ?? null,
    },
    highlightLevels: { gone: levels.readers?.[gone]?.gone ?? false, live: levels.readers?.[live] ?? null },
    highlightKey: {
      gone: key.before?.readers?.[gone]?.gone ?? false,
      live: key.before?.readers?.[live] ?? null,
      shortcut: key.shortcut,
    },
  };
  out.pass =
    out.voiceSwitch.gone &&
    out.voiceSwitch.live?.index === live &&
    out.voiceSwitch.live.selected === 'fishspeech::cedar' &&
    out.voiceSwitch.before === 'fishspeech::cedar' &&
    out.voiceSwitch.after === 'fishspeech::cedar' &&
    out.voiceSwitch.noOp &&
    out.providerTiers.gone &&
    !!out.providerTiers.live &&
    out.highlightLevels.gone &&
    out.highlightLevels.live?.itemID === state.liveReader.itemID &&
    out.highlightKey.gone &&
    out.highlightKey.live?.itemID === state.liveReader.itemID;
  state.issue218FinalDiagnostics = out;
  return JSON.stringify(out);
})();
