// Gate before anything is touched (issues #235, #236): READ-ONLY. The profile still holds the build the
// brief names as the before-state (add-on version, installed bundle SHA-256 and size), the owner's reader is
// open and its session is not playing, Fish Audio is on its free model, and no fixture of an earlier run is
// left. Any failure THROWS, so a group that starts with this script stops before 00-webdav-off changes a
// thing (breaks-and-images/02 gates the same hash, but only after 00 and 01 have moved prefs).
// Reads: the installed xpi (its bundle is extracted to Zotero's temp folder and removed), the add-on record,
// the owner's reader and manager, three prefs by name (fish.model, fish.enabled, readAloud.volume), the
// library for 'ztts209' leftovers. Writes nothing; no credential is read.
// params: ownerItemID, expectedBefore (bundle sha256), expectedBeforeBytes, expectedBeforeVersion,
//   freeFishModel (default 's2.1-pro-free').
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'before-gate' };
  const waive = Components.utils.waiveXrays;
  const P = 'extensions.zotero.zotero-tts.';
  const sha256Hex = (bytes) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };

  // The installed build: the bundle's hash and size, not the version string alone.
  const xpi = Zotero.Profile.dir + '/extensions/zotero-tts@xujialiu.top.xpi';
  const zr = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
  zr.open(Zotero.File.pathToFile(xpi));
  const tmp = PathUtils.join(Zotero.getTempDirectory().path, 'ztts235-before.js');
  zr.extract('content/zotero-tts.js', Zotero.File.pathToFile(tmp));
  zr.close();
  const bytes = new Uint8Array(await IOUtils.read(tmp));
  await IOUtils.remove(tmp);
  const AM = (typeof AddonManager !== 'undefined' && AddonManager.getAddonByID) ? AddonManager : ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.installed = { version: addon?.version ?? null, active: addon?.isActive ?? null, bundleSha256: sha256Hex(bytes), bundleBytes: bytes.byteLength };
  out.expected = { version: p.expectedBeforeVersion ?? null, bundleSha256: p.expectedBefore, bundleBytes: p.expectedBeforeBytes ?? null };

  // The owner's reader: open, and not playing.
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === p.ownerItemID) ?? null;
  const m = reader ? waive(waive(reader._internalReader)._readAloudManager) : null;
  out.owner = { readerOpen: !!reader, active: !!m?.active, paused: !!m?.paused };

  // Fish Audio's model, by name (a model id, not a credential).
  const free = p.freeFishModel || 's2.1-pro-free';
  out.fish = { model: Services.prefs.getStringPref(P + 'fish.model', '(unset)'), free, enabled: Services.prefs.getBoolPref(P + 'fish.enabled', false) };
  out.volume = Services.prefs.getIntPref(P + 'readAloud.volume', -1);

  // Leftover fixtures of an earlier run.
  const s = new Zotero.Search();
  s.libraryID = Zotero.Libraries.userLibraryID;
  s.addCondition('title', 'contains', 'ztts209');
  s.addCondition('includeParentsAndChildren', 'true');
  out.leftoverFixtures = (await s.search()).length;

  const checks = {
    bundleMatches: out.installed.bundleSha256 === p.expectedBefore,
    bytesMatch: p.expectedBeforeBytes == null || out.installed.bundleBytes === p.expectedBeforeBytes,
    versionMatches: p.expectedBeforeVersion == null || out.installed.version === p.expectedBeforeVersion,
    ownerReaderOpen: out.owner.readerOpen,
    ownerNotPlaying: !(out.owner.active && !out.owner.paused),
    fishModelFree: out.fish.model === free,
    noLeftoverFixtures: out.leftoverFixtures === 0,
  };
  out.checks = checks;
  out.ok = Object.values(checks).every(Boolean);
  if (!out.ok) throw new Error('before-gate failed, nothing touched: ' + JSON.stringify({ failed: Object.keys(checks).filter((k) => !checks[k]), installed: out.installed, fish: out.fish, owner: out.owner, leftoverFixtures: out.leftoverFixtures }));
  return JSON.stringify(out, null, 1);
})()
