// Build proof + post-install re-isolation: hash the INSTALLED bundle, count
// the unique new sampler markers of #206 (recordPass / per-reader pass),
// re-check the folder switch and the three suspended switches, and settle
// whatever the upgrade poked. No credential or URL value returns.
(async () => {
  const out = { step: 'build-proof' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const set = (k, v) => Zotero.Prefs.set(full(k), v, true);
  try {
        let addon = null;
    try {
      const am = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      addon = await am.AddonManager.getAddonByID('zotero-tts@xujialiu.top');
    } catch (e) {
      addon = { getResourceURI: () => null, importError: String(e) };
    }
    const uri = addon?.getResourceURI ? addon.getResourceURI('content/zotero-tts.js') : null;
    if (!uri) throw new Error('addon URI unavailable: ' + (addon?.importError || '?'));
    const r = await fetch(uri.spec, { cache: 'no-store' });
    const text = await r.text();
    const alg = { name: 'SHA-256' };
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest(alg, bytes);
    out.bundleSha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    out.bundleBytes = bytes.length;
    out.uriScheme = uri.scheme;
    out.addonVersion = addon.version ?? null;
    // The #206 sampler's own markers, absent from every earlier build.
    out.markers = {
      recordPass: (text.match(/recordPass/g) || []).length,
      perReaderComment: text.includes('Observations belong') || text.includes('each reader, not the shared attachment'),
      freezeWeakSet: (text.match(/closed\.add\(reader\)/g) || []).length,
      siblingSpeaking: (text.match(/siblingSpeaking/g) || []).length,
    };
    // Post-install re-isolation: an upgrade may turn the folder on.
    for (const k of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) if (get(k) !== false) set(k, false);
    out.checks = {
      urlStillTest: get('webdav.url') === Zotero.ZoteroTTSRun.state.testUrl,
      folderEnabled: get('webdav.enabled'),
      switches: {
        syncPositions: get('webdav.syncPositions'),
        syncSettings: get('webdav.syncSettings'),
        autoUploadSettings: get('webdav.autoUploadSettings'),
      },
      volume: get('readAloud.volume'),
    };
    await Zotero.Promise.delay(1200);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.afterInstall = {
      folder: pos.folder, enabled: pos.enabled,
      positionsQuiet: !pos.transport?.running, sharedQuiet: !pos.shared?.transport?.running,
      positionSyncs: pos.transport?.syncs ?? null, sharedSyncs: pos.shared?.transport?.syncs ?? null,
      tabHooks: null,
    };
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.afterInstall.tabHooks = position.tabHooks;
    out.afterInstall.captureHooks = position.captureHooks;
    out.afterInstall.live = position.live;
    out.afterInstall.databaseRows = position.database?.rows ?? null;
    out.afterInstall.documents = pos.shared?.documents ?? null;
    out.ok = out.checks.urlStillTest && out.checks.folderEnabled === true
      && Object.values(out.checks.switches).every((v) => v === false) && out.checks.volume === 0;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
