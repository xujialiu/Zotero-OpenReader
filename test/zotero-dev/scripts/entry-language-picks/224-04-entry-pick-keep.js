// Issue #224 case items 3.3 (language half) + 3.1: picking the language the
// Player already shows changes nothing (no notice, draft as it was, no menu
// opens); then, from the draft, picking the second entry (Fish Audio, which
// lists English (United Kingdom)) keeps en-GB: player.provider fish, locale
// en-GB, voice '', and the voice menu opens again listing that entry's en-GB
// voices only. Driven through the Player page.
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
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const pop = () => fdoc.querySelector('.popover');
    const openMenu = async (key) => {
      const btn = fdoc.querySelector(`[data-pick="${key}"]`);
      if (!btn) throw new Error('no ' + key + ' button');
      btn.click();
      let p = null;
      for (let t = 0; t < 1500 && !p; t += 40) { await sleep(40); p = fdoc.querySelector('.popover'); }
      return p;
    };
    const clickRow = (title) => {
      const rows = fdoc.querySelectorAll('.popover .option');
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].getAttribute('title') ?? '') === title) { rows[i].click(); return true; }
      }
      return false;
    };
    const before = vs();
    out.checks.before = { draft: before.handoff?.draft ?? null, notice: before.handoff?.notice ?? null, player: before.player };
    if (before.handoff?.draft?.tier !== 'system' || before.handoff?.draft?.locale !== 'en-GB') throw new Error('the {system,en-GB} draft from item 2 is not standing');

    // 3.3, language half: re-pick the shown language. The row's own onclick
    // closes the popover and sends; a shown value sends a no-op command.
    const localeName = new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of('en-GB');
    if (!(await openMenu('locale'))) throw new Error('the language menu did not open');
    if (!clickRow(localeName)) throw new Error('no "' + localeName + '" row');
    await sleep(800);
    const afterRepick = vs();
    out.checks.repickShown = {
      draft: afterRepick.handoff?.draft ?? null,
      notice: afterRepick.handoff?.notice ?? null,
      playerLocale: afterRepick.player?.locale ?? null,
      popoverOpened: !!pop(),
    };
    const repickNoop = afterRepick.handoff?.draft?.tier === 'system' && afterRepick.handoff?.draft?.locale === 'en-GB'
      && afterRepick.handoff?.notice === 'paused' && !pop();

    // 3.1: from the draft, pick the Fish Audio entry (the second; it lists en-GB).
    const tiers = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const labels = tiers?.labels ?? {};
    const fishLabel = labels['fish'] ?? 'Fish Audio';
    out.checks.fishLabel = fishLabel;
    if (!(await openMenu('provider'))) throw new Error('the entry menu did not open');
    if (!clickRow(fishLabel)) { out.checks.providerRowTitles = [...fdoc.querySelectorAll('.popover .option')].map((r) => r.getAttribute('title')); throw new Error('no "' + fishLabel + '" row in the entry menu'); }
    // The voice menu opens by itself within ~2 s of the pick (followUp).
    let vpop = null;
    for (let t = 0; t < 3000; t += 60) {
      await sleep(60);
      const v = vs();
      const p = pop();
      if (v.handoff?.draft?.tier === 'fish' && p) { vpop = p; out.checks.afterEntryPick = { atMs: t, player: v.player, draft: v.handoff.draft, selected: v.selected, paused: v.paused }; break; }
    }
    if (!vpop) out.checks.afterEntryPick = { player: vs().player, draft: vs().handoff?.draft ?? null, popoverOpened: !!pop() };
    out.checks.voiceMenuAria = vpop ? vpop.getAttribute('aria-label') : null;
    const rows = vpop ? [...fdoc.querySelectorAll('.popover .option')] : [];
    out.checks.voiceRowTitles = rows.map((r) => r.getAttribute('title'));
    out.checks.voiceChosenRows = rows.filter((r) => r.classList.contains('chosen')).map((r) => r.getAttribute('title'));
    const expected = [];
    const all = manager.allVoices ?? [];
    for (let i = 0; i < all.length; i++) {
      const v = all[i];
      if (v?.tier === 'fish' && v.language === 'en-GB') expected.push(String(v.label ?? v.id));
    }
    out.checks.expectedFishEnGB = expected;
    out.checks.playDisabled = fdoc.querySelector('.play')?.disabled ?? null;
    S.fishEnGB = expected;
    const d = out.checks.afterEntryPick;
    const entryOk = d && d.player?.provider === 'fish' && d.player?.locale === 'en-GB' && d.player?.voice === ''
      && d.player?.chooseVoice === true && d.draft?.tier === 'fish' && d.draft?.locale === 'en-GB'
      && out.checks.voiceMenuAria === 'Voice';
    const sameVoiceRows = out.checks.voiceRowTitles.length === expected.length && out.checks.voiceRowTitles.every((t, i) => t === expected[i]);
    out.status = repickNoop && entryOk && sameVoiceRows && out.checks.voiceChosenRows.length === 0 && out.checks.playDisabled === true ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
