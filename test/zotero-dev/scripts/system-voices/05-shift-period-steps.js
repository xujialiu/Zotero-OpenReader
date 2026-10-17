// 1.17 keys: on the System entry and English (United States), with the voice listed just before
// Samantha selected and the reading idle (paused), trusted Shift+. three times.
// On this build a pick on a live session parks in the Handoff: its pending target is what steps
// (Samantha, Sandy, Shelley — the fix; before #185 it stalled on Samantha, the twin row), and
// manager.selectedVoiceID follows at the next Play, which this script proves with a commit at
// each end. Restores the voice selected at the start (by committing it back). Needs the host
// window restored and focused (trusted input): the driver un-minimizes before this script.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = (v) => Components.utils.waiveXrays(v);
  const readAll = async () => {
    const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    const mine = (parsed.readers || []).find((r) => r.itemID === state.fixtureItemID) || {};
    const m = waive(((Zotero.Reader._readers || []).find((r) => r.itemID === state.fixtureItemID))?._internalReader?._readAloudManager);
    const s = mine.session || {};
    return {
      selected: m && m.selectedVoiceID ? String(m.selectedVoiceID) : null,
      pending: s.handoff && s.handoff.pending ? String(s.handoff.target) : null,
      paused: !!s.paused
    };
  };
  const playTrusted = (rw) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    tip.keydown(ev('Shift', 'ShiftLeft', 16, false));
    tip.keydown(ev(' ', 'Space', 32, true));
    tip.keyup(ev(' ', 'Space', 32, true));
    tip.keyup(ev('Shift', 'ShiftLeft', 16, false));
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
  };
  const pressNext = (rw) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16, false)), tip.keydown(ev('.', 'Period', 190, true)), tip.keyup(ev('.', 'Period', 190, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16, false))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret[1];
  };
  const waitNoPending = async (maxMs) => {
    const t0 = Date.now();
    let snap = await readAll();
    while (snap.pending && Date.now() - t0 < maxMs) { await sleep(500); snap = await readAll(); }
    return snap;
  };
  try {
    const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === state.fixtureItemID);
    if (!reader) throw new Error('fixture reader gone');
    const rw = reader._iframeWindow;
    const internal = reader._internalReader;
    const m = waive(internal._readAloudManager);
    // Settle: active and paused.
    if (!m.active) { m.activate(); await sleep(600); }
    if (!m.paused) { internal.toggleReadAloudPaused(); await sleep(400); }
    // The Player on the System entry and English (United States) — the entry that holds
    // Samantha. The options object crosses the compartment cloned.
    m.selectTier('system');
    await sleep(300);
    m.setLanguage('en', Components.utils.cloneInto({ region: 'US' }, rw));
    await sleep(300);
    out.tierAndLang = { tier: String(m.selectedTier), lang: String(m.lang), region: m.region ? String(m.region) : null };
    // The player's list: Zotero's buildVoiceOptions order, without invoking reader-realm
    // callbacks from chrome — walk by index, sort stably by credits in chrome scope.
    const raw = m.voicesForLanguage;
    const list = [];
    for (let i = 0; i < raw.length; i++) list.push({ id: String(raw[i].id), label: raw[i].label ? String(raw[i].label) : null, credits: raw[i].creditsPerMinute === undefined ? null : Number(raw[i].creditsPerMinute) });
    const withIndex = list.map((v, i) => ({ ...v, i }));
    withIndex.sort((a, b) => (a.credits === null ? -1 : a.credits) - (b.credits === null ? -1 : b.credits));
    out.listLength = withIndex.length;
    const samanthaIdx = withIndex.findIndex((v) => /samantha/i.test(v.id));
    out.samantha = { index: samanthaIdx, id: samanthaIdx >= 0 ? withIndex[samanthaIdx].id : null };
    if (samanthaIdx < 1) throw new Error('no voice listed before Samantha');
    const startVoice = withIndex[samanthaIdx - 1];
    out.startVoice = startVoice;
    out.expected = [withIndex[samanthaIdx].id, withIndex[(samanthaIdx + 1) % withIndex.length].id, withIndex[(samanthaIdx + 2) % withIndex.length].id];
    // Select the voice before Samantha: a selectVoice on a live session parks a pending
    // handoff — commit it with a Play, then pause, so the selection really is the start voice.
    m.selectVoice(startVoice.id);
    await sleep(500);
    playTrusted(rw);
    out.startCommit = await waitNoPending(10000);
    if (!m.paused) { internal.toggleReadAloudPaused(); await sleep(400); }
    out.start = await readAll();
    if (out.start.selected !== startVoice.id) throw new Error('start voice is ' + out.start.selected);
    // The three presses; the pending target is what steps.
    out.presses = [];
    for (let k = 1; k <= 3; k++) {
      const ret = pressNext(rw);
      await sleep(800);
      const snap = await readAll();
      out.presses.push({ press: k, keydownReturn: ret, selected: snap.selected, pendingTarget: snap.pending });
    }
    const pendings = out.presses.map((p) => p.pendingTarget);
    out.pendingSteps = {
      threeDistinct: new Set(pendings).size === 3,
      inListOrder: out.expected.every((id, i) => pendings[i] === id),
      samanthaAmong: pendings.includes(out.expected[0]),
      neverSameTwice: pendings.every((id, i) => i === 0 || id !== pendings[i - 1])
    };
    // The picks take the reading at the next Play: jump to the first segment so the sentence
    // has room, play, and read the selection the commit lands on.
    m.repositionTo(0);
    await sleep(400);
    playTrusted(rw);
    out.afterPlay = await waitNoPending(10000);
    if (!m.paused) { internal.toggleReadAloudPaused(); await sleep(400); }
    out.committed = await readAll();
    // Restore the voice selected at the start: commit it back.
    m.selectVoice(startVoice.id);
    await sleep(500);
    playTrusted(rw);
    out.afterRestore = await waitNoPending(10000);
    if (!m.paused) { internal.toggleReadAloudPaused(); await sleep(400); }
    out.restored = await readAll();
    out.restoreOk = out.restored.selected === startVoice.id;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ fatal: String(e && e.message || e), step: out });
  }
})()
