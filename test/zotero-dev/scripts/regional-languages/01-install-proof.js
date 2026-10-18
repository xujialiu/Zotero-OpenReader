// 01-install-proof.js — after zotero_plugin_install: diagnostics.startup()
// every step ok, the profile's INSTALLED bundle carries the #223 markers
// (`for the provider pick`, `zoteroKeepsRegion`), and the WebDAV folder is
// still off (an upgrade may turn it on).
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  out.startup = safe(() => JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()));
  out.allOk = !!out.startup?.failed && out.startup.failed.length === 0
    && (out.startup.steps ?? []).every(s => s.ok);

  // The installed bundle, read from the profile's installed XPI through the
  // jar: URI the running addon is served from — never the version string.
  try {
    const profD = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
    const xpi = profD.path + '/extensions/zotero-tts@xujialiu.top.xpi';
    const jarURI = 'jar:file://' + xpi.split('/').map(encodeURIComponent).join('/').replace('%3A', ':') + '!/';
    out.xpiPath = xpi;
    const text = await (await fetch(jarURI + 'content/zotero-tts.js')).text();
    try { out.version = JSON.parse(await (await fetch(jarURI + 'manifest.json')).text()).version; } catch (e) { out.version = null; }
    out.bundle = {
      size: text.length,
      providerPick: text.includes('for the provider pick'),
      zoteroKeepsRegion: text.includes('zoteroKeepsRegion'),
      stagedExact: text.includes('staged an exact'),
    };
  } catch (e) { out.bundleError = String(e); }

  // Folder still off after the install.
  const ps = safe(() => JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()));
  out.positionSync = ps ? { folder: ps.folder, enabled: ps.enabled } : null;
  state.installed = { version: out.version, markers: out.bundle ?? null, path: out.xpiPath ?? null };
  out.ok = out.allOk && out.bundle?.providerPick && out.bundle?.zoteroKeepsRegion && ps?.folder === false;
  return JSON.stringify(out);
})();
