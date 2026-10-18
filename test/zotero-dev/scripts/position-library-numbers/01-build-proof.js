// Build proof + post-install re-isolation: hash the INSTALLED bundle, count
// the #187 marker, re-check the test destination and the three suspended
// switches (an upgrade may poke them), and settle whatever the upgrade
// stirred. No URL value or credential returns.
(async () => {
  const out = { step: 'build-proof' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get(full(k), true);
  const set = (k, v) => Zotero.Prefs.set(full(k), v, true);
  try {
    const am = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await am.AddonManager.getAddonByID('zotero-tts@xujialiu.top');
    const uri = addon?.getResourceURI ? addon.getResourceURI('content/zotero-tts.js') : null;
    if (!uri) throw new Error('addon URI unavailable');
    const r = await fetch(uri.spec, { cache: 'no-store' });
    const text = await r.text();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest({ name: 'SHA-256' }, bytes);
    out.bundleSha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    out.bundleBytes = bytes.length;
    out.addonVersion = addon.version ?? null;
    out.marker = (text.match(/under this computer's library number/g) || []).length;
    // Post-install re-isolation: an upgrade may turn a switch on.
    for (const k of ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings']) if (get(k) !== false) set(k, false);
    const trimSlash = (v) => { let o = String(v); while (o.endsWith('/')) o = o.slice(0, -1); return o; };
    out.checks = {
      urlStillTest: trimSlash(String(get('webdav.url') ?? '')) === trimSlash(Zotero.ZoteroTTSRun.state.testUrl),
      folderEnabled: get('webdav.enabled'),
      switches: { syncPositions: get('webdav.syncPositions'), syncSettings: get('webdav.syncSettings'), autoUploadSettings: get('webdav.autoUploadSettings') },
      volume: get('readAloud.volume'),
    };
    await Zotero.Promise.delay(1500);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.afterInstall = {
      folder: pos.folder, enabled: pos.enabled, configured: pos.configured,
      positionsQuiet: !pos.transport?.running, sharedQuiet: !pos.shared?.transport?.running,
      localEntries: pos.localEntries ?? null, databaseRows: position.database?.rows ?? null,
      storeQueued: position.store?.queued ?? null, storeWriting: position.store?.writing ?? null,
      tabHooks: position.tabHooks, captureHooks: position.captureHooks,
      documents: pos.shared?.documents?.documents ?? null, sharedItems: pos.shared?.documents?.items ?? null,
      ownSyncs: pos.transport?.syncs ?? null, sharedSyncs: pos.shared?.transport?.syncs ?? null,
      ownOutcome: pos.transport?.lastOutcome ?? null, sharedOutcome: pos.shared?.transport?.lastOutcome ?? null,
    };
    out.ok = out.checks.urlStillTest && out.checks.folderEnabled === true
      && Object.values(out.checks.switches).every((v) => v === false)
      && out.bundleSha256.startsWith('d2c5d320') && out.marker === 3;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
  }
  return JSON.stringify(out);
})()
