// Item 1a.5 (and the last sentence of 1c.1): Enable is a commit point. Provider off, free model; the
// click on ztts-enable-fish is followed every 10 ms: `Checking…` on the button and on the line within
// ~120 ms, then the label `Disable`, fish.enabled true, the line holding the connection message, and
// all the section's fields locked, the Model dropdown among them. Then, locked, a synthetic pick of
// s2.1-pro is ignored (the pref is untouched, the dropdown goes back). Requests to fish.audio are listed
// by method and path. Fish Audio is left ENABLED, as the owner had it.
// params: none. state: writes enableCommit.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref'), doc = win?.document;
  const menu = doc?.getElementById('ztts-fish-model'), button = doc?.getElementById('ztts-enable-fish'), line = doc?.getElementById('ztts-test-result-fish'), group = doc?.getElementById('ztts-provider-fish');
  if (!menu || !button || !line || !group) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  if (p.getBoolPref(prefix + 'fish.enabled')) throw new Error('Fish Audio is already on');
  const modelKey = prefix + 'fish.model';
  const watchHttp = () => {
    const seen = [];
    const observer = { observe(subject) { try { const ch = subject.QueryInterface(Ci.nsIHttpChannel); if (/(^|\.)fish\.audio$/.test(ch.URI.host)) seen.push({ method: ch.requestMethod, path: ch.URI.filePath }); } catch (_) {} } };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return { stop() { try { Services.obs.removeObserver(observer, 'http-on-modify-request'); } catch (_) {} return seen; } };
  };
  const fields = () => Array.from(group.querySelectorAll('input, menulist, checkbox')).map(f => ({ id: f.id || f.getAttribute('preference')?.replace('extensions.zotero.zotero-tts.', '') || f.localName, disabled: !!f.disabled }));
  const view = () => ({ label: button.getAttribute('label'), buttonDisabled: button.disabled, line: String(line.textContent || '').trim(), fishEnabled: p.getBoolPref(prefix + 'fish.enabled') });
  const before = { ...view(), model: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, modelDisabled: menu.disabled, fields: fields() };
  const watch = watchHttp();
  const origin = win.performance.now();
  button.click();
  const trace = [{ ms: Math.round((win.performance.now() - origin) * 10) / 10, ...view() }];
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await sleep(10);
    const v = view(), last = trace[trace.length - 1];
    if (v.label !== last.label || v.line !== last.line || v.fishEnabled !== last.fishEnabled || v.buttonDisabled !== last.buttonDisabled) trace.push({ ms: Math.round(win.performance.now() - origin), ...v });
    if (v.label === 'Disable' && v.fishEnabled && !v.buttonDisabled) break;
  }
  await sleep(300);
  const requests = watch.stop();
  const after = { ...view(), modelDisabled: menu.disabled, fields: fields() };
  const checking = trace.find(t => t.label === 'Checking…' && t.line === 'Checking…');
  // Locked: a pick is impossible
  const kids = menu.menupopup.children;
  let found = false;
  for (let i = 0; i < kids.length; i++) if (kids[i].getAttribute('value') === 's2.1-pro') { menu.selectedItem = kids[i]; kids[i].doCommand(); found = true; break; }
  await sleep(250);
  const lockedPick = { found, value: menu.value, shown: menu.label, pref: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, prefHasUser: p.prefHasUserValue(modelKey) };
  const byRoute = {};
  for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
  const out = {
    before, checkingSeenAtMs: checking?.ms ?? null, trace: trace.length > 6 ? [...trace.slice(0, 3), { elided: trace.length - 5 }, ...trace.slice(-2)] : trace,
    after, doneAtMs: trace[trace.length - 1].ms, lockedPick, requests: { total: requests.length, byRoute },
  };
  const allLocked = after.fields.length > 0 && after.fields.every(f => f.disabled);
  out.allFieldsLocked = allLocked;
  out.status = checking && checking.ms <= 120 && after.label === 'Disable' && after.fishEnabled && /^Connected\. [\d,]+ voices available\. Synthesis works\.$/.test(after.line) && after.modelDisabled && allLocked
    && lockedPick.found && lockedPick.pref === 's2.1-pro-free' && lockedPick.prefHasUser === false && lockedPick.value === 's2.1-pro-free' ? 'PASS' : 'FAIL';
  state.enableCommit = out;
  return JSON.stringify(out, null, 1);
})()
