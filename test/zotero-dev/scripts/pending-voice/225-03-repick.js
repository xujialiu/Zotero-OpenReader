// Issue #225 item 3.1: a pick during a pending switch gives way quietly.
// Reading on R, pick C, then D before C takes over: `player.voice` D, the
// notice reads "Reading voice: R" / "Preparing voice: D", and no called-off
// notice appears in between. Ends with D taking over (bounded, then paused).
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const PV = Zotero.ZoteroTTSRun.state.pv225 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    if (!PV.A) throw new Error('run 225-01 first');
    const manager = wu(reader._internalReader._readAloudManager);
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const doc = wu(reader._iframeWindow.document);
    const noticeState = () => { const el = doc.getElementById('ztts-voice-notice'); return el ? { text: el.textContent, opacity: el.style.opacity } : null; };
    const frame = wu(reader._iframeWindow.document.getElementById('ztts-player-frame'));
    const fdoc = wu(wu(frame.contentWindow).document);
    const labelOf = (id) => { const all = manager.allVoices ?? []; for (let i = 0; i < all.length; i++) if (String(all[i]?.id) === id) return String(all[i].label ?? all[i].id); return id; };

    // Reading on R (A or whoever reads after the last item); resume if needed.
    if (!manager.active || manager.paused) {
      try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
      fdoc.querySelector('.play').click();
      let playing = false;
      for (let t = 0; t < 8000; t += 120) { await sleep(120); if (manager.active && !manager.paused) { playing = true; break; } }
      if (!playing) throw new Error('the reading did not resume');
    }
    manager.skipBack('sentence'); // a full sentence ahead of the picks
    await sleep(700);
    const R = { id: vs().selected, label: labelOf(vs().selected) };
    if (R.id.indexOf('::') < 0) throw new Error('not reading on a plugin-provider voice: ' + R.id);
    out.checks.readingOn = R;

    // The rows after R's own: C next, D after C.
    const btn = fdoc.querySelector('[data-pick="voice"]');
    btn.click();
    let pop = null;
    for (let t = 0; t < 1500 && !pop; t += 40) { await sleep(40); pop = fdoc.querySelector('.popover'); }
    if (!pop) throw new Error('the voice menu did not open');
    const rows = fdoc.querySelectorAll('.popover .option');
    const titles = [];
    let cTitle = null, dTitle = null;
    for (let i = 0; i < rows.length; i++) {
      const t = String(rows[i].getAttribute('title') ?? '');
      titles.push(t);
      if (t === R.label) { cTitle = i + 1 < rows.length ? String(rows[i + 1].getAttribute('title') ?? '') : null; dTitle = i + 2 < rows.length ? String(rows[i + 2].getAttribute('title') ?? '') : null; }
    }
    out.checks.rows = { cRow: cTitle, dRow: dTitle };
    if (!cTitle || !dTitle) throw new Error('not enough rows after R for C and D');
    const idOf = (label) => { const all = manager.allVoices ?? []; for (let i = 0; i < all.length; i++) if (String(all[i].label ?? all[i].id) === label) return String(all[i].id); return null; };
    const C = { label: cTitle, id: idOf(cTitle) }, D = { label: dTitle, id: idOf(dTitle) };
    const clickRow = (title) => { const rs = fdoc.querySelectorAll('.popover .option'); for (let i = 0; i < rs.length; i++) if (String(rs[i].getAttribute('title') ?? '') === title) { rs[i].click(); return true; } return false; };

    // Pick C, then D while C is still only pending.
    clickRow(cTitle);
    let cPending = null;
    for (let t = 0; t < 2500 && !cPending; t += 25) { await sleep(25); const v = vs(); if (v.handoff?.pending === C.id && v.selected === R.id) cPending = { atMs: t }; }
    out.checks.cPending = cPending;
    if (!cPending) throw new Error('no pending state for C observed');
    btn.click(); // reopen the menu (the pick closed it)
    let pop2 = null;
    for (let t = 0; t < 1500 && !pop2; t += 40) { await sleep(40); pop2 = fdoc.querySelector('.popover'); }
    if (!pop2) throw new Error('the voice menu did not reopen');
    clickRow(dTitle);
    const t0 = Date.now();
    let dTick = null, calledOffSeen = false, noticeTexts = [];
    for (let t = 0; t < 25000; t += 40) {
      await sleep(40);
      const v = vs();
      const n = noticeState();
      if (n && n.text && noticeTexts[noticeTexts.length - 1] !== n.text) noticeTexts.push(n.text);
      if ((v.handoff?.notice ?? null) === 'called-off') calledOffSeen = true;
      if (v.handoff?.pending === D.id && v.player?.voice === D.id && v.selected === R.id && !dTick) {
        dTick = { atMs: Date.now() - t0, selected: v.selected, playerVoice: v.player.voice, pending: v.handoff.pending, notice: n };
      }
      if (v.selected === D.id && v.handoff?.pending !== D.id) { out.checks.takeover = { atMs: Date.now() - t0, selected: v.selected, pending: v.handoff?.pending ?? null, noticeKind: v.handoff?.notice ?? null }; break; }
    }
    out.checks.dPending = dTick;
    out.checks.noticeTexts = noticeTexts.slice(0, 6);
    out.checks.calledOffSeen = calledOffSeen;
    await sleep(400);
    fdoc.querySelector('.play').click(); // bounded: pause
    for (let t = 0; t < 4000; t += 100) { await sleep(100); if (manager.paused) break; }
    out.checks.pausedAtEnd = manager.paused;
    const wantText = 'Reading voice: ' + R.label + '\nPreparing voice: ' + D.label;
    out.status = dTick && out.checks.takeover && out.checks.takeover.selected === D.id
      && dTick.notice?.text === wantText && dTick.notice?.opacity === '1'
      && !calledOffSeen && noticeTexts.every((t) => t.indexOf('called off') < 0)
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
