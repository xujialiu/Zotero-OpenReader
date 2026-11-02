// Item 2 (issue #237): the Player's Replacements button in the three
// layouts. Switches the layout the way the settings pane's own controls do
// (pluginPlayer.setLayout), measures the button against the case's geometry
// per layout (Top bar: just before .layout-menu with the bar's 8 px flex
// gap; Floating panel: at the panel's left edge, .status-button right;
// title 'Replacements'), and restores the default layout ('top'). Needs the
// fixture session active (the Player mounted); 04 started it. The window
// and its screenshots are 07's. params: none. state: reads fixture.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const pp = safe(() => Components.utils.waiveXrays(Zotero.ZoteroTTS).pluginPlayer);
  out.hasSetLayout = !!pp && typeof pp.setLayout === 'function';
  const frameDoc = () => safe(() => Components.utils.waiveXrays(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document);
  if (!frameDoc()?.querySelector('.player')) {
    await Promise.resolve(ir.toggleReadAloudPopup(true));
    await new Promise((r) => setTimeout(r, 800));
    const m = safe(() => ir._readAloudManager);
    if (m && m.active && !m.paused) await Promise.resolve(m.pause());
    await new Promise((r) => setTimeout(r, 300));
  }
  out.playerMounted = !!frameDoc()?.querySelector('.player');
  const measure = () => {
    const doc = frameDoc();
    const q = (sel) => safe(() => doc.querySelector(sel));
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1), width: +r.width.toFixed(1) } : null; };
    const player = q('.player');
    const reps = q('.replacements');
    const menu = q('.layout-menu');
    const status = q('.status-button');
    const controls = q('.controls');
    return {
      replacementsTitle: safe(() => reps?.title),
      replacementsAriaLabel: safe(() => reps?.getAttribute('aria-label')),
      inControlsBeforeLayoutMenu: safe(() => {
        if (!controls) return null;
        const kidsEls = Array.from(controls.children);
        const i = kidsEls.indexOf(reps);
        const j = kidsEls.indexOf(menu);
        return { indexOfReplacements: i, indexOfLayoutMenu: j, controlsChildren: kidsEls.map((c) => (c.className || '').split(' ')[0]) };
      }),
      geometry: {
        player: box(player), replacements: box(reps), layoutMenu: box(menu), status: box(status),
        gapRightOfReplacementsToLeftOfMenu: reps && menu ? +(menu.getBoundingClientRect().left - reps.getBoundingClientRect().right).toFixed(1) : null,
        replacementsLeftMinusPlayerLeft: reps && player ? +(reps.getBoundingClientRect().left - player.getBoundingClientRect().left).toFixed(1) : null,
        statusHidden: safe(() => status?.hidden),
        statusRightMinusPlayerRight: status && player ? +(player.getBoundingClientRect().right - status.getBoundingClientRect().right).toFixed(1) : null,
      },
    };
  };
  out.layouts = {};
  for (const layout of ['top', 'A', 'B']) {
    try { await Promise.resolve(pp.setLayout(layout)); } catch (e) { out.layouts[layout] = { setLayoutError: String(e) }; continue; }
    await new Promise((r) => setTimeout(r, 700));
    out.layouts[layout === 'A' ? 'bottomBar' : layout === 'B' ? 'floatingPanel' : 'topBar'] = measure();
  }
  try { await Promise.resolve(pp.setLayout('top')); } catch (e) { out.restoreError = String(e); }
  await new Promise((r) => setTimeout(r, 500));
  out.layoutPrefNow = safe(() => Zotero.Prefs.get('zotero-tts.readAloud.playerLayout', true));
  return JSON.stringify(out, null, 1);
})()
