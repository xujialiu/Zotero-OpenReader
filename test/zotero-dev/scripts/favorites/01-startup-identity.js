// Post-install gate for 1.17.3-beta (candidate 4682892): the manifest
// version must match, startup must report no failed steps, and the pinned
// highlight state must be sane before any fixture is opened.
return (async () => {
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const levels = JSON.parse(await Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const failures = (startup.steps ?? []).filter((step) => step.ok !== true);
  const version = Zotero.ZoteroTTS.version ?? startup.version ?? null;
  return JSON.stringify({
    zotero: Zotero.version,
    pluginVersion: version,
    expectedVersion: '1.17.3-beta',
    startupFailed: failures,
    startupStepCount: (startup.steps ?? []).length,
    highlightLevels: {
      switches: levels.switches ?? null,
      pin: levels.pin ?? null,
      readers: (levels.readers ?? []).length,
    },
    ok: failures.length === 0 && version === '1.17.3-beta',
  }, null, 1);
})()
