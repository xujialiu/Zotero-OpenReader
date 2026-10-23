// Run after the tester's zotero_plugin_install: prove the installed build by
// its bundle SHA-256 (never the version alone), startup() all ok including
// 'HTML document compatibility', and the WebDAV folder still off. An upgrade
// may turn the folder on; this is the post-install confirmation.
// params: none. state: reads webdav.
(async () => {
  const out = { step: 'install-identity' };
  const EXPECTED = '7924d92203bde4846fe409368bf2c5ceead4665bdf19ffd728d86d35a55ba199';
  const sha256Hex = (bytes) => {
    const digest = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    digest.init(digest.SHA256);
    digest.update(bytes, bytes.byteLength);
    const raw = digest.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };

  const profileDir = Zotero.Profile.dir;
  const candidates = [
    profileDir + '/extensions/zotero-tts@xujialiu.top/content/zotero-tts.js',
    profileDir + '/extensions/zotero-tts@xujialiu.top.xpi',
  ];
  let bundlePath = null;
  for (const p of candidates) { if (await IOUtils.exists(p)) { bundlePath = p; break; } }
  if (!bundlePath) throw new Error('installed bundle not found under ' + profileDir + '/extensions');
  out.bundlePath = bundlePath.replace(profileDir, '<profile>');
  let sha256 = null;
  if (bundlePath.endsWith('.xpi')) {
    const zr = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
    zr.open(Zotero.File.pathToFile(bundlePath));
    zr.test(null);
    const tmp = PathUtils.join(Zotero.ZoteroTTSRun.params.tmpDir, 'installed-zotero-tts.js');
    await IOUtils.makeDirectory(Zotero.ZoteroTTSRun.params.tmpDir, { ignoreExisting: true, createAncestors: true });
    zr.extract('content/zotero-tts.js', Zotero.File.pathToFile(tmp));
    zr.close();
    sha256 = sha256Hex(new Uint8Array(await IOUtils.read(tmp)));
    await IOUtils.remove(tmp);
  } else {
    sha256 = sha256Hex(new Uint8Array(await IOUtils.read(bundlePath)));
  }
  out.bundleSha256 = sha256;
  out.bundleMatches = sha256 === EXPECTED;

  const AM = (typeof AddonManager !== 'undefined' && AddonManager.getAddonByID) ? AddonManager : ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.addonVersion = addon?.version ?? null;
  out.addonActive = addon?.isActive ?? null;

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const names = (startup.steps || []).map((s) => (typeof s === 'string' ? s : s.name));
  out.startup = {
    version: startup.version,
    stepCount: names.length,
    failed: startup.failed,
    hasHtmlCompatibility: names.some((n) => String(n).includes('HTML document compatibility')),
    steps: names,
  };
  out.startupOk = startup.failed.length === 0;

  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.folderAfterInstall = sync.folder;
  out.ok = out.bundleMatches && out.startupOk && out.startup.hasHtmlCompatibility && sync.folder === false;
  return JSON.stringify(out, null, 1);
})()
