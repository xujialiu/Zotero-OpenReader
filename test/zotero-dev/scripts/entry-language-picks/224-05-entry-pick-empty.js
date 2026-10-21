// Issue #224 case item 3.2: an entry pick that leaves the language empty.
// The profile's pair: the Fish Audio entry reads (a fish-only locale English
// (New Zealand) voice), then the System entry is picked — the System entry has
// no en-NZ, so the pick keeps no language: locale '', the voice list empty, and
// the LANGUAGE menu opens by itself. Driven through the Player page; the fish
// reading is muted and bounded to the paused sentence.
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
    const localeNameOf = (tag) => new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of(tag);
    const before = vs();
    if (before.handoff?.draft?.tier !== 'fish' || before.handoff?.draft?.locale !== 'en-GB') throw new Error('the {fish,en-GB} draft from item 3.1 is not standing');

    // Switch the draft's language to English (New Zealand) — a locale only the
    // Fish Audio entry has — then commit a voice of that draft, still paused.
    const nzName = localeNameOf('en-NZ');
    out.checks.nzRowTitle = nzName;
    if (!(await openMenu('locale'))) throw new Error('the language menu did not open');
    if (!clickRow(nzName)) throw new Error('no "' + nzName + '" row in the language menu');
    await sleep(700);
    const draftNz = vs();
    out.checks.draftNz = { draft: draftNz.handoff?.draft ?? null, player: draftNz.player };
    if (draftNz.handoff?.draft?.locale !== 'en-NZ') throw new Error('draft did not move to en-NZ: ' + JSON.stringify(draftNz.handoff?.draft));
    const nzVoices = [];
    const all = manager.allVoices ?? [];
    for (let i = 0; i < all.length; i++) {
      const v = all[i];
      if (v?.tier === 'fish' && v.language === 'en-NZ') nzVoices.push({ id: String(v.id), label: String(v.label ?? v.id) });
    }
    out.checks.fishEnNZ = nzVoices.map((v) => v.label);
    if (!nzVoices.length) throw new Error('the fish entry lists no en-NZ voices');
    // The voice menu for the draft is open: pick its first voice.
    const firstNz = nzVoices[0];
    if (!clickRow(firstNz.label)) {
      if (!(await openMenu('voice'))) throw new Error('the voice menu did not open');
      if (!clickRow(firstNz.label)) throw new Error('no "' + firstNz.label + '" row in the voice menu');
    }
    let committed = null;
    for (let t = 0; t < 2000; t += 40) {
      await sleep(40);
      const v = vs();
      if (!v.handoff?.draft && v.selected === firstNz.id) { committed = { atMs: t, selected: v.selected, paused: v.paused, player: v.player }; break; }
    }
    out.checks.voiceCommitted = committed;
    if (!committed) throw new Error('the en-NZ voice pick did not select paused');

    // Play: a fish en-NZ reading on the muted fixture (one bounded sentence).
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
    fdoc.querySelector('.play').click();
    let playing = false;
    for (let t = 0; t < 12000; t += 150) { await sleep(150); if (manager.active && !manager.paused) { playing = true; break; } }
    out.checks.fishPlaying = playing ? { selected: manager.selectedVoiceID } : null;
    if (!playing) throw new Error('the fish en-NZ reading did not start');
    await sleep(1200); // let one sentence sound (muted)

    // Now pick the System entry from the fish en-NZ reading.
    const tiers = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const labels = tiers?.labels ?? {};
    const systemLabel = labels['system'] ?? 'System';
    if (!(await openMenu('provider'))) throw new Error('the entry menu did not open');
    if (!clickRow(systemLabel)) throw new Error('no "' + systemLabel + '" row in the entry menu');
    let landed = null;
    for (let t = 0; t < 3000; t += 60) {
      await sleep(60);
      const v = vs();
      if (v.handoff?.draft?.tier === 'system' && v.handoff?.draft?.locale === null) { landed = { atMs: t, player: v.player, draft: v.handoff.draft, paused: v.paused, selected: v.selected, notice: v.handoff.notice }; break; }
    }
    out.checks.emptyLanguagePick = landed;
    // The language menu opens by itself; the voice list is empty.
    let lpop = pop();
    for (let t = 0; t < 2500 && !lpop; t += 60) { await sleep(60); lpop = pop(); }
    out.checks.menuAfter = { aria: lpop ? lpop.getAttribute('aria-label') : null, rows: lpop ? [...fdoc.querySelectorAll('.popover .option')].map((r) => r.getAttribute('title')).length : null, emptyRow: lpop ? (fdoc.querySelector('.popover .empty')?.textContent ?? null) : null };
    out.checks.playDisabled = fdoc.querySelector('.play')?.disabled ?? null;
    out.checks.voiceFieldText = fdoc.querySelector('[data-pick="voice"] .value')?.textContent ?? null;
    const d = landed;
    out.status = d && d.player?.provider === 'system' && d.player?.locale === '' && d.player?.voice === ''
      && d.player?.chooseVoice === true && d.draft?.tier === 'system' && d.draft?.locale === null
      && out.checks.menuAfter.aria === 'Language' && out.checks.playDisabled === true
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
