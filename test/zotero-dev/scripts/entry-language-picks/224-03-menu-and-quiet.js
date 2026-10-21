// Issue #224 case items 2.2 + 2.3: after the language pick the voice menu is
// open by itself (the .popover whose aria-label is the Player's word for Voice),
// listing only the draft entry's en-GB voices, none marked chosen, and Play is
// grayed out. And nothing reads in the old voice meanwhile: the engine keeps
// the session's voice V and asks for no new clip (store.requests flat).
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (S.readerIndex === undefined) throw new Error('run 224-00 first');
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const manager = wu(reader._internalReader._readAloudManager);
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const eng = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers[idx];
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow

    // The voice menu opened by itself after the pick (followUp). Poll briefly in
    // case the previous script's five-second wait just ended.
    let pop = fdoc.querySelector('.popover');
    for (let t = 0; t < 2500 && !pop; t += 100) { await sleep(100); pop = fdoc.querySelector('.popover'); }
    out.checks.popoverPresent = !!pop;
    out.checks.popoverAriaLabel = pop ? pop.getAttribute('aria-label') : null;
    out.checks.expandedButton = (() => { const b = fdoc.querySelector('[data-pick][aria-expanded="true"]'); return b ? b.dataset.pick : null; })();
    const rows = pop ? [...fdoc.querySelectorAll('.popover .option')] : [];
    out.checks.rowTitles = rows.map((r) => r.getAttribute('title'));
    out.checks.chosenRows = rows.filter((r) => r.classList.contains('chosen')).map((r) => r.getAttribute('title'));
    // Expected: exactly the System entry's en-GB voices, in the manager's list order.
    const expected = [];
    const all = manager.allVoices ?? [];
    for (let i = 0; i < all.length; i++) {
      const v = all[i];
      if (v?.tier === 'system' && v.language === 'en-GB') expected.push(String(v.label ?? v.id));
    }
    out.checks.expectedTitles = expected;
    const play = fdoc.querySelector('.play');
    out.checks.playDisabled = play ? play.disabled : null;
    out.checks.playAriaLabel = play ? play.getAttribute('aria-label') : null;
    out.checks.voiceFieldText = fdoc.querySelector('[data-pick="voice"] .value')?.textContent ?? null;
    const pluginPlayer = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    out.checks.pluginPlayerFrames = pluginPlayer?.frames ?? null;

    // 2.3: no request for any en-GB voice — the session keeps V and asks nothing.
    const e1 = await eng();
    await sleep(1500);
    const e2 = await eng();
    out.checks.engine = {
      voice1: e1?.session?.voice ?? null, voice2: e2?.session?.voice ?? null,
      requests1: e1?.session?.store?.requests ?? null, requests2: e2?.session?.store?.requests ?? null,
      paused: e2?.session?.paused ?? null, playing: e2?.session?.playing ?? null,
      position: e2?.session?.position ?? null,
      handoffPending: e2?.session?.handoff?.pending ?? null,
    };
    const sameTitles = out.checks.rowTitles.length === expected.length && out.checks.rowTitles.every((t, i) => t === expected[i]);
    out.status = out.checks.popoverPresent && out.checks.popoverAriaLabel === 'Voice'
      && sameTitles && out.checks.chosenRows.length === 0 && out.checks.playDisabled === true
      && out.checks.engine.voice1 === out.checks.engine.voice2
      && out.checks.engine.requests1 === out.checks.engine.requests2
      && out.checks.engine.paused === true
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
