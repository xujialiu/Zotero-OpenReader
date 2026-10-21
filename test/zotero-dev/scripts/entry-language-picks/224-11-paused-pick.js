// Issue #224 case item 7.1: paused on V, a language pick still opens the voice
// menu — but no "Paused. Choose a voice to continue." notice appears (the
// reading was already paused). State: the player reopened by item 6.1, paused.
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
    const doc = wu(reader._iframeWindow.document);
    const noticeState = () => { const el = doc.getElementById('ztts-voice-notice'); return el ? { text: el.textContent, opacity: el.style.opacity } : null; };
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const before = vs();
    out.checks.before = { paused: before.paused, selected: before.selected, player: before.player, notice: noticeState() };
    if (!before.paused) throw new Error('the manager is not paused');
    const noticeBefore = noticeState();

    // Pick English (United Kingdom) in the language menu, through the Player page.
    const localeName = new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of('en-GB');
    const btn = fdoc.querySelector('[data-pick="locale"]');
    btn.click();
    let pop = null;
    for (let t = 0; t < 1500 && !pop; t += 40) { await sleep(40); pop = fdoc.querySelector('.popover'); }
    if (!pop) throw new Error('the language menu did not open');
    const rows = fdoc.querySelectorAll('.popover .option');
    let clicked = false;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].getAttribute('title') ?? '') === localeName) { rows[i].click(); clicked = true; break; }
    }
    if (!clicked) throw new Error('no "' + localeName + '" row');
    let landed = null;
    let noticeShownAt = null;
    for (let t = 0; t < 2000; t += 50) {
      await sleep(50);
      const v = vs();
      const n = noticeState();
      if (n && n.text === 'Paused. Choose a voice to continue.' && n.opacity === '1' && noticeShownAt === null) noticeShownAt = t;
      if (v.player?.chooseVoice === true && !landed) { landed = { atMs: t, player: v.player, draft: v.handoff?.draft ?? null, notice: v.handoff?.notice ?? null, paused: v.paused, selected: v.selected }; }
    }
    out.checks.pick = landed;
    // The voice menu opens by itself.
    let vpop = fdoc.querySelector('.popover');
    for (let t = 0; t < 2500 && !vpop; t += 60) { await sleep(60); vpop = fdoc.querySelector('.popover'); }
    out.checks.voiceMenu = { present: !!vpop, aria: vpop ? vpop.getAttribute('aria-label') : null };
    const noticeAfter = noticeState();
    out.checks.noticeAfter = noticeAfter;
    // "No Paused notice": the rendered element must stay hidden. (The
    // diagnostic's handoff.notice is only the LAST kind recorded — it lingers
    // from earlier picks — so it is not evidence either way; a paused pick
    // emits no notice at all, voice-pick.ts choose(): only `if (playing)`.)
    const pausedNoticeShown = noticeShownAt !== null || (noticeAfter && noticeAfter.opacity === '1');
    out.checks.pausedNoticeShown = pausedNoticeShown;
    out.checks.noticeShownAt = noticeShownAt;
    out.status = landed && landed.player?.chooseVoice === true && landed.draft?.locale === 'en-GB'
      && !pausedNoticeShown && out.checks.voiceMenu.present && out.checks.voiceMenu.aria === 'Voice'
      && landed.paused === true
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
