// Issue #224 case item 1: the build. startup() has the beta version with every
// step ok, and diagnostics.voiceSwitch().mechanism is engine-handoff-v3
// (beta2 said engine-handoff-v2) — proved by the diagnostic, not the version.
// Expected build updated to 1.16.13-beta4 for the #224/#225 fix re-run (2026-10-22).
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  try {
    if (!S.prefSnapshot) throw new Error('run 224-00 first');
    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.checks.version = startup.version;
    out.checks.allStepsOk = Array.isArray(startup.steps) && startup.steps.every((s) => s.ok === true);
    out.checks.failedSteps = startup.failed;
    const failedNames = (startup.steps ?? []).filter((s) => !s.ok).map((s) => s.name);
    out.checks.failedNames = failedNames;
    const vs = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    out.checks.mechanism = vs.mechanism;
    out.checks.bindings = vs.bindings ?? null;
    out.status = startup.version === '1.16.13-beta4' && out.checks.allStepsOk && (startup.failed ?? []).length === 0 && vs.mechanism === 'engine-handoff-v3' ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
