// Item 2, screenshots (issue #237): the Player's Replacements button in the
// three layouts. Sets the layout as the settings pane does (pluginPlayer
// .setLayout), snapshots the host window's region where the Player sits, and
// restores the default layout ('top'). Write only under .tmp/zotero-dev/.
(async () => {
  const out = { shots: [] };
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const fw = Components.utils.waiveXrays(win);
  const pp = safe(() => Components.utils.waiveXrays(Zotero.ZoteroTTS).pluginPlayer);
  const outDir = '/Users/xujialiu/orca/workspaces/Zotero-TTS/issues237/.tmp/zotero-dev/replacements';
  await IOUtils.makeDirectory(outDir, { ignoreExisting: true, createAncestors: true });
  const snapRegion = async (filename, region) => {
    const domRect = region === 'top'
      ? new fw.DOMRect(0, 0, fw.innerWidth, fw.innerHeight * 0.45)
      : region === 'bottom'
        ? new fw.DOMRect(0, fw.innerHeight * 0.55, fw.innerWidth, fw.innerHeight * 0.45)
        : new fw.DOMRect(0, 0, fw.innerWidth, fw.innerHeight);
    const snapshot = await fw.browsingContext.currentWindowGlobal.drawSnapshot(domRect, 1.5, 'rgb(255,255,255)');
    const canvas = new fw.OffscreenCanvas(domRect.width * 1.5, domRect.height * 1.5);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(snapshot, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = await blob.arrayBuffer();
    const path = outDir + '/' + filename;
    await IOUtils.write(path, new Uint8Array(buf));
    return path;
  };
  const plan = [
    ['top', 'replacements-player-top-bar.png', 'top'],
    ['A', 'replacements-player-bottom-bar.png', 'bottom'],
    ['B', 'replacements-player-floating-panel.png', 'full'],
  ];
  for (const [layout, filename, region] of plan) {
    await Promise.resolve(pp.setLayout(layout));
    await new Promise((r) => setTimeout(r, 800));
    const doc = safe(() => Components.utils.waiveXrays(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document);
    const found = safe(() => !!doc.querySelector('.replacements'));
    const path = await snapRegion(filename, region);
    out.shots.push({ layout, file: path, buttonFound: found, bytes: safe(() => { const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); try { f.initWithPath(path); return f.exists(); } catch (e) { return 'unknown'; } }) });
  }
  await Promise.resolve(pp.setLayout('top'));
  await new Promise((r) => setTimeout(r, 500));
  out.layoutPrefNow = safe(() => Zotero.Prefs.get('zotero-tts.readAloud.playerLayout', true));
  return JSON.stringify(out, null, 1);
})()
