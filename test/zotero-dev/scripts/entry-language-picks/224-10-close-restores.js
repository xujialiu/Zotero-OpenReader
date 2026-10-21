// Issue #224 case item 6.1: make a draft (as in item 2.1) and close the Player.
// Reopen it: provider, language and voice are the ones before the pick, and the
// document voice record is unchanged. The close is the Player's own close
// (zttsCommand('close')); the reopen is its open.
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
    const p = Services.prefs;
    const prefix = 'extensions.zotero.zotero-tts.';
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const frame = wu(reader._iframeWindow.document.getElementById('ztts-player-frame'));
    const fdoc = wu(wu(frame.contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const openMenu = async (key) => {
      const btn = fdoc.querySelector(`[data-pick="${key}"]`);
      if (!btn) throw new Error('no ' + key + ' button');
      btn.click();
      let q = null;
      for (let t = 0; t < 1500 && !q; t += 40) { await sleep(40); q = fdoc.querySelector('.popover'); }
      return q;
    };
    const clickRow = (title) => {
      const rows = fdoc.querySelectorAll('.popover .option');
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].getAttribute('title') ?? '') === title) { rows[i].click(); return true; }
      }
      return false;
    };
    const localeNameOf = (tag) => new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of(tag);
    const recordNow = () => p.getStringPref(prefix + 'documentVoices.user/' + S.itemKey) || null;
    const fw = wu(frame.contentWindow);
    const playAndWait = async () => {
      try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
      fdoc.querySelector('.play').click();
      for (let t = 0; t < 8000; t += 120) { await sleep(120); if (manager.active && !manager.paused) return true; }
      return false;
    };

    // Resume playing (item 6.1 remakes an item-2.1 draft, which needs a reading).
    if (!manager.active || manager.paused) {
      if (!(await playAndWait())) throw new Error('the reading did not resume');
      await sleep(600);
    }
    // The reopened Player must show a language the en-GB draft pick can change
    // (item 7.1 drafts from exactly that reopened state): on an en-GB reading,
    // land on an en-US voice first — a throwaway en-US draft, its first voice
    // committed (the item 5.3 mechanics), then read on (revised 2026-10-22).
    if ((vs().player?.locale ?? '') === 'en-GB') {
      const usName = localeNameOf('en-US');
      if (!(await openMenu('locale'))) throw new Error('the language menu did not open (bridge)');
      if (!clickRow(usName)) throw new Error('no "' + usName + '" row (bridge)');
      let usDraft = null;
      for (let t = 0; t < 2000; t += 50) { await sleep(50); const v = vs(); if (v.handoff?.draft?.tier === 'system' && v.handoff?.draft?.locale === 'en-US') { usDraft = v; break; } }
      if (!usDraft) throw new Error('the bridge en-US draft did not stand');
      const usVoices = [];
      const all = manager.allVoices ?? [];
      for (let i = 0; i < all.length; i++) { const v = all[i]; if (v?.tier === 'system' && v.language === 'en-US') { usVoices.push({ id: String(v.id), label: String(v.label ?? v.id) }); break; } }
      if (!clickRow(usVoices[0].label)) throw new Error('no "' + usVoices[0].label + '" row in the auto-opened voice menu (bridge)');
      let committed = null;
      for (let t = 0; t < 2000; t += 40) { await sleep(40); const v = vs(); if (!v.handoff?.draft && v.selected === usVoices[0].id) { committed = true; break; } }
      if (!committed) throw new Error('the bridge en-US voice did not commit');
      if (!(await playAndWait())) throw new Error('the reading did not resume after the bridge');
      await sleep(600);
    }
    const prePlayer = vs().player;
    const preRecord = recordNow();
    out.checks.beforePick = { player: prePlayer, record: preRecord, paused: vs().paused };

    // Make the draft as item 2.1 does: pick English (United Kingdom) in the
    // language menu — the reopened Player must show the state before the pick
    // (en-US, since the reading reads an en-US voice), which is what item 7.1
    // drafts from (revised 2026-10-22: the prepared script picked the Fish
    // entry, which keeps en-GB and leaves item 7.1's pick a no-op).
    const gbLabel = new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of('en-GB');
    if (!(await openMenu('locale'))) throw new Error('the language menu did not open');
    if (!clickRow(gbLabel)) throw new Error('no "' + gbLabel + '" row');
    let drafted = false;
    for (let t = 0; t < 2000; t += 50) { await sleep(50); const v = vs(); if (v.handoff?.draft?.tier === 'system' && v.handoff?.draft?.locale === 'en-GB') { drafted = true; break; } }
    out.checks.draftMade = drafted;
    if (!drafted) throw new Error('the en-GB draft did not stand');

    // Close the Player with its own close; the draft ends with the session.
    await fw.zttsCommand('close');
    await sleep(800);
    out.checks.afterClose = { active: manager.active, draft: vs().handoff?.draft ?? null, record: recordNow() };

    // Reopen through the Player's open; pause at once (it starts to play).
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
    await fw.zttsCommand('open');
    let started = false;
    for (let t = 0; t < 12000; t += 120) { await sleep(120); if (manager.active) { started = true; break; } }
    if (!started) throw new Error('the player did not reopen');
    fdoc.querySelector('.play').click(); // it resumed playing: pause it
    for (let t = 0; t < 4000; t += 100) { await sleep(100); if (manager.paused) break; }
    await sleep(500);
    const reopened = vs();
    out.checks.afterReopen = { player: reopened.player, paused: reopened.paused, draft: reopened.handoff?.draft ?? null, record: recordNow() };
    const same = reopened.player?.provider === prePlayer.provider && reopened.player?.locale === prePlayer.locale
      && reopened.player?.voice === prePlayer.voice && out.checks.afterReopen.record === preRecord;
    out.status = drafted && same && reopened.paused === true && !reopened.handoff?.draft ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
