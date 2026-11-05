// Case: system-voice-selection, item 2 — the fixture Player's voice choices,
// corrected revision (the first attempt looked for Zotero's native combobox
// in the reader document; this build renders the Player as the plugin's own
// page inside #ztts-player-frame, whose pickers are button.picker[data-pick]
// opening a popover of .option-row buttons). With the fixture session paused
// on the free System voice (05): reads the picker triggers, opens the voice
// picker, reads the rendered option rows, and cross-checks labels against
// the manager's voice list (the id+label pairs the Player lists from).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => Components.utils.waiveXrays(v);
  const HD = 'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === S.svsFixtureItemID);
  if (!reader) throw new Error('fixture reader gone');
  const m = () => waive(reader._internalReader._readAloudManager);
  if (!(m().paused && m().selectedVoiceID === HD)) throw new Error('fixture session not paused on the free System voice — refusing to proceed');

  const frame = reader._iframeWindow.document.querySelector('#ztts-player-frame');
  if (!frame || !frame.contentDocument) throw new Error('player frame not found');
  const fd = frame.contentDocument;
  out.frameLayout = frame.getAttribute('data-layout');
  out.frameReady = !!fd.querySelector('.player, .controls');

  // Picker triggers as rendered
  const pickers = [...fd.querySelectorAll('button.picker[data-pick]')];
  out.pickers = pickers.map((b) => ({ pick: b.getAttribute('data-pick'), value: b.querySelector('.value') ? b.querySelector('.value').textContent : b.textContent }));

  // Manager voice list — the id+label pairs the Player's voice picker lists from
  const all = [];
  try {
    const w = waive(m()._allVoices);
    const n = w ? w.length : 0;
    for (let i = 0; i < n; i++) if (typeof w[i]?.id === 'string') all.push({ id: w[i].id, label: typeof w[i].label === 'string' ? w[i].label : String(w[i].label) });
  } catch (e) { out.managerListError = String(e).slice(0, 100); }
  out.managerVoiceCount = all.length;

  // Open the voice picker and read the rendered rows
  const voicePicker = pickers.find((b) => b.getAttribute('data-pick') === 'voice');
  if (!voicePicker) throw new Error('voice picker not found');
  voicePicker.click();
  let rows = [];
  for (let i = 0; i < 20 && !rows.length; i++) { await sleep(300); rows = [...fd.querySelectorAll('.picker-popover .option-row')]; }
  out.renderedVoiceRows = rows.map((row, i) => {
    const option = row.querySelector('button.option');
    return {
      order: i,
      label: option ? option.textContent : null,
      chosen: option ? option.classList.contains('chosen') : null,
      title: option ? option.getAttribute('title') : null,
    };
  });
  out.renderedVoiceCount = out.renderedVoiceRows.length;

  // The three required identities as the Player lists them (manager list),
  // and whether each rendered row's label matches a manager entry's label
  const EXPECT = {
    'system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1': 'Andrew (Natural HD)',
    'system::sapi5/Edge-en-US-AndrewNeural': 'Andrew Online (Natural)',
    'system::sapi5/Edge-en-US-AndrewMultilingualNeural': 'AndrewMultilingual Online (Natural)',
  };
  out.required = Object.entries(EXPECT).map(([id, label]) => {
    const listed = all.find((v) => v.id === id);
    const rendered = out.renderedVoiceRows.find((r) => r.label === label);
    return { id, expectedLabel: label, inManagerList: !!listed, managerLabel: listed ? listed.label : null, labelMatch: listed ? listed.label === label : null, renderedRow: !!rendered };
  });
  out.renderedLabelsHaveMicrosoft = out.renderedVoiceRows.some((r) => (r.label || '').includes('Microsoft'));
  out.renderedLabelsHaveLangCode = out.renderedVoiceRows.some((r) => /en-US|zh-CN/.test(r.label || ''));

  // Close the popover again
  voicePicker.click();
  await sleep(400);
  out.popoverClosed = fd.querySelectorAll('.picker-popover').length === 0;
  const voiceTrigger = pickers.find((b) => b.getAttribute('data-pick') === 'voice');
  out.voiceTriggerLabel = voiceTrigger ? (voiceTrigger.querySelector('.value') ? voiceTrigger.querySelector('.value').textContent : null) : null;
  out.sessionStill = { paused: !!m().paused, voice: m().selectedVoiceID ?? null };
  return JSON.stringify(out, null, 1);
})()
