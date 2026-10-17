(async () => {
  // Item 12 (issue #183), Entry pick: close, plant the unreachable Kokoro
  // record again, reopen, pick the System Entry in the provider dropdown.
  // Expected: it resolves to the voice remembered from the pick before
  // (state.item12run.voicePick.pickedId), never the first voice of its region.
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const { itemID, key } = state.item12run.fixture;
  const remembered = state.item12run.voicePick?.pickedId;
  const predicted = state.item12run.voicePick?.predictedId;
  if (!remembered) throw new Error('no remembered pick from the voice-pick step');
  const reader = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  const internal = reader._internalReader;
  const manager = () => internal._readAloudManager;
  const playerDoc = () => reader._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const savedIdOf = (row) => typeof row?.saved === 'string' ? row.saved : (row?.saved?.id ?? row?.saved?.voice?.id ?? row?.saved ?? null);
  // close the session
  internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 50; i++) { if (!manager()?.active) break; await sleep(150); }
  const closed = !manager()?.active;
  // plant again (baseURL still at the closed port)
  Services.prefs.setStringPref(P + 'documentVoices.user/' + key, JSON.stringify({ voice: { id: 'local::af_bella', lang: 'en' }, manual: true, ts: Date.now() }));
  Services.prefs.setStringPref(P + 'documentVoiceChanged', String(Number(Services.prefs.getStringPref(P + 'documentVoiceChanged', '0')) + 1));
  // reopen
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
  internal.toggleReadAloudPopup(true);
  let frame = null;
  for (let i = 0; i < 60; i++) { frame = playerDoc(); if (frame) break; await sleep(150); }
  await sleep(500);
  const notice = reader._iframeWindow?.document?.getElementById('ztts-voice-notice')?.textContent
    || reader._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent || null;
  const idleBefore = { active: !!manager()?.active, selected: manager()?.selectedVoiceID ?? null };
  // open the provider dropdown and read the entries
  let doc = playerDoc();
  doc.querySelector('[data-pick="provider"]').click();
  let options = [];
  for (let i = 0; i < 30; i++) { await sleep(100); doc = playerDoc(); options = [...(doc?.querySelectorAll('.popover .option') || [])]; if (options.length) break; }
  const entries = options.map(o => o.textContent?.trim());
  let pickIndex = -1;
  for (let i = 0; i < entries.length; i++) if (/system/i.test(entries[i])) { pickIndex = i; break; }
  if (pickIndex < 0) return JSON.stringify({ error: 'no System entry in the provider dropdown', entries }, null, 1);
  const pickedEntry = entries[pickIndex];
  options[pickIndex].click();
  await sleep(300);
  const immediate = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null, tier: manager()?.selectedTier ?? null };
  const dv1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row1 = dv1.readers.find(r => r.key && r.key.endsWith('/' + key));
  await sleep(1500);
  const settled = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null, tier: manager()?.selectedTier ?? null };
  const dv2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row2 = dv2.readers.find(r => r.key && r.key.endsWith('/' + key));
  if (manager()?.active && !manager()?.paused) internal.toggleReadAloudPaused();
  for (let i = 0; i < 30; i++) { if (manager()?.paused) break; await sleep(120); }
  const finalState = { active: !!manager()?.active, paused: !!manager()?.paused };
  const verdict = {
    resolvedToRemembered: settled.selected === remembered,
    notPredictedLanding: settled.selected !== predicted,
    savedRememberedManual: savedIdOf(row2) === remembered && (row2?.manual ?? row2?.saved?.manual) === true,
  };
  verdict.allOk = Object.values(verdict).every(Boolean);
  state.item12run.entryPick = { entries, pickedEntry, pickIndex, immediate, settled, finalState, verdict };
  return JSON.stringify({ closed, notice, idleBefore, entries, pickedEntry, pickIndex, remembered, predicted, immediate, row1, settled, row2, finalState, verdict }, null, 1);
})()
