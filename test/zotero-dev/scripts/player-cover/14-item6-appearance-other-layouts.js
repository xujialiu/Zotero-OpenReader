// Item 6 (#164), every other state: with the Bottom bar, with the Floating
// panel, and with the player closed, the Appearance popup's top is back at
// 38 (Zotero's own top:38px) and #ztts-player-style holds no
// .appearance-popup rule. The frame's computed z-index is 35 in every
// layout. EPUB only: the rule is the same for every document. Trusted
// Shift+P cycles the layout (focus the player between A and B, the reader
// otherwise); popup raised and closed with #appearance.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: r2(b.top), bottom: r2(b.bottom), left: r2(b.left), right: r2(b.right), width: r2(b.width) }; };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const itemID = state.fixtures.epub.itemID;
  let reader = null;
  for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
  if (!reader) throw new Error('reader not found for epub');
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(200);
  const win = reader._iframeWindow, doc = win.document, ir = reader._internalReader;
  const m = ir._readAloudManager;
  const frameEl = () => doc.querySelector('#ztts-player-frame');
  const layoutNow = () => frameEl()?.getAttribute('data-layout') || null;
  const styleRules = () => { const s = doc.querySelector('#ztts-player-style'); return s && s.sheet ? Array.from(s.sheet.cssRules).map((r) => r.cssText) : null; };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const trustedShiftP = () => {
    const w = reader._iframeWindow;
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(w);
    const ev = () => new w.KeyboardEvent('', { key: 'P', code: 'KeyP', keyCode: 80, bubbles: true, cancelable: true, shiftKey: true });
    try {
      tip.keydown(new w.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const down = tip.keydown(ev()), up = tip.keyup(ev());
      tip.keyup(new w.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { down, up };
    } finally { tip.endInputTransaction?.(); }
  };
  const focusReader = async () => { try { reader.focus?.(); } catch (e) {} try { reader._iframeWindow?.focus?.(); } catch (e) {} try { host.focus?.(); } catch (e) {} await sleep(140); };
  const focusPlayer = async () => { const f = frameEl(); try { f?.contentDocument?.querySelector('.options-toggle')?.focus?.(); } catch (e) {} try { f?.contentWindow?.focus?.(); } catch (e) {} try { host.focus?.(); } catch (e) {} await sleep(140); };
  const cycleTo = async (target) => {
    for (let i = 0; i < 4; i++) {
      const cur = layoutNow();
      if (cur === target) break;
      if (cur === 'A') await focusPlayer(); else await focusReader();
      trustedShiftP();
      const changed = await wait(() => layoutNow() !== cur && Services.prefs.getStringPref(layoutPref, '') === layoutNow() ? true : null, 8000);
      if (!changed) throw new Error('Shift+P did not move the layout from ' + cur + ' toward ' + target);
      await sleep(150);
    }
    if (layoutNow() !== target) throw new Error('layout never reached ' + target + ' (now ' + layoutNow() + ')');
  };
  const openPlayer = async () => {
    // A previous kit script may have left the popup open: the toggle would
    // then CLOSE it -- ensure a closed start.
    const f0 = frameEl();
    if (f0 && !f0.hidden) {
      doc.getElementById('ztts-player-toggle').click();
      await wait(() => !m?.active && (!frameEl() || frameEl().hidden) ? true : null, 8000);
      await sleep(200);
    }
    doc.getElementById('ztts-player-toggle').click();
    const a = await wait(() => m?.active ? true : null, 8000);
    if (!a) throw new Error('manager did not activate on open');
    if (!m.paused) { try { m.pause(); } catch (e) {} }
    await wait(() => m.paused ? true : null, 3000);
    const mo = await wait(() => { const f = frameEl(); return f && !f.hidden && f.contentDocument?.querySelector('.player') ? true : null; }, 8000);
    if (!mo) throw new Error('player did not mount on open');
    await sleep(200);
  };
  const closePlayer = async () => {
    doc.getElementById('ztts-player-toggle').click();
    const c = await wait(() => { const f = frameEl(); return (!f || f.hidden) && !m?.active ? true : null; }, 8000);
    if (!c) throw new Error('player did not close');
    await sleep(150);
  };
  const appearanceState = async (label, o) => {
    doc.querySelector('#appearance').click();
    const p = await wait(() => doc.querySelector('.appearance-popup'), 3000);
    if (!p) throw new Error('appearance popup did not open (' + label + ')');
    await sleep(400);
    o[label] = {
      popupTop: box(p).top,
      toolbarBottom: box(doc.querySelector('.toolbar')).bottom,
      appearanceRules: (styleRules() || []).filter((t) => t.includes('.appearance-popup')),
      ruleCount: (styleRules() || []).length,
    };
    doc.querySelector('#appearance').click();
    const c = await wait(() => !doc.querySelector('.appearance-popup') || null, 2500);
    if (!c) throw new Error('appearance popup did not close (' + label + ')');
    await sleep(150);
  };

  const out = {};
  try {
    await openPlayer();
    await cycleTo('top');
    out.top = { z: win.getComputedStyle(frameEl()).zIndex };
    await cycleTo('A');
    out.bottom = { z: win.getComputedStyle(frameEl()).zIndex, layout: layoutNow() };
    await appearanceState('bottomBar', out.bottom);
    await cycleTo('B');
    out.floating = { z: win.getComputedStyle(frameEl()).zIndex, layout: layoutNow() };
    await appearanceState('floating', out.floating);
    await cycleTo('top');
    await closePlayer();
    out.closed = {};
    await appearanceState('playerClosed', out.closed);
  } finally {
    try { if (doc.querySelector('.appearance-popup')) { doc.querySelector('#appearance').click(); await sleep(300); } } catch (e) {}
    try { if (frameEl() && !frameEl().hidden) await closePlayer(); } catch (e) {}
  }
  return JSON.stringify(out, null, 1);
})();
