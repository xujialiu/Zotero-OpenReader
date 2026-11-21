(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const index = state.liveReader.index,
    gone = state.deadReader.index;
  const reader = Zotero.Reader._readers[index],
    internal = Components.utils.waiveXrays(reader._internalReader);
  const manager = () => Components.utils.waiveXrays(reader._internalReader)._readAloudManager;
  const dead = Zotero.Reader._readers[gone];
  if (
    gone !== 0 ||
    index !== 1 ||
    !Components.utils.isDeadWrapper(dead._internalReader) ||
    !Components.utils.isDeadWrapper(dead._iframeWindow)
  )
    throw new Error('A is not the expected dead listed reader');
  const docsBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const docKey = state.beta3Baseline.documentVoice.key,
    row = docsBefore.readers?.find((r) => r.key === docKey);
  if (row?.saved?.voice?.id !== 'fishspeech::cedar' || row.saved.manual !== true)
    throw new Error('B does not have its captured manual local Document voice cedar');
  if (manager()?.active || internal._state?.readAloudState?.popupOpen)
    throw new Error('B is not idle before Shift+Space');
  const debugBefore = String((await Zotero.Debug.get()) ?? '');
  const countDead = (text) => (String(text).match(/TypeError: can't access dead object/g) ?? []).length;
  const countPluginTakeOver = (text) => {
    const lines = String(text).split(/\r?\n/);
    let n = 0;
    for (let i = 0; i < lines.length; i++)
      if (/TypeError: can't access dead object/.test(lines[i])) {
        const trace = lines.slice(i, i + 14).join('\n');
        if (/zotero-tts\.js|takeOver|reserve/.test(trace)) n++;
      }
    return n;
  };
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  win.Zotero_Tabs.select(reader.tabID);
  reader._iframeWindow?.focus?.();
  win.focus();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(
    Components.interfaces.nsITextInputProcessor,
  );
  tip.beginInputTransactionForTests(win);
  let consumed = 0;
  try {
    const flags = { shiftKey: true };
    tip.keydown(
      new win.KeyboardEvent('', {
        key: 'Shift',
        code: 'ShiftLeft',
        keyCode: 16,
        ...flags,
        bubbles: true,
        cancelable: true,
      }),
    );
    consumed = tip.keydown(
      new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...flags, bubbles: true, cancelable: true }),
    );
    tip.keyup(
      new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...flags, bubbles: true, cancelable: true }),
    );
    tip.keyup(
      new win.KeyboardEvent('', {
        key: 'Shift',
        code: 'ShiftLeft',
        keyCode: 16,
        ...flags,
        bubbles: true,
        cancelable: true,
      }),
    );
  } finally {
    tip.endInputTransaction?.();
  }
  const trace = [];
  let playerOpenAt = null,
    activeAt = null;
  for (let i = 0; i < 300; i++) {
    const m = manager(),
      popup = !!internal._state?.readAloudState?.popupOpen;
    const sample = {
      t: i * 100,
      popup,
      active: !!m?.active,
      paused: !!m?.paused,
      selected: m?.selectedVoiceID ?? null,
      voiceCount: m?._allVoices?.length ?? null,
    };
    trace.push(sample);
    if (popup && playerOpenAt === null) playerOpenAt = sample.t;
    if (sample.active && activeAt === null) {
      activeAt = sample.t;
      if (!sample.paused) m.togglePaused();
    }
    if (activeAt !== null && sample.paused) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const managerAtActivation = {
    active: !!manager()?.active,
    paused: !!manager()?.paused,
    selected: manager()?.selectedVoiceID ?? null,
    voiceCount: manager()?._allVoices?.length ?? null,
  };
  const docsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const docAfter = docsAfter.readers?.find((r) => r.key === docKey) ?? null;
  if (internal._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 50 && manager()?.active; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  const debugAfter = String((await Zotero.Debug.get()) ?? '');
  const result = {
    consumed,
    documentBefore: { key: row.key, saved: row.saved, selected: row.selected, active: row.active },
    documentAfter: docAfter
      ? { key: docAfter.key, saved: docAfter.saved, selected: docAfter.selected, active: docAfter.active }
      : null,
    playerOpenAt,
    activeAt,
    managerAtActivation,
    managerAfterClose: {
      active: !!manager()?.active,
      paused: !!manager()?.paused,
      selected: manager()?.selectedVoiceID ?? null,
    },
    trace: trace.length <= 2 ? trace : [trace[0], { count: trace.length - 2 }, trace.at(-1)],
    debug: {
      beforeLines: debugBefore.split(/\r?\n/).length,
      afterLines: debugAfter.split(/\r?\n/).length,
      pluginTakeOverBefore: countPluginTakeOver(debugBefore),
      pluginTakeOverAfter: countPluginTakeOver(debugAfter),
      newPluginTakeOverErrors: Math.max(0, countPluginTakeOver(debugAfter) - countPluginTakeOver(debugBefore)),
      newDeadMessages: Math.max(0, countDead(debugAfter) - countDead(debugBefore)),
    },
  };
  state.beta3ShiftSpace = result;
  return JSON.stringify(result);
})();
