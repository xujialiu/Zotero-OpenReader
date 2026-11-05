// Build proof + post-install re-isolation: hash the INSTALLED bundle (must be
// the run's build, never proven by the version string), count the #234 source
// needles (quotationEdgesAgree / found.match.ambiguous), re-check the test
// destination and the three suspended switches (an upgrade may poke them),
// and settle whatever the upgrade stirred. No URL value or credential returns.
(async () => {
  const out = { step: 'build-proof' };
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const get = (k) => {
    const t = p.getPrefType(prefix + k);
    try { return t === p.PREF_BOOL ? p.getBoolPref(prefix + k) : t === p.PREF_INT ? p.getIntPref(prefix + k) : p.getStringPref(prefix + k); } catch { return null; }
  };
  const set = (k, v) => {
    const t = typeof v === 'boolean' ? p.PREF_BOOL : typeof v === 'number' ? p.PREF_INT : p.PREF_STRING;
    if (t === p.PREF_BOOL) p.setBoolPref(prefix + k, v); else if (t === p.PREF_INT) p.setIntPref(prefix + k, v); else p.setStringPref(prefix + k, v);
  };
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
    out.needles = {
      quotationEdgesAgree: (text.match(/quotationEdgesAgree/g) || []).length,
      foundMatchAmbiguous: (text.match(/found\.match\.ambiguous/g) || []).length,
    };
    // Post-install re-isolation: an upgrade may turn a switch on.
    set('webdav.enabled', false);
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
      documents: pos.shared?.documents?.documents ?? null, sharedItems: pos.shared?.documents?.items ?? null,
      sharedSyncs: pos.shared?.transport?.syncs ?? null, sharedOutcome: pos.shared?.transport?.lastOutcome ?? null,
      adopted: pos.shared?.transport?.adopted ?? null, uploaded: pos.shared?.transport?.uploaded ?? null,
    };
    const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    out.ok = out.afterInstall.folder === false && out.checks.urlStillTest && Object.values(out.checks.switches).every((v) => v === false)
      && out.bundleSha256 === Zotero.ZoteroTTSRun.state.expectedBundleSha
      && out.addonVersion === Zotero.ZoteroTTSRun.state.expectedVersion
      && out.afterInstall.positionsQuiet && out.afterInstall.sharedQuiet
      && settings.transport?.running === false && settings.transport?.pendingChange === false && upload.autoUpload?.pending === false;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
