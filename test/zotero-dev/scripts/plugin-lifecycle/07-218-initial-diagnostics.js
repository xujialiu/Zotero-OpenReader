(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const deadIndex = state.deadReader?.index,
    liveIndex = state.liveReader?.index;
  if (deadIndex !== 0 || liveIndex !== 1) throw new Error('Expected dead A at 0 and live B at 1');
  const voice = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
  const tiers = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
  const levels = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const key = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightKey(false));
  const documents = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const docKey = state.beta3Baseline.documentVoice.key;
  const fixtureVoice = documents.readers?.find((row) => row.key === docKey) ?? null;
  const effectiveVoice = fixtureVoice?.saved?.voice?.id ?? null;
  const beforeSelected = voice.readers?.[liveIndex]?.selected ?? null;
  const afterGoneTarget = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, deadIndex));
  const afterSelected = afterGoneTarget.readers?.[liveIndex]?.selected ?? null;
  const summarize = (rows) =>
    Array.isArray(rows)
      ? rows.map((r, slot) => ({
          slot,
          gone: r?.gone === true,
          index: r?.index ?? null,
          itemID: r?.itemID ?? null,
          title: r?.title ?? null,
          selected: r?.selected ?? null,
          error: typeof r === 'string' ? r : null,
        }))
      : null;
  const out = {
    voiceSwitch: {
      rows: summarize(voice.readers),
      afterGoneTarget: summarize(afterGoneTarget.readers),
      beforeSelected,
      afterSelected,
      noOp: beforeSelected === afterSelected,
    },
    providerTiers: { feature: tiers.feature, rows: summarize(tiers.readers), live: tiers.readers?.[liveIndex] ?? null },
    highlightLevels: { rows: summarize(levels.readers), live: levels.readers?.[liveIndex] ?? null },
    highlightKey: {
      rows: summarize(key.before?.readers),
      live: key.before?.readers?.[liveIndex] ?? null,
      shortcut: key.shortcut,
    },
    documentVoice: {
      key: fixtureVoice?.key ?? null,
      saved: fixtureVoice?.saved ?? null,
      selected: fixtureVoice?.selected ?? null,
      active: fixtureVoice?.active ?? null,
      effectiveVoice,
      legacyMemoryUsed: false,
    },
  };
  out.pass =
    out.voiceSwitch.rows?.length === 2 &&
    out.voiceSwitch.rows[0]?.gone &&
    out.voiceSwitch.rows[1]?.index === liveIndex &&
    out.voiceSwitch.noOp &&
    tiers.readers?.length === 2 &&
    tiers.readers[0]?.gone &&
    !!tiers.readers[1] &&
    levels.readers?.length === 2 &&
    levels.readers[0]?.gone &&
    levels.readers[1]?.itemID === state.liveReader.itemID &&
    key.before?.readers?.length === 2 &&
    key.before.readers[0]?.gone &&
    key.before.readers[1]?.itemID === state.liveReader.itemID &&
    fixtureVoice?.saved?.voice?.id === 'fishspeech::cedar' &&
    fixtureVoice?.saved?.manual === true;
  state.beta3Initial218 = out;
  return JSON.stringify(out);
})();
