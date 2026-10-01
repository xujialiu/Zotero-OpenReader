// Item 6 (#164), the stacking fallback: with the Top bar on the EPUB
// (paginated), a probe sheet of this run's own sets .find-popup and
// .appearance-popup margin-top to 0. The find bar's search box (top 64)
// and the Page Layout buttons (51-71) then answer themselves although they
// lie over the frame, and Appearance's + opens Zotero's new-theme dialog,
// whose name field and Cancel answer themselves. The sheet is removed in
// the finally; find bar, dialog, popup and player are closed.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: r2(b.top), bottom: r2(b.bottom), left: r2(b.left), right: r2(b.right), width: r2(b.width) }; };
  const nameOf = (el) => !el ? null : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const hit = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const at = el.ownerDocument.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return { self: at === el || el.contains(at), at: nameOf(at) }; };
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

  const out = {};
  const probe = doc.createElement('style');
  probe.id = 'ztts-probe-css';
  probe.textContent = '.split-view .primary-view .find-popup { margin-top: 0 !important; }\n.appearance-popup { margin-top: 0 !important; }';
  try {
    await openPlayer();
    await cycleTo('top');
    out.frameZ = win.getComputedStyle(frameEl()).zIndex;
    out.toolbar = box(doc.querySelector('.toolbar'));
    doc.head.append(probe);
    await sleep(150);

    try { ir.toggleFindPopup({ primary: true, open: true }); } catch (e) { out.findError = String(e); }
    const find = await wait(() => doc.querySelector('.find-popup'), 2500);
    if (!find) throw new Error('find popup did not open');
    await sleep(300);
    const input = find.querySelector('input');
    out.find = { popup: box(find), input: box(input), hit: hit(input) };
    try { ir.toggleFindPopup({ primary: true, open: false }); } catch (e) {}
    await wait(() => !doc.querySelector('.find-popup') || null, 2500);

    doc.querySelector('#appearance').click();
    const p = await wait(() => doc.querySelector('.appearance-popup'), 3000);
    if (!p) throw new Error('appearance popup did not open');
    await sleep(400);
    out.appearance = { popup: box(p) };
    const group = p.querySelector('.group');
    const rows = group ? group.querySelectorAll(':scope > .option') : [];
    out.pageLayoutRow = { label: rows[0]?.querySelector('label')?.textContent || null, box: rows[0] ? box(rows[0]) : null };
    const buttons = rows[0] ? rows[0].querySelectorAll('.split-toggle > button') : [];
    out.pageLayoutButtons = [];
    for (let j = 0; j < buttons.length; j++) out.pageLayoutButtons.push({ title: buttons[j].getAttribute('title'), box: box(buttons[j]), hit: hit(buttons[j]) });

    p.querySelector('.theme.add').click();
    const dialog = await wait(() => doc.querySelector('.theme-popup'), 3000);
    out.appearanceStillOpen = !!doc.querySelector('.appearance-popup');
    if (dialog) {
      await sleep(300);
      out.theme = {
        nameField: hit(dialog.querySelector('input[type="text"]')),
        cancel: hit(dialog.querySelectorAll('.row.buttons button')[0]),
      };
      dialog.querySelectorAll('.row.buttons button')[0].click();
      out.dialogClosed = !!(await wait(() => !doc.querySelector('.theme-popup') || null, 2500));
    }
    if (doc.querySelector('.appearance-popup')) {
      doc.querySelector('#appearance').click();
      await wait(() => !doc.querySelector('.appearance-popup') || null, 2500);
    }
    out.probeStillThere = !!doc.querySelector('#ztts-probe-css');
  } finally {
    try { probe.remove(); } catch (e) {}
    try { if (doc.querySelector('.find-popup')) { ir.toggleFindPopup({ primary: true, open: false }); } } catch (e) {}
    try { if (doc.querySelector('.theme-popup')) { const b = doc.querySelector('.theme-popup')?.querySelectorAll('.row.buttons button')[0]; b?.click(); } } catch (e) {}
    try { if (doc.querySelector('.appearance-popup')) { doc.querySelector('#appearance').click(); } } catch (e) {}
    await sleep(300);
    try { if (frameEl() && !frameEl().hidden) await closePlayer(); } catch (e) {}
  }
  return JSON.stringify(out, null, 1);
})();
