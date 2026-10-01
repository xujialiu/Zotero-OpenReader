// Item 6 (#164), the player stays over the document: with no popup open,
// elementFromPoint at the frame's center answers the frame for the Top bar
// and the Bottom bar, and for the Floating panel once the panel is moved
// over the open reader sidebar (a drag leaves it there): its left is set
// to 20 px, inside #sidebarContainer (z-index 10, under the frame's 35).
// On the PDF and on the EPUB. Layout cycled with trusted Shift+P.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: r2(b.top), bottom: r2(b.bottom), left: r2(b.left), right: r2(b.right), width: r2(b.width), height: r2(b.height) }; };
  const nameOf = (el) => !el ? null : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const hit = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const at = el.ownerDocument.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return { self: at === el || el.contains(at), at: nameOf(at) }; };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const out = {};

  const runOn = async (kind) => {
    const itemID = state.fixtures[kind].itemID;
    let reader = null;
    for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
    if (!reader) throw new Error('reader not found for ' + kind);
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
    const o = {};
    try {
      await openPlayer();
      await cycleTo('top');
      o.top = { z: win.getComputedStyle(frameEl()).zIndex, frame: box(frameEl()), hit: hit(frameEl()) };
      await cycleTo('A');
      o.bottom = { z: win.getComputedStyle(frameEl()).zIndex, frame: box(frameEl()), hit: hit(frameEl()) };
      await cycleTo('B');
      const f = frameEl();
      const leftBefore = f.style.left;
      f.style.left = '20px';
      await sleep(200);
      const sidebar = box(doc.querySelector('#sidebarContainer'));
      const fb = box(f);
      o.floating = {
        z: win.getComputedStyle(f).zIndex, leftBefore, left: f.style.left, frame: fb, sidebar,
        overSidebar: !!sidebar && fb.left < sidebar.right && fb.right > sidebar.left && fb.top < sidebar.bottom && fb.bottom > sidebar.top,
        hit: hit(f),
      };
      await cycleTo('top');
      await closePlayer();
    } finally {
      try { if (frameEl() && !frameEl().hidden) await closePlayer(); } catch (e) {}
    }
    return o;
  };

  out.pdf = await runOn('pdf');
  out.epub = await runOn('epub');
  return JSON.stringify(out, null, 1);
})();
