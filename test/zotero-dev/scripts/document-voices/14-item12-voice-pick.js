(async () => {
  // Item 12 (issue #183), discriminating pick: from the manager's own list
  // (allVoices), pick a System voice that is NOT the first voice of its
  // language-region, through the player's voice dropdown. Names the predicted
  // bug landing (first voice of that region in list order) BEFORE the pick.
  const P = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const { itemID, key } = state.item12run.fixture;
  const reader0 = (Zotero.Reader._readers || []).find(e => e.itemID === itemID);
  const internal0 = reader0._internalReader;
  // the player may have closed since the precondition — reopen it (the planted
  // record and the closed port keep the manager idle through the guard)
  if (!internal0._readAloudPopupOpen) {
    const main0 = Zotero.getMainWindow();
    if (main0.Zotero_Tabs?.select && reader0.tabID) main0.Zotero_Tabs.select(reader0.tabID);
    try { reader0._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (e) {}
    internal0.toggleReadAloudPopup(true);
    for (let i = 0; i < 60; i++) { if (internal0._readAloudPopupOpen) break; await sleep(150); }
    await sleep(600);
  }
  const reader = reader0;
  const internal = internal0;
  const manager = () => internal._readAloudManager;
  const playerDoc = () => reader._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const readAloudVoicesPref = () => { try { return JSON.parse(Services.prefs.getStringPref('extensions.zotero.reader.readAloudVoices')); } catch (e) { return { error: String(e) }; } };
  const savedIdOf = (row) => typeof row?.saved === 'string' ? row.saved : (row?.saved?.id ?? row?.saved?.voice?.id ?? row?.saved ?? null);
  // manager's own merged list — walk by index (reader realm); wait for the
  // refreshed list to carry the system provider (the rebuild is async after
  // a popup open / switch flip)
  let voices = [];
  for (let round = 0; round < 50; round++) {
    const list = manager()?.allVoices;
    voices = [];
    for (let i = 0; i < (list?.length || 0); i++) {
      const v = list[i];
      if (typeof v?.id === 'string') voices.push({ id: v.id, label: String(v.label ?? v.name ?? v.id), tier: v.tier ?? null, lang: (v.lang ?? v.language ?? null) ? String(v.lang ?? v.language) : null });
    }
    if (voices.some(v => v.id.startsWith('system::'))) break;
    await sleep(200);
  }
  const system = voices.filter(v => v.id.startsWith('system::'));
  // group system voices by region = the label's last parenthetical
  const groups = new Map();
  for (let i = 0; i < system.length; i++) {
    const m = system[i].label.match(/\(([^()]+)\)\s*$/);
    const region = m ? m[1] : (system[i].lang || 'unknown');
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(system[i]);
  }
  let region = null, regionRows = null;
  if (groups.get('United States')?.length >= 2) { region = 'United States'; regionRows = groups.get('United States'); }
  else {
    let best = 0;
    for (const [r, rows] of groups) { if (rows.length >= 2 && rows.length > best) { best = rows.length; region = r; regionRows = rows; } }
  }
  if (!regionRows) {
    return JSON.stringify({ notTestable: true, reason: 'no language-region with a second System voice in the manager list', systemCount: system.length, regions: [...groups.entries()].map(([r, rows]) => ({ region: r, count: rows.length, head: rows.slice(0, 3).map(v => v.label) })) }, null, 1);
  }
  const predicted = regionRows[0];
  // pick the first non-first voice of the region whose label is unambiguous
  // (same label naming several different ids would make the click ambiguous)
  let target = null;
  for (let i = 1; i < regionRows.length; i++) {
    const cand = regionRows[i];
    const sameLabelIds = new Set(voices.filter(v => v.label === cand.label).map(v => v.id));
    if (sameLabelIds.size === 1) { target = cand; break; }
  }
  if (!target) {
    return JSON.stringify({ notTestable: true, reason: 'every non-first voice of the region shares its label with a different id', region, regionSize: regionRows.length, labels: regionRows.slice(0, 6).map(v => v.label) }, null, 1);
  }
  const before = { active: !!manager()?.active, selected: manager()?.selectedVoiceID ?? null };
  const prefBefore = readAloudVoicesPref();
  const dv0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row0 = dv0.readers.find(r => r.key && r.key.endsWith('/' + key));
  // open the voice dropdown and pick
  let doc = playerDoc();
  if (!doc) throw new Error('player frame missing');
  const picker = doc.querySelector('[data-pick="voice"]');
  if (picker.getAttribute('aria-expanded') !== 'true') picker.click();
  let options = [];
  for (let i = 0; i < 30; i++) { await sleep(100); doc = playerDoc(); options = [...(doc?.querySelectorAll('.popover .option') || [])]; if (options.length) break; }
  const labels = options.map(o => o.textContent?.trim());
  const hits = [];
  for (let i = 0; i < options.length; i++) if (options[i].textContent?.trim() === target.label) hits.push(i);
  if (!hits.length) return JSON.stringify({ error: 'target option missing', targetLabel: target.label, head: labels.slice(0, 16), optionCount: labels.length }, null, 1);
  const pickIndex = hits[0];
  options[pickIndex].click();
  await sleep(300);
  let immediate = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null, tier: manager()?.selectedTier ?? null };
  if (immediate.selected !== target.id) {
    // option rows select on pointerup in some builds — dispatch once before giving up
    const w = Components.utils.waiveXrays(doc.defaultView);
    const el = Components.utils.waiveXrays(doc).querySelectorAll('.popover .option')[pickIndex];
    try { el.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true })); } catch (e) {}
    await sleep(900);
    immediate = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null, tier: manager()?.selectedTier ?? null, pointerupRetry: true };
  }
  const dv1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row1 = dv1.readers.find(r => r.key && r.key.endsWith('/' + key));
  await sleep(1500);
  const settled = { active: !!manager()?.active, paused: !!manager()?.paused, selected: manager()?.selectedVoiceID ?? null };
  const dv2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const row2 = dv2.readers.find(r => r.key && r.key.endsWith('/' + key));
  const prefAfter = readAloudVoicesPref();
  if (manager()?.active && !manager()?.paused) internal.toggleReadAloudPaused();
  for (let i = 0; i < 30; i++) { if (manager()?.paused) break; await sleep(120); }
  const finalState = { active: !!manager()?.active, paused: !!manager()?.paused };
  const verdict = {
    pickedVoice: settled.selected === target.id,
    notPredictedLanding: settled.selected !== predicted.id,
    activeTrue: settled.active === true,
    savedPickedManual: savedIdOf(row2) === target.id && (row2?.manual ?? row2?.saved?.manual) === true,
    prefEnVoicePicked: (prefAfter?.en?.voice?.id ?? prefAfter?.en?.voice ?? null) === target.id,
  };
  verdict.allOk = Object.values(verdict).every(Boolean);
  state.item12run.voicePick = {
    pickedId: target.id, pickedLabel: target.label,
    predictedId: predicted.id, predictedLabel: predicted.label, region,
    immediate, settled, finalState, verdict,
  };
  return JSON.stringify({
    region, predicted: { id: predicted.id, label: predicted.label }, target: { id: target.id, label: target.label },
    systemCount: system.length, regionSize: regionRows.length, optionCount: labels.length, pickIndex,
    allVoicesTotal: voices.length,
    before, immediate, row1, settled, row2, prefBeforeEn: prefBefore?.en ?? null, prefAfterEn: prefAfter?.en ?? null,
    finalState, verdict,
  }, null, 1);
})()
