// Issue #225 items 1.1 + 2.1 + 1.2: reading on A, pick B in the Player's voice
// menu. While the switch is pending: `selected` A, `player.voice` B,
// `handoff.pending` B, the voice field reads B, B's row is the chosen one, and
// #ztts-voice-notice reads "Reading voice: A" / "Preparing voice: B" on two
// lines (one newline, pre-line), opacity 1 for as long as it is pending —
// past five seconds when the sentence lasts that long. After the takeover:
// selected B, player.voice B, pending null, the notice gone (kind 'selected').
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const PV = Zotero.ZoteroTTSRun.state.pv225 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const A = PV.A; if (!A) throw new Error('run 225-01 first');
    const manager = wu(reader._internalReader._readAloudManager);
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const doc = wu(reader._iframeWindow.document);
    const noticeState = () => { const el = doc.getElementById('ztts-voice-notice'); return el ? { text: el.textContent, opacity: el.style.opacity, whiteSpace: el.style.whiteSpace } : null; };
    const frame = wu(reader._iframeWindow.document.getElementById('ztts-player-frame'));
    const fdoc = wu(wu(frame.contentWindow).document);

    // Reading on A; B is the row after A's own in the open voice menu.
    if (vs().selected !== A.id || manager.paused) throw new Error('not reading on ' + A.id + ' — run 225-01');
    // Reading on A; B is the row after A's own in the open voice menu. A
    // popover left open on this very button would toggle closed on a click —
    // use it as it is (revised 2026-10-22 continuation run).
    const btn = fdoc.querySelector('[data-pick="voice"]');
    let pop = btn.getAttribute('aria-expanded') === 'true' ? fdoc.querySelector('.popover') : null;
    if (!pop) {
      btn.click();
      for (let t = 0; t < 1500 && !pop; t += 40) { await sleep(40); pop = fdoc.querySelector('.popover'); }
    }
    if (!pop) throw new Error('the voice menu did not open');
    const rows = fdoc.querySelectorAll('.popover .option');
    const titles = [];
    let bTitle = null;
    for (let i = 0; i < rows.length; i++) {
      const t = String(rows[i].getAttribute('title') ?? '');
      titles.push(t);
      if (t === A.label && i + 1 < rows.length) bTitle = String(rows[i + 1].getAttribute('title') ?? '');
    }
    out.checks.menu = { aria: pop.getAttribute('aria-label'), rowTitles: titles, aRow: A.label, bRow: bTitle };
    if (!bTitle) throw new Error('no row after A to pick as B');
    const B = { label: bTitle };
    { const all = manager.allVoices ?? []; for (let i = 0; i < all.length; i++) if (String(all[i].label ?? all[i].id) === bTitle) { B.id = String(all[i].id); break; } }
    if (!B.id) throw new Error('no voice id for the B row ' + bTitle);

    // The pick, then the pending-state evidence while it lasts.
    const t0 = Date.now();
    for (let i = 0; i < rows.length; i++) if (String(rows[i].getAttribute('title') ?? '') === bTitle) { rows[i].click(); break; }
    let pendingTick = null;
    for (let t = 0; t < 2500 && !pendingTick; t += 25) {
      await sleep(25);
      const v = vs();
      if (v.handoff?.pending === B.id && v.player?.voice === B.id && v.selected === A.id) {
        pendingTick = { atMs: Date.now() - t0, selected: v.selected, playerVoice: v.player.voice, pending: v.handoff.pending };
      }
    }
    out.checks.pending = pendingTick;
    if (!pendingTick) throw new Error('no pending state for B observed');

    // The Player's field reads B; B's row is the chosen one (menu reopened).
    if (btn.getAttribute('aria-expanded') !== 'true') {
      btn.click();
      let popOpen = null;
      for (let t = 0; t < 1500 && !popOpen; t += 40) { await sleep(40); popOpen = fdoc.querySelector('.popover'); }
    }
    out.checks.playerShowsB = { voiceFieldValue: fdoc.querySelector('[data-pick="voice"] .value')?.textContent ?? null };
    if (btn.getAttribute('aria-expanded') === 'true') {
      const rows2 = fdoc.querySelectorAll('.popover .option');
      const chosen = [];
      for (let i = 0; i < rows2.length; i++) if (rows2[i].classList.contains('chosen')) chosen.push(String(rows2[i].getAttribute('title') ?? ''));
      out.checks.playerShowsB.chosenRows = chosen;
      btn.click(); // close it again (a toggle)
    }
    const noticeAtPending = noticeState();
    out.checks.noticeTwoLines = noticeAtPending;
    const wantText = 'Reading voice: ' + A.label + '\nPreparing voice: ' + B.label;
    out.checks.noticeTextOk = !!noticeAtPending && noticeAtPending.text === wantText
      && (noticeAtPending.text.split('\n').length === 2) && noticeAtPending.whiteSpace === 'pre-line';

    // The notice stays up while pending: opacity 1 past five seconds if the
    // sentence lasts that long; the takeover; the notice gone once B is heard.
    let atFiveSeconds = null, takeover = null;
    for (let t = 0; t < 25000; t += 50) {
      await sleep(50);
      const elapsed = Date.now() - t0;
      const v = vs();
      if (elapsed >= 5000 && atFiveSeconds === null) atFiveSeconds = { stillPending: v.handoff?.pending === B.id, notice: noticeState() };
      if (v.selected === B.id && v.handoff?.pending !== B.id) {
        takeover = { atMs: elapsed, selected: v.selected, playerVoice: v.player.voice, pending: v.handoff?.pending ?? null, noticeKind: v.handoff?.notice ?? null, elAfter: noticeState() };
        break;
      }
    }
    out.checks.atFiveSeconds = atFiveSeconds;
    out.checks.takeover = takeover;
    await sleep(400);
    out.checks.afterTakeover = { vs: vs(), el: noticeState() };
    fdoc.querySelector('.play').click(); // bounded: pause
    for (let t = 0; t < 4000; t += 100) { await sleep(100); if (manager.paused) break; }
    out.checks.pausedAtEnd = manager.paused;

    const p = out.checks.pending, tk = out.checks.takeover;
    out.status = p && tk && tk.selected === B.id && tk.playerVoice === B.id && tk.pending === null
      && out.checks.noticeTextOk && out.checks.playerShowsB.voiceFieldValue === B.label
      && (!out.checks.playerShowsB.chosenRows || out.checks.playerShowsB.chosenRows.length === 1 && out.checks.playerShowsB.chosenRows[0] === B.label)
      && (!atFiveSeconds || !atFiveSeconds.stillPending || atFiveSeconds.notice?.opacity === '1')
      && (tk.noticeKind === 'selected' || (out.checks.afterTakeover.el?.opacity === '0'))
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
