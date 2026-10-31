// Right after zotero_plugin_install, before anything else is driven (case item 1):
// startup() first (synchronous; every step ok, failed empty), then the installed
// bundle's SHA-256 against the build under test (never the version alone), two
// source markers in that bundle (one that must be there, one that must be gone),
// the add-on's version, the WebDAV folder still off, and the owner's saved
// position against what 02 recorded before the session closed.
// params: expectedBundle (sha256), expectedXpi (sha256, optional), expectedVersion, ownerItemID,
//   marker (text the bundle must hold; default 'function rangeSpells', 1.16.16-beta5),
//   absentMarker (text it must not hold; default 'function segmentTextOf', which beta4 held;
//   '' skips the check).
// state: reads owner, webdav.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'install-identity' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sha256Hex = (bytes) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };

  // 1. startup(), before anything else. Poll while the report is still being built.
  let startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  for (let i = 0; i < 40 && !Array.isArray(startup.steps); i++) { await sleep(250); startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); }
  const steps = (startup.steps || []).map((s) => (typeof s === 'string' ? { name: s } : s));
  out.startup = { version: startup.version, stepCount: steps.length, failed: startup.failed, notOk: steps.filter((s) => s.ok === false || s.status === 'failed').map((s) => s.name) };
  out.startupOk = Array.isArray(startup.steps) && Array.isArray(startup.failed) && startup.failed.length === 0 && startup.version === p.expectedVersion;

  // 2. The installed bundle.
  const xpi = Zotero.Profile.dir + '/extensions/zotero-tts@xujialiu.top.xpi';
  out.xpiSha256 = sha256Hex(new Uint8Array(await IOUtils.read(xpi)));
  out.xpiMatches = p.expectedXpi ? out.xpiSha256 === p.expectedXpi : null;
  const zr = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
  zr.open(Zotero.File.pathToFile(xpi));
  const tmp = PathUtils.join(Zotero.getTempDirectory().path, 'ztts209-after.js');
  zr.extract('content/zotero-tts.js', Zotero.File.pathToFile(tmp));
  zr.close();
  const bytes = new Uint8Array(await IOUtils.read(tmp));
  await IOUtils.remove(tmp);
  out.bundleSha256 = sha256Hex(bytes);
  out.bundleBytes = bytes.byteLength;
  out.bundleMatches = out.bundleSha256 === p.expectedBundle;
  const bundleText = new TextDecoder().decode(bytes);
  const marker = p.marker ?? 'function rangeSpells';
  const absentMarker = p.absentMarker ?? 'function segmentTextOf';
  out.marker = { text: marker, found: bundleText.includes(marker) };
  out.absentMarker = absentMarker ? { text: absentMarker, found: bundleText.includes(absentMarker) } : null;
  const AM = (typeof AddonManager !== 'undefined' && AddonManager.getAddonByID) ? AddonManager : ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.addon = { version: addon?.version ?? null, active: addon?.isActive ?? null };

  // 3. The WebDAV folder after the install (an upgrade may turn it on).
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.folder = sync.folder;
  out.webdavPref = { value: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.webdav.enabled', false), user: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled') };

  // 4. The owner's saved position and session after the install, against 02's record.
  const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const row = (pos.readers || []).find((r) => r.itemID === p.ownerItemID) ?? null;
  const before = state.owner?.before?.position?.row ?? null;
  out.owner = {
    readerOpen: !!row, active: row?.active ?? null, stored: row?.stored ?? null,
    storedBefore: before?.stored ?? null,
    storedSame: !!row && !!before && JSON.stringify(row.stored) === JSON.stringify(before.stored),
    zoteroPersistedSame: !!row && !!before && JSON.stringify(row.zoteroPersisted) === JSON.stringify(before.zoteroPersisted),
    rows: pos.database?.rows ?? null,
  };
  const dv = JSON.parse(Zotero.ZoteroTTS.diagnostics.documentVoices());
  out.owner.documentVoice = (dv.readers || []).find((r) => r.key === 'user/' + Zotero.Items.get(p.ownerItemID).key) ?? null;

  out.ok = out.startupOk && out.bundleMatches && out.marker.found && (!out.absentMarker || !out.absentMarker.found) && out.addon.version === p.expectedVersion && out.folder === false
    && out.owner.readerOpen && out.owner.active === false && out.owner.storedSame;
  return JSON.stringify(out, null, 1);
})()
