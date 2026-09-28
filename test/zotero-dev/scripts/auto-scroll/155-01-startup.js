// Issue #155 run, startup after the exact install (2026-09-29, 1.16.2-beta2).
// diagnostics.startup() is synchronous and returns the JSON string itself.
return (async () => {
  const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const steps = report.steps ? Object.entries(report.steps).map(([name, step]) => ({ name, ok: step?.ok === true })) : [];
  return JSON.stringify({
    version: report.version,
    expectedVersion: Zotero.ZoteroTTSRun.params.expectedVersion ?? null,
    versionMatches: report.version === (Zotero.ZoteroTTSRun.params.expectedVersion ?? report.version),
    stepCount: steps.length,
    failed: steps.filter(s => !s.ok),
    allOk: steps.length > 0 && steps.every(s => s.ok),
    readingLineDefault: (() => {
      const name = 'extensions.zotero.zotero-tts.readAloud.readingLine';
      const p = Services.prefs;
      return { value: p.getIntPref(name, -1), user: p.prefHasUserValue(name), type: p.getPrefType(name) };
    })(),
  });
})()
