// Issue #238, right after the in-place install: which build is this, is the
// WebDAV folder still off, and what became of the owner's paused tab. The
// build is proved beyond its version string: the SHA-256 of the installed
// bundle (read through the add-on's own resource URI) and of the installed
// xpi file in the profile, and a count of `clearFailures` in the bundle. The
// owner's tab is only READ: manager state, the Engine's entry, and whether
// its controller (rebuilt by the new instance's adopt path, engine item 24)
// carries clearFailures. Nothing is played, paused or picked.
// params: expectBundleSha, expectXpiSha (hex), ownerTabID. state: reads
// owner238, baseline238; writes build238, ownerAfter238.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const mask = (v) => String(v ?? '').replace(/[0-9a-f]{32}/gi, (h) => h.slice(0, 4) + '…' + h.slice(-4));
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (bytes) => {
    if (typeof crypto !== 'undefined' && crypto.subtle) return hex(await crypto.subtle.digest('SHA-256', bytes));
    const h = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    h.init(h.SHA256); h.update(bytes, bytes.length);
    return Array.from(h.finish(false), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  };
  const out = { step: '238-02-build-identity', at: new Date().toISOString() };

  // --- identity
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID('zotero-tts@xujialiu.top');
  out.addon = { version: addon.version, active: addon.isActive };
  const bundleURI = addon.getResourceURI('content/zotero-tts.js').spec;
  out.bundleURIKind = bundleURI.replace(/^(jar:file:\/\/\/).*?([^/]*\.xpi!.*)$/, '$1…/$2');
  try {
    const buf = await (await fetch(bundleURI)).arrayBuffer();
    out.bundle = { bytes: buf.byteLength, sha256: await sha256(buf) };
    const text = new TextDecoder().decode(buf);
    out.bundle.clearFailuresCount = (text.match(/clearFailures/g) || []).length;
    out.bundle.matchesExpected = P.expectBundleSha ? out.bundle.sha256 === P.expectBundleSha : null;
  } catch (e) { out.bundleErr = String(e); }
  try {
    const xpiFile = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile);
    xpiFile.append('extensions'); xpiFile.append('zotero-tts@xujialiu.top.xpi');
    out.xpi = { exists: xpiFile.exists() };
    if (out.xpi.exists) {
      const bytes = await IOUtils.read(xpiFile.path);
      out.xpi.bytes = bytes.byteLength;
      out.xpi.sha256 = await sha256(bytes);
      out.xpi.matchesExpected = P.expectXpiSha ? out.xpi.sha256 === P.expectXpiSha : null;
    }
  } catch (e) { out.xpiErr = String(e); }

  // --- WebDAV folder, after the install (an upgrade may turn it on)
  const b = S.baseline238;
  out.webdav = { pref: Zotero.Prefs.get('zotero-tts.webdav.enabled'), hasUser: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled'), baselineEnabled: b && b.webdav.value, baselineHasUser: b && b.webdav.user };
  try { out.webdav.positionSyncFolder = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder; } catch (e) { out.webdav.err = String(e); }
  out.volumeNow = Zotero.Prefs.get('zotero-tts.readAloud.volume');

  // --- the owner's tab (read only)
  const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  out.engineFeature = eng.feature;
  const owner = (S.owner238 || []).find((o) => o.tabID === (P.ownerTabID || 'tab-ZEnh2nCY'));
  S.ownerAfter238 = null;
  if (owner) {
    const r = (Zotero.Reader._readers || []).find((x) => x.tabID === owner.tabID);
    if (!r) out.ownerAfter = { error: 'reader gone' };
    else {
      const ir = r._internalReader;
      const m = ir._readAloudManager;
      const e = eng.readers.find((x) => x.itemID === r.itemID) || {};
      let ctlType = null, ctlHasClearFailures = null;
      try { const c = wu(m._controller); ctlType = typeof c; ctlHasClearFailures = typeof c.clearFailures; } catch (err) { ctlHasClearFailures = 'err ' + err; }
      S.ownerAfter238 = {
        tabID: r.tabID, active: m.active, paused: m.paused, voice: String(m.selectedVoiceID || ''), tier: m.selectedTier, error: m.error || null,
        popupOpen: !!(ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen),
        controller: e.controller, position: e.session && e.session.position, currentIndex: e.session && e.session.currentIndex,
        sessionPaused: e.session && e.session.paused, playing: e.session && e.session.playing, adopted: e.stats && e.stats.adopted,
        requests: e.session && e.session.store && e.session.store.requests, audio: e.audio && e.audio.state, ctlType, clearFailuresType: ctlHasClearFailures,
      };
      const a = S.ownerAfter238;
      out.ownerAfter = { ...a, voice: mask(a.voice) };
      out.ownerBefore = { active: owner.active, paused: owner.paused, voice: mask(owner.voice), position: owner.engine && owner.engine.session && owner.engine.session.position, popupOpen: owner.popupOpen };
      out.ownerUnchanged = a.active === owner.active && a.paused === owner.paused && a.voice === owner.voice && a.popupOpen === owner.popupOpen && a.position === (owner.engine && owner.engine.session && owner.engine.session.position) && a.sessionPaused === true && a.playing === false;
    }
  } else out.ownerAfter = { error: 'owner tab not in baseline' };
  S.build238 = out;
  return JSON.stringify(out, null, 1);
})();
