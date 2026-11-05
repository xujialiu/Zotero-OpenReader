// system-voice-refresh 03: identity of the installed build beyond its version (#241 item 1).
// startup(): every step ok, failed empty. Bundle SHA-256 + mechanism markers from the
// installed files. WebDAV folder:false confirmed again after the install.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const ID = 'zotero-tts@xujialiu.top';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    const profDir = Services.dirsvc.get('ProfD', Ci.nsIFile).path;
    const joinWin = (...parts) => parts.join('\\');
    const extDir = joinWin(profDir, 'extensions', ID);
    const candidates = [
      joinWin(extDir, 'content', 'zotero-tts.js'),
      joinWin(profDir, 'extensions', ID + '.xpi'),
    ];
    let bundle = null;
    for (const path of candidates) {
      try {
        const exists = await IOUtils.exists(path);
        if (!exists) continue;
        const bytes = await IOUtils.read(path);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
        const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4_000_000)));
        bundle = {
          path,
          kind: path.endsWith('.xpi') ? 'xpi-file' : 'unpacked-content',
          bytes: bytes.length,
          sha256: hex,
          markerRefresh: (text.match(/refreshing the installed voice list/g) || []).length,
          markerRequest: (text.match(/requestVoiceListRefresh/g) || []).length,
        };
        break;
      } catch (e) { /* next candidate */ }
    }
    // Manifest version, from the same install location
    let manifestVersion = null;
    try {
      const manifestPath = joinWin(extDir, 'manifest.json');
      if (await IOUtils.exists(manifestPath)) manifestVersion = JSON.parse(await IOUtils.readUTF8(manifestPath)).version;
    } catch (e) { /* informational */ }
    // An XPI-file install keeps the markers compressed: read the inner bundle
    // through a jar channel and hash + grep that instead.
    if (bundle && bundle.kind === 'xpi-file') {
      try {
        const f = new (Components.Constructor('@mozilla.org/file/local;1', 'nsIFile', 'initWithPath'))(bundle.path);
        const jarUri = Services.io.newURI('jar:' + Services.io.newFileURI(f).spec + '!/content/zotero-tts.js');
        const channel = Services.io.newChannelFromURI(jarUri, null, Services.scriptSecurityManager.getSystemPrincipal(), null, Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL, Ci.nsIContentPolicy.TYPE_OTHER);
        const inp = channel.open();
        const bstream = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
        bstream.setInputStream(inp);
        let binary = '';
        for (;;) {
          const avail = inp.available();
          if (!avail) break;
          binary += bstream.readBytes(avail);
        }
        bstream.close();
        const bytes8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes8[i] = binary.charCodeAt(i) & 0xff;
        const digest = await crypto.subtle.digest('SHA-256', bytes8);
        const text = new TextDecoder().decode(bytes8);
        bundle.inner = {
          bytes: bytes8.length,
          sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
          markerRefresh: (text.match(/refreshing the installed voice list/g) || []).length,
          markerRequest: (text.match(/requestVoiceListRefresh/g) || []).length,
        };
      } catch (e) { bundle.innerError = String(e); }
    }
    await sleep(500);
    const posSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    state.startup = startup;
    state.bundle = bundle;
    const failed = Array.isArray(startup.failed) ? startup.failed : null;
    const stepsOk = Array.isArray(startup.steps) ? startup.steps.every((s) => s.ok) : null;
    return JSON.stringify({
      version: startup.version,
      steps: Array.isArray(startup.steps) ? startup.steps.map((s) => ({ name: s.name, ok: s.ok })) : null,
      stepsOk, failed,
      bundle,
      manifestVersion,
      folderAfterInstall: posSync.folder,
      identityOk: !!(stepsOk && failed && failed.length === 0 && bundle &&
        (bundle.inner ? bundle.inner.markerRefresh >= 1 && bundle.inner.markerRequest >= 1 : bundle.markerRefresh >= 1)),
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
