// Issue #225 items 3.2 + 3.3: a pending switch called off by something other
// than a pick. 3.2: pick B, then the voice that reads (A) — player.voice A at
// once, the notice gone, nothing else said. 3.3: pick B, then change the speed
// (the Player's own speed command) — player.voice A, pending null, and the
// notice "The switch to B was called off." for five seconds. The speed is put
// back afterwards (the recorded session speed; 224-99 restores the pref).
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
    const fw = wu(frame.contentWindow);
    const labelOf = (id) => { const all = manager.allVoices ?? []; for (let i = 0; i < all.length; i++) if (String(all[i]?.id) === id) return String(all[i].label ?? all[i].id); return id; };
    const resume = async () => {
      if (manager.active && !manager.paused) return true;
      try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
      fdoc.querySelector('.play').click();
      for (let t = 0; t < 8000; t += 120) { await sleep(120); if (manager.active && !manager.paused) return true; }
      return false;
    };

    // ---- 3.2: pick B, then A (the voice reading) ----
    if (!(await resume())) throw new Error('the reading did not resume');
    manager.skipBack('sentence');
    await sleep(700);
    const A = { id: vs().selected, label: labelOf(vs().selected) };
    if (A.id.indexOf('::') < 0) throw new Error('not reading on a plugin-provider voice: ' + A.id);
    const btn = fdoc.querySelector('[data-pick="voice"]');
    btn.click();
    let pop = null;
    for (let t = 0; t < 1500 && !pop; t += 40) { await sleep(40); pop = fdoc.querySelector('.popover'); }
    if (!pop) throw new Error('the voice menu did not open');
    const rows = fdoc.querySelectorAll('.popover .option');
    const titles = [];
    let bTitle = null;
    for (let i = 0; i < rows.length; i++) {
      const t = String(rows[i].getAttribute('title') ?? '');
      titles.push(t);
      if (t === A.label && i + 1 < rows.length) bTitle = String(rows[i + 1].getAttribute('title') ?? '');
    }
    out.checks.bRow = bTitle;
    const idOf = (label) => { const all = manager.allVoices ?? []; for (let i = 0; i < all.length; i++) if (String(all[i].label ?? all[i].id) === label) return String(all[i].id); return null; };
    const clickRow = (title) => { const rs = fdoc.querySelectorAll('.popover .option'); for (let i = 0; i < rs.length; i++) if (String(rs[i].getAttribute('title') ?? '') === title) { rs[i].click(); return true; } return false; };
    if (!bTitle) throw new Error('no row after A to pick as B');
    const B = { label: bTitle, id: idOf(bTitle) };
    clickRow(bTitle);
    let pending = null;
    for (let t = 0; t < 2500 && !pending; t += 25) { await sleep(25); const v = vs(); if (v.handoff?.pending === B.id && v.selected === A.id) pending = { atMs: t }; }
    out.checks.pendingB = pending;
    if (!pending) throw new Error('no pending state for B observed');
    // Now pick A — the voice that reads.
    btn.click();
    let pop2 = null;
    for (let t = 0; t < 1500 && !pop2; t += 40) { await sleep(40); pop2 = fdoc.querySelector('.popover'); }
    if (!pop2) throw new Error('the voice menu did not reopen');
    clickRow(A.label);
    let back = null;
    for (let t = 0; t < 2000; t += 40) {
      await sleep(40);
      const v = vs();
      if (v.player?.voice === A.id && v.handoff?.pending === null) { back = { atMs: t, selected: v.selected, playerVoice: v.player.voice, pending: v.handoff.pending, noticeKind: v.handoff?.notice ?? null, el: noticeState() }; break; }
    }
    out.checks.backToA = back;
    await sleep(700);
    out.checks.settled32 = { el: noticeState(), noticeKind: vs().handoff?.notice ?? null, pending: vs().handoff?.pending ?? null, playerVoice: vs().player?.voice ?? null };
    const ok32 = back && back.atMs <= 800 && back.pending === null && back.playerVoice === A.id
      && back.noticeKind !== 'called-off'
      && (!back.el || back.el.opacity !== '1')
      && out.checks.settled32.el?.opacity !== '1';

    // ---- 3.3: pick B, then change the speed ----
    if (!(await resume())) throw new Error('the reading did not resume for 3.3');
    manager.skipBack('sentence');
    await sleep(700);
    const A2 = { id: vs().selected, label: labelOf(vs().selected) };
    btn.click();
    let pop3 = null;
    for (let t = 0; t < 1500 && !pop3; t += 40) { await sleep(40); pop3 = fdoc.querySelector('.popover'); }
    if (!pop3) throw new Error('the voice menu did not open (3.3)');
    const rows3 = fdoc.querySelectorAll('.popover .option');
    let b2Title = null;
    for (let i = 0; i < rows3.length; i++) {
      const t = String(rows3[i].getAttribute('title') ?? '');
      if (t === A2.label && i + 1 < rows3.length) { b2Title = String(rows3[i + 1].getAttribute('title') ?? ''); break; }
    }
    if (!b2Title) throw new Error('no row after A for B (3.3)');
    const B2 = { label: b2Title, id: idOf(b2Title) };
    clickRow(b2Title);
    let pending2 = null;
    for (let t = 0; t < 2500 && !pending2; t += 25) { await sleep(25); const v = vs(); if (v.handoff?.pending === B2.id && v.selected === A2.id) pending2 = { atMs: t }; }
    out.checks.pendingB2 = pending2;
    if (!pending2) throw new Error('no pending state for B (3.3) observed');
    const t0 = Date.now();
    await fw.zttsCommand('speed', 2); // the Player's own speed path (its range input sends this)
    let calledOff = null;
    const wantText = 'The switch to ' + B2.label + ' was called off.';
    for (let t = 0; t < 7000; t += 100) {
      await sleep(100);
      const v = vs();
      const n = noticeState();
      const elapsed = Date.now() - t0;
      if (!calledOff && v.player?.voice === A2.id && v.handoff?.pending === null && n && n.text === wantText && n.opacity === '1') {
        calledOff = { atMs: elapsed, playerVoice: v.player.voice, pending: v.handoff.pending, notice: n };
      }
      if (elapsed >= 3000 && elapsed < 3200) out.checks.atThreeSeconds = { notice: n, pending: v.handoff?.pending ?? null };
      if (elapsed >= 5400) { out.checks.afterFiveSeconds = { notice: n, playerVoice: v.player.voice, pending: v.handoff?.pending ?? null }; break; }
    }
    out.checks.calledOff = calledOff;
    // The speed back to what the session read at.
    await fw.zttsCommand('speed', Number(PV.speed) || 1);
    fdoc.querySelector('.play').click(); // bounded: pause
    for (let t = 0; t < 4000; t += 100) { await sleep(100); if (manager.paused) break; }
    out.checks.pausedAtEnd = manager.paused;
    out.status = ok32 && calledOff && out.checks.atThreeSeconds?.notice?.opacity === '1'
      && out.checks.afterFiveSeconds?.notice?.opacity === '0'
      && out.checks.afterFiveSeconds?.pending === null
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
