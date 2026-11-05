// Revalidation after a resumed session: the build identity, the fixture's
// state, the test-WebDAV isolation and all four transports — everything a
// continuation must re-prove before driving again. No URL or credential
// value returns.
(async () => {
  const out = { step: 'revalidate' };
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const d = Zotero.ZoteroTTS.diagnostics;
  try {
    const am = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await am.AddonManager.getAddonByID('zotero-tts@xujialiu.top');
    const uri = addon?.getResourceURI ? addon.getResourceURI('content/zotero-tts.js') : null;
    const r = await fetch(uri.spec, { cache: 'no-store' });
    const text = await r.text();
    const digest = await crypto.subtle.digest({ name: 'SHA-256' }, new TextEncoder().encode(text));
    out.build = { version: addon.version, bundleSha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('') };
    out.build.matchesRun = out.build.bundleSha256 === state.expectedBundleSha;

    const f = state.fixture;
    const item = Zotero.Items.get(f?.itemID);
    out.fixture = {
      itemExists: !!item && !item.deleted,
      key: f?.key ?? null,
      title: item ? (item.parentItem ?? item)?.getField('title') : null,
      readerAttached: (Zotero.Reader._readers || []).some((x) => x.itemID === f?.itemID),
      tabID: f?.tabID ?? null,
      contentType: item?.attachmentContentType ?? null,
    };

    const trimSlash = (v) => { let o = String(v); while (o.endsWith('/')) o = o.slice(0, -1); return o; };
    const urlNow = String(p.getStringPref(prefix + 'webdav.url') ?? '');
    out.isolation = {
      urlMatchesTestFile: trimSlash(urlNow) === trimSlash(state.testUrl ?? ''),
      urlChars: urlNow.length,
      folderEnabled: p.getBoolPref(prefix + 'webdav.enabled'),
      folderHasUserValue: p.prefHasUserValue(prefix + 'webdav.enabled'),
      syncPositions: p.getBoolPref(prefix + 'webdav.syncPositions'),
      syncSettings: p.getBoolPref(prefix + 'webdav.syncSettings'),
      autoUploadSettings: p.getBoolPref(prefix + 'webdav.autoUploadSettings'),
      volume: p.getIntPref(prefix + 'readAloud.volume'),
      memoryVoice: (() => { try { const m = JSON.parse(String(p.getStringPref(prefix + 'readAloud.memory') || '{}')); return String(m?.voice?.id ?? '').slice(0, 24) + '…'; } catch { return 'unreadable'; } })(),
    };

    const position = JSON.parse(await d.position());
    const sync = JSON.parse(await d.positionSync());
    const settings = JSON.parse(await d.settingsSync());
    const upload = JSON.parse(await d.settingsUpload());
    out.transports = {
      store: { queued: position.store?.queued ?? null, writing: position.store?.writing ?? null, lastError: position.store?.lastError ?? null },
      positions: { running: sync.transport?.running ?? null, lastTrigger: sync.transport?.lastTrigger ?? null, lastOutcome: sync.transport?.lastOutcome ?? null },
      shared: { running: sync.shared?.transport?.running ?? null, lastOutcome: sync.shared?.transport?.lastOutcome ?? null, adopted: sync.shared?.transport?.adopted ?? null },
      settingsSync: { running: settings.transport?.running ?? null, pendingChange: settings.transport?.pendingChange ?? null },
      autoUpload: { pending: upload.autoUpload?.pending ?? null },
    };
    out.counts = {
      databaseRows: position.database?.rows ?? null,
      localEntries: sync.localEntries ?? null,
      tombstones: sync.tombstones ?? null,
      documents: sync.shared?.documents?.documents ?? null,
      sharedItems: sync.shared?.documents?.items ?? null,
    };
    out.baselineCounts = state.rowsBeforeCounts ?? null;
    out.debugStoring = !!Zotero.Debug?.storing;
    out.settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    out.hostState = host ? host.windowState : null;
    out.ok = out.build.matchesRun && out.fixture.itemExists && out.fixture.readerAttached
      && out.isolation.folderEnabled === false && out.isolation.urlMatchesTestFile && out.isolation.syncPositions === false
      && out.isolation.syncSettings === false && out.isolation.autoUploadSettings === false
      && out.isolation.volume === 0
      && out.transports.store.queued === 0 && out.transports.store.writing === false
      && out.transports.positions.running === false && out.transports.shared.running === false
      && out.transports.settingsSync.running === false && out.transports.autoUpload.pending === false;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
