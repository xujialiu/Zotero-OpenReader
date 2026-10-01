// Item 6 (#164), Top bar: on the EPUB (paginated) the Appearance popup's
// top sits at the frame's bottom + 4 (toolbar bottom + 38; 79 on this
// window), its first two rows (Page Layout 91-113, Columns 125-147)
// hit-test to themselves, and #ztts-player-style holds
// .appearance-popup { margin-top: 41px } (BAR_HEIGHT 34 + 3 overhang + 4
// gap; the 1.16.4-beta build's 34px lay 3 px over the bar and the owner
// turned it down). On the PDF the first row is Reading Mode (91-107) and
// its switch answers itself. The frame's computed z-index is 35. Popup
// raised and closed with the toolbar's #appearance button; player paused
// at once, closed at the end.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: r2(b.top), bottom: r2(b.bottom), left: r2(b.left), right: r2(b.right), width: r2(b.width) }; };
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
    const styleRules = () => { const s = doc.querySelector('#ztts-player-style'); return s && s.sheet ? Array.from(s.sheet.cssRules).map((r) => r.cssText) : null; };
    const openPlayer = async () => {
      // A previous kit script may have left the popup open (11 does by
      // design): the toggle would then CLOSE it -- ensure a closed start.
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
    const openAppearance = async () => {
      doc.querySelector('#appearance').click();
      const p = await wait(() => doc.querySelector('.appearance-popup'), 3000);
      if (!p) throw new Error('appearance popup did not open');
      await sleep(400);
      return p;
    };
    const closeAppearance = async () => {
      doc.querySelector('#appearance').click();
      const c = await wait(() => !doc.querySelector('.appearance-popup') || null, 2500);
      if (!c) throw new Error('appearance popup did not close');
    };
    const o = {};
    try {
      o.flowMode = ir.flowMode;
      // The case numbers are for paginated flow; 08-item4-covered leaves the
      // EPUB in scrolled flow on this run (its own restore read back
      // 'scrolled'), so assert the flow before measuring.
      if (kind === 'epub' && ir.flowMode !== 'paginated') {
        try { await ir._primaryView.setFlowMode('paginated'); } catch (e) { o.flowError = String(e); }
        await sleep(600);
        o.flowModeSet = ir.flowMode;
      }
      await openPlayer();
      const f = frameEl();
      o.frame = { z: win.getComputedStyle(f).zIndex, layout: f.getAttribute('data-layout'), box: box(f) };
      o.toolbar = box(doc.querySelector('.toolbar'));
      const rules = styleRules() || [];
      o.appearanceRules = rules.filter((t) => t.includes('.appearance-popup'));
      o.findRules = rules.filter((t) => t.includes('.find-popup'));
      const p = await openAppearance();
      o.overlayZ = win.getComputedStyle(doc.querySelector('.toolbar-popup-overlay')).zIndex;
      o.popup = box(p);
      const group = p.querySelector('.group');
      const rows = group ? group.querySelectorAll(':scope > .option') : [];
      o.rows = [];
      for (let i = 0; i < Math.min(rows.length, 2); i++) {
        const row = rows[i];
        const buttons = row.querySelectorAll('.split-toggle > button');
        const targets = [];
        if (buttons.length) { for (let j = 0; j < buttons.length; j++) targets.push({ kind: 'button', title: buttons[j].getAttribute('title'), el: buttons[j] }); }
        else {
          const control = row.querySelector('.reading-mode-control') || row.lastElementChild;
          if (control) targets.push({ kind: 'control', title: control.className, el: control });
        }
        const ts = [];
        for (let j = 0; j < targets.length; j++) ts.push({ kind: targets[j].kind, title: targets[j].title, box: box(targets[j].el), hit: hit(targets[j].el) });
        o.rows.push({ label: row.querySelector('label')?.textContent || null, box: box(row), targets: ts });
      }
      await closeAppearance();
    } finally {
      try { if (doc.querySelector('.appearance-popup')) await closeAppearance(); } catch (e) {}
      try { if (frameEl() && !frameEl().hidden) await closePlayer(); } catch (e) {}
    }
    return o;
  };

  out.epub = await runOn('epub');
  out.pdf = await runOn('pdf');
  return JSON.stringify(out, null, 1);
})();
