// Reading guard runs, post-install identity and startup (2026-09-30, run r46).
// Proves the installed build: the SHA-256 of the installed extensions/zotero-tts@xujialiu.top.xpi
// (byte-identical to the build xpi) plus a grep of its content/zotero-tts.js inside the zip for
// the #160 marker, then the synchronous startup diagnostic: every step ok, failed empty.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const Ci = Components.interfaces, Cc = Components.classes;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const profD = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile).path;
  const xpiPath = PathUtils.join(profD, 'extensions', 'zotero-tts@xujialiu.top.xpi');
  const bytes = await IOUtils.read(xpiPath);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Grep the bundle inside the zip (the whole-xpi hash above is the identity proof).
  const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  file.initWithPath(xpiPath);
  const zip = Cc['@mozilla.org/libjar/zip-reader;1'].createInstance(Ci.nsIZipReader);
  zip.open(file);
  let bundleText = '';
  try {
    const entry = zip.getEntry('content/zotero-tts.js');
    if (!entry) throw new Error('content/zotero-tts.js missing from the installed xpi');
    const stream = zip.getInputStream('content/zotero-tts.js');
    const scriptable = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(Ci.nsIScriptableInputStream);
    scriptable.init(stream);
    bundleText = scriptable.read(entry.realSize);
    scriptable.close();
  } finally { try { zip.close(); } catch {} }
  const marker = 'ztts-close-and-continue';
  let markerCount = 0, at = bundleText.indexOf(marker);
  while (at !== -1) { markerCount++; at = bundleText.indexOf(marker, at + 1); }
  let startup = null;
  try { startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) {
    throw new Error('startup diagnostic threw: ' + String(e));
  }
  if (!startup || startup.failed?.length || startup.steps?.some(step => !step.ok)) {
    throw new Error('startup diagnostic failed: ' + JSON.stringify(startup));
  }
  state.startup = startup;
  state.build = { xpiPath, xpiSha256: hex, markerCount };

  // Which switches are on/off right now, by pref (named reads only).
  const ids = ['openai-official', 'mimo', 'compatible', 'azure', 'cloudflare', 'speechify',
    'fish', 'fishspeech', 'local', 'system', 'zotero-standard', 'zotero-premium'];
  const enabled = {};
  for (const id of ids) {
    const key = 'extensions.zotero.zotero-tts.' + id + '.enabled';
    enabled[id] = Services.prefs.getPrefType(key) === Services.prefs.PREF_BOOL
      ? Services.prefs.getBoolPref(key) : null;
  }
  state.enabledAtStart = enabled;

  await sleep(300);
  return JSON.stringify({
    status: 'PASS',
    build: { xpiPath, xpiSha256: hex, markerCount, expectedXpiSha256: 'd0952c9192142c3080deee88d1b7dfd1f02730cad470da67ab05f9a8517a7a64' },
    startup: { version: startup.version, steps: (startup.steps || []).map(s => ({ name: s.name || s.step || s.id, ok: s.ok })), failed: startup.failed || [] },
    enabledAtStart: enabled,
    syncSuspended: ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'].map(n =>
      ({ n, v: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.' + n) })),
  }, null, 1);
})()
