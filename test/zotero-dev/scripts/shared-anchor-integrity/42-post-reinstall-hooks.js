// Case item 8, final leg: after the same-build in-place reinstall (the path a
// real upgrade takes), the segment-preparation hooks must be installed at
// startup again — the synchronous startup diagnostic names the step, the
// installed bundle hashes to the run's build, and segmentPreparation()
// reports live patched readers with no pending state. No sessions started.
(async () => {
  const out = { step: 'post-reinstall-hooks' };
  try {
    const startupRaw = Zotero.ZoteroTTS.diagnostics.startup();
    const startup = JSON.parse(startupRaw);
    out.version = startup.version;
    out.stepCount = Array.isArray(startup.steps) ? startup.steps.length : null;
    out.failedSteps = Array.isArray(startup.steps) ? startup.steps.filter((s) => s.ok === false).map((s) => s.name ?? s.step ?? '') : null;
    out.hasSegmentPreparationStep = Array.isArray(startup.steps) && startup.steps.some((s) => (s.name ?? s.step ?? '') === 'segment preparation' && s.ok !== false);

    const am = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await am.AddonManager.getAddonByID('zotero-tts@xujialiu.top');
    const uri = addon?.getResourceURI ? addon.getResourceURI('content/zotero-tts.js') : null;
    const r = await fetch(uri.spec, { cache: 'no-store' });
    const bytes = new TextEncoder().encode(await r.text());
    out.bundleSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    out.bundleMatches = out.bundleSha256 === Zotero.ZoteroTTSRun.state.expectedBundleSha;
    out.addonVersion = addon.version ?? null;

    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.segmentPreparation());
    out.patches = pp.patches ?? null;
    out.readers = (pp.readers || []).map((x) => ({ itemID: x.itemID, ...x.state }));
    out.noPending = (pp.readers || []).every((x) => x.state?.pending === false);
    out.livePatchCount = pp.patches?.live ?? null;

    const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.folderAfterReinstall = sync.folder ?? null;
    out.ok = out.bundleMatches && out.addonVersion === Zotero.ZoteroTTSRun.state.expectedVersion
      && out.stepCount === 31 && (out.failedSteps || []).length === 0
      && out.hasSegmentPreparationStep && out.noPending && out.folderAfterReinstall === false
      && (out.readers.some((x) => x.patched === true));
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  }
  return JSON.stringify(out, null, 1);
})()
