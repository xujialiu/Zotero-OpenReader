// Issue #224 case item 2.1: a language pick (English (United Kingdom)) in the
// Player while reading pauses the reading, keeps the manager's voice, and
// leaves a draft { tier 'system', locale 'en-GB' } with no voice. The notice
// "Paused. Choose a voice to continue." shows (white-space: pre-line, opacity 1)
// and is gone after five seconds. Driven through the Player page: the language
// menu is opened by clicking the Player's [data-pick="locale"] button and the
// en-GB row is clicked like a user would.
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, trace: [], errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (S.readerIndex === undefined) throw new Error('run 224-00 first');
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const manager = wu(reader._internalReader._readAloudManager);
    // Must be reading (playing) before the pick; resume through the Player if needed.
    if (!manager.active || manager.paused) {
      const doc0 = wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentDocument);
      doc0.querySelector('.play').click();
      const end = Date.now() + 8000;
      while (Date.now() < end && !(manager.active && !manager.paused)) await sleep(100);
    }
    if (!(manager.active && !manager.paused)) throw new Error('fixture is not playing before the pick');
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const doc = wu(reader._iframeWindow.document);
    const noticeState = () => {
      const el = doc.getElementById('ztts-voice-notice');
      return el ? { text: el.textContent, opacity: el.style.opacity, whiteSpace: el.style.whiteSpace } : null;
    };
    out.checks.before = { selected: manager.selectedVoiceID, paused: manager.paused, notice: noticeState() };

    // Open the language menu and click the English (United Kingdom) row.
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const localeName = new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of('en-GB');
    out.checks.expectedRowTitle = localeName;
    const btn = fdoc.querySelector('[data-pick="locale"]');
    if (!btn) throw new Error('no locale picker button in the Player page');
    btn.click();
    let pop = null;
    for (let t = 0; t < 1500 && !pop; t += 40) { await sleep(40); pop = fdoc.querySelector('.popover'); }
    if (!pop) throw new Error('the language menu did not open');
    out.checks.menuAriaLabel = pop.getAttribute('aria-label');
    const rows = fdoc.querySelectorAll('.popover .option');
    const titles = [];
    let clicked = null;
    for (let i = 0; i < rows.length; i++) {
      const t = String(rows[i].getAttribute('title') ?? '');
      titles.push(t);
      if (t === localeName) { rows[i].click(); clicked = t; break; }
    }
    out.checks.rowClicked = clicked;
    out.checks.rowCount = rows.length;
    if (!clicked) { out.checks.rowTitles = titles.slice(0, 30); throw new Error('no "' + localeName + '" row in the language menu'); }

    // Within one second: paused, old voice kept, draft standing, notice shown.
    const wantNotice = 'Paused. Choose a voice to continue.';
    let hit = null;
    for (let t = 0; t < 1000; t += 25) {
      await sleep(25);
      const v = vs();
      const n = noticeState();
      if (v.paused === true && v.player?.chooseVoice === true) { hit = { atMs: t, selected: v.selected, paused: v.paused, player: v.player, draft: v.handoff?.draft ?? null, notice: n }; break; }
    }
    out.checks.withinOneSecond = hit;
    const c = hit && hit.notice;
    out.checks.noticeShown = !!c && c.text === wantNotice && c.opacity === '1' && c.whiteSpace === 'pre-line';

    // Gone after five seconds.
    await sleep(5400);
    const after = noticeState();
    out.checks.noticeAfterFiveSeconds = after;
    const v2 = vs();
    out.checks.stillPaused = { paused: v2.paused, selected: v2.selected, player: v2.player, draft: v2.handoff?.draft ?? null, notice: v2.handoff?.notice ?? null };
    out.status = hit && out.checks.noticeShown && after && after.opacity === '0'
      && hit.selected === out.checks.before.selected && hit.player?.provider === 'system' && hit.player?.locale === 'en-GB'
      && hit.player?.voice === '' && hit.draft?.tier === 'system' && hit.draft?.locale === 'en-GB'
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
