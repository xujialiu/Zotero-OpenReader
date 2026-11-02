// Item 2 (narrowed): the Player's Replacements button in the three layouts.
// Switches the layout the way the settings pane's own controls do
// (pluginPlayer.setLayout), measures the button against the case's geometry
// per layout, and saves a screenshot of the Player region for each. The
// baseline layout ('top', the pref's default) is restored at the end of the
// script; cleanup clears the layout pref whole. params: none.
// state: reads fixture; writes layouts (the measurements).
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader._internalReader;
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const outDir = '/Users/xujialiu/orca/workspaces/Zotero-TTS/issues237/.tmp/zotero-dev/replacements';
  await IOUtils.makeDirectory(outDir, { ignoreExisting: true, createAncestors: true });
  const pp = safe(() => Components.utils.waiveXrays(Zotero.ZoteroTTS).pluginPlayer);
  out.hasSetLayout = !!pp && typeof pp.setLayout === 'function';
  // the Player must be mounted: the fixture session is active+paused
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
    const kids = safe(() => controls ? Array.from(controls.children).map(c => c.className.split(' ')[0]) : null);
    return {
      variant: safe(() => new URLSearchParams(frameWinSearch()).get('variant')),
      replacementsTitle: safe(() => reps?.title),
      replacementsBeforeLayoutMenu: safe(() => { if (!controls) return null; const kidsEls = Array.from(controls.children); const i = kidsEls.indexOf(reps); const j = kidsEls.indexOf(menu); return { indexOfReplacements: i, indexOfLayoutMenu: j }; }),
      geometry: {
        player: box(player), replacements: box(reps), layoutMenu: box(menu), status: box(status),
        gapRightOfReplacementsToLeftOfMenu: reps && menu ? +(menu.getBoundingClientRect().left - reps.getBoundingClientRect().right).toFixed(1) : null,
        replacementsLeftMinusPlayerLeft: reps && player ? +(reps.getBoundingClientRect().left - player.getBoundingClientRect().left).toFixed(1) : null,
        statusHidden: safe(() => status?.hidden),
      },
      statusCss: safe(() => { const cw = Components.utils.waiveXrays(doc.defaultView); const st = q('.status-button'); if (!st) return null; const cs = cw.getComputedStyle(st); return { position: cs.position, right: cs.right }; }),
    };
  };
  const frameWinSearch = () => safe(() => reader._iframeWindow.document.getElementById('ztts-player-frame').src) ?? '';
  const snapPlayer = async (filename) => {
    const playerEl = safe(() => frameDoc().querySelector('.player'));
    const frameEl = safe(() => reader._iframeWindow.frameElement);
    if (!playerEl || !frameEl) return null;
    const fr = frameEl.getBoundingClientRect();
    const pr = playerEl.getBoundingClientRect();
    const fw = Components.utils.waiveXrays(win);
    // the player's rect in host-window coordinates: the frame element's box plus the player's offset inside it
    const domRect = new fw.DOMRect(fr.left + pr.left - 4, fr.top + pr.top - 4, Math.min(fw.innerWidth - (fr.left + pr.left) + 4, pr.width + 24), pr.height + 16);
    const snapshot = await fw.browsingContext.currentWindowGlobal.drawSnapshot(domRect, 2, 'rgb(255,255,255)');
    const canvas = new fw.OffscreenCanvas(domRect.width * 2, domRect.height * 2);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(snapshot, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = await blob.arrayBuffer();
    const path = outDir + '/' + filename;
    await IOUtils.write(path, new Uint8Array(buf));
    return path;
  };
  out.layouts = {};
  for (const layout of ['top', 'A', 'B']) {
    try { await Promise.resolve(pp.setLayout(layout)); } catch (e) { out.layouts[layout] = { setLayoutError: String(e) }; continue; }
    await new Promise((r) => setTimeout(r, 700));
    const m = measure();
    const shot = await snapPlayer('replacements-player-' + (layout === 'A' ? 'bottom-bar' : layout === 'B' ? 'floating-panel' : 'top-bar') + '.png');
    out.layouts[layout] = { ...m, screenshot: shot };
  }
  // restore the default layout
  try { await Promise.resolve(pp.setLayout('top')); } catch (e) { out.restoreError = String(e); }
  await new Promise((r) => setTimeout(r, 500));
  out.layoutPrefNow = safe(() => Zotero.Prefs.get('zotero-tts.readAloud.playerLayout', true));
  state.layouts = out.layouts;
  return JSON.stringify(out, null, 1);
})()
