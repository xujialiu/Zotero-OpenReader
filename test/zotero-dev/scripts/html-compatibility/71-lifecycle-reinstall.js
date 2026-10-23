// Check 7, second half — run immediately after the tester's in-place
// reinstall: startup all ok (HTML document compatibility included), the
// WebDAV folder still off, the idle HTML tab's earlier empty analysis
// cleared, no session started by the install, and compatibility serving
// again. state: reads fx; writes lifecycle7b.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fx;
  const out = { step: 'lifecycle-reinstall' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;

  const AM = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  const addon = await AM.getAddonByID('zotero-tts@xujialiu.top');
  out.addon = { version: addon?.version ?? null, active: addon?.isActive ?? null };

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const names = (startup.steps || []).map((s) => (typeof s === 'string' ? s : s.name));
  out.startup = { version: startup.version, stepCount: names.length, failed: startup.failed, hasHtmlCompatibility: names.some((n) => String(n).includes('HTML document compatibility')) };

  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.folder = sync.folder;

  // The startup walk clears idle HTML readers' earlier empty/failed analysis.
  // Give the walk's settle window (30 s bound) a moment.
  await sleep(2500);
  const bodylessSnapshotReader = (Zotero.Reader._readers || []).find((r) => r.itemID === fx.bodylessSnapshot.id);
  out.idleEmptyTab = bodylessSnapshotReader ? {
    found: true,
    hasSdt: !!waive(bodylessSnapshotReader._internalReader)?._sdt,
    structureContent: (() => { try { const sdt = waive(bodylessSnapshotReader._internalReader._sdt); return sdt?.structure ? (Array.isArray(waive(sdt.structure).content) ? waive(sdt.structure).content.length : null) : null; } catch (e) { return 'ERR'; } })(),
    active: !!waive(bodylessSnapshotReader._internalReader?._readAloudManager)?.active,
  } : { found: false };

  // No reading started by the install.
  out.anyActive = (Zotero.Reader._readers || []).some((r) => !!waive(r._internalReader?._readAloudManager)?.active);

  // Compatibility serves again.
  const pack = await Zotero.SDT.getPack(fx.bodylessImported.id);
  out.compatibilityAgain = { ok: !!pack?.ok };
  const rows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments());
  out.rowAfterReinstall = rows.find((r) => r.itemID === fx.bodylessImported.id) ?? null;

  out.ok = out.addon.active === true
    && out.startup.failed.length === 0
    && out.startup.hasHtmlCompatibility
    && out.folder === false
    && out.idleEmptyTab.found && out.idleEmptyTab.hasSdt === false
    && out.anyActive === false
    && out.compatibilityAgain.ok
    && out.rowAfterReinstall?.status === 'compatibility';
  return JSON.stringify(out, null, 1);
})()
