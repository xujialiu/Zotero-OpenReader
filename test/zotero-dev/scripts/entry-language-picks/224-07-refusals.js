// Issue #224 case item 4: with a draft standing and the reading paused, Play is
// refused. 4.1: a trusted Shift+Space is refused with "Choose a voice in the
// player first.", paused stays true, selected keeps the old voice; the Player's
// own Play button is refused the same way. 4.2: the next-sentence KEY (the
// plugin's navigation shortcut, default ArrowRight — the top layout renders no
// skip button) moves the position one sentence, still paused, nothing heard.
// Revised 2026-10-22 (continuation run): trusted keys through nsITextInputProcessor
// on the reader's iframe window (the proven player-following pattern; the prepared
// script clicked [data-navigate], which the top layout does not render), and the
// player frame is reached through contentWindow (contentDocument is null here).
// The reading sat at the document's last sentence where a forward skip has no
// target, so the base is taken two paused sentences back first (skipBack,
// nothing heard, requests flat).
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
    const doc = wu(reader._iframeWindow.document);
    const noticeText = () => { const el = doc.getElementById('ztts-voice-notice'); return el ? { text: el.textContent, opacity: el.style.opacity } : null; };
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document);
    const before = vs();
    out.checks.before = { selected: before.selected, paused: before.paused, draft: before.handoff?.draft ?? null };
    if (!before.handoff?.draft) throw new Error('no draft standing');
    if (!before.paused) throw new Error('the manager is not paused');
    const wantNotice = 'Choose a voice in the player first.';
    const V = before.selected;

    // The main window must be OS-active for trusted input (driving §6).
    const win = Zotero.getMainWindow();
    if (win.windowState === 2) { win.restore(); await sleep(400); }
    win.focus();
    await sleep(350);
    out.checks.osActive = Services.focus.activeWindow === win;

    // Trusted keys on the reader's iframe window (player-following/117 pattern).
    const rw = reader._iframeWindow;
    const press = (key, code, keyCode, shift) => {
      reader.focus?.(); rw.focus?.();
      const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      const ev = (name, nameCode, nameKeyCode, pressed) => new rw.KeyboardEvent('', { key: name, code: nameCode, keyCode: nameKeyCode, bubbles: true, cancelable: true, shiftKey: pressed });
      tip.beginInputTransactionForTests(rw);
      let ret;
      if (shift) ret = { shiftDown: tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), keyDown: tip.keydown(ev(key, code, keyCode, true)), keyUp: tip.keyup(ev(key, code, keyCode, true)), shiftUp: tip.keyup(ev('Shift', 'ShiftLeft', 16, true)) };
      else ret = { keyDown: tip.keydown(ev(key, code, keyCode, false)), keyUp: tip.keyup(ev(key, code, keyCode, false)) };
      if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
      return ret;
    };

    // 4.1: trusted Shift+Space — the smart play key.
    out.checks.shiftSpacePress = press(' ', 'Space', 32, true);
    let shiftNotice = null;
    for (let t = 0; t < 1500; t += 50) {
      await sleep(50);
      const n = noticeText();
      if (n && n.text === wantNotice && n.opacity === '1') { shiftNotice = { atMs: t, ...n }; break; }
    }
    await sleep(150);
    const afterShift = vs();
    out.checks.afterShift = { notice: shiftNotice, paused: afterShift.paused, selected: afterShift.selected };

    // The Player's own Play button: refused with the same notice.
    fdoc.querySelector('.play').click();
    let playNotice = null;
    for (let t = 0; t < 1500; t += 50) {
      await sleep(50);
      const n = noticeText();
      if (n && n.text === wantNotice && n.opacity === '1') { playNotice = { atMs: t, ...n }; break; }
    }
    const afterPlay = vs();
    out.checks.afterPlayButton = { notice: playNotice, paused: afterPlay.paused, selected: afterPlay.selected };

    // 4.2: the next-sentence KEY (default ArrowRight) moves the position one
    // sentence, still paused, nothing heard (no request while paused).
    // From the document's last sentence a forward skip cannot move: step back
    // two paused sentences (the manager's own skip, the same one the key drives).
    manager.skipBack('sentence');
    await sleep(700);
    manager.skipBack('sentence');
    await sleep(700);
    const e1 = await eng();
    out.checks.positionBefore = e1?.session?.position ?? null;
    const requestsBefore = e1?.session?.store?.requests ?? null;
    out.checks.arrowRightPress = press('ArrowRight', 'ArrowRight', 39, false);
    let moved = null;
    for (let t = 0; t < 2500; t += 80) {
      await sleep(80);
      const e = await eng();
      if ((e?.session?.position ?? null) === (out.checks.positionBefore + 1)) { moved = { atMs: t, position: e.session.position, paused: e.session.paused, voice: e.session.voice, requests: e.session.store?.requests ?? null }; break; }
    }
    out.checks.afterSkip = moved;
    out.checks.skipNotice = noticeText();
    // osActive is informational: nsITextInputProcessor delivers without OS focus
    // (both presses above were consumed and took effect); native mouse input is
    // what needs the active window.
    out.status = shiftNotice && playNotice
      && afterShift.paused === true && afterPlay.paused === true
      && afterShift.selected === V && afterPlay.selected === V
      && moved && moved.paused === true && moved.voice === V
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
