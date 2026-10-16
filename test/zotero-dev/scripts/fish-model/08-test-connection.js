// Test connection on the Fish Audio section, provider OFF, one real two-letter probe per run, two
// cases by params.testCase (never in a loop):
//   free-nothing-pasted  1a.2: key set, model s2.1-pro-free, fish.voices emptied (restored by the cleanup):
//                        `Testing…` at once, then `Connected. N voices available. Synthesis works.`, one POST to the
//                        tts route, no [zotero-tts] debug line from the probe.
//   paid-model-402       1a.4: the dropdown's pick of s2.1-pro writes fish.model; the line names `Fish Audio s2.1-pro`
//                        and the 402 (API credit 0: nothing can be charged); one POST; the free model is picked again.
// (A third case, unknown-model, checked #181's refusal; it left with that check on 2026-10-16.)
// Every request to fish.audio is listed by method and path only (http-on-modify-request; no header, no query).
// params: testCase. state: reads snap; writes tests[testCase].
(async () => {
  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params || {};
  const testCase = params.testCase;
  if (!['free-nothing-pasted', 'paid-model-402'].includes(testCase)) throw new Error('params.testCase must be free-nothing-pasted or paid-model-402');
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref'), doc = win?.document;
  const menu = doc?.getElementById('ztts-fish-model'), testButton = doc?.getElementById('ztts-test-fish'), line = doc?.getElementById('ztts-test-result-fish');
  if (!menu || !testButton || !line) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  if (p.getBoolPref(prefix + 'fish.enabled')) throw new Error('Fish Audio is on: this script runs with the provider off');
  const modelKey = prefix + 'fish.model';
  const model = () => Zotero.Prefs.get('zotero-tts.fish.model') ?? null;
  const pick = value => {
    const kids = menu.menupopup.children;
    for (let i = 0; i < kids.length; i++) if (kids[i].getAttribute('value') === value) { menu.selectedItem = kids[i]; kids[i].doCommand(); return true; }
    return false;
  };
  const entries = async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    return body ? body.split('\n\n') : [];
  };
  const watchHttp = () => {
    const seen = [];
    const observer = { observe(subject) { try { const ch = subject.QueryInterface(Ci.nsIHttpChannel); if (/(^|\.)fish\.audio$/.test(ch.URI.host)) seen.push({ method: ch.requestMethod, host: ch.URI.host, path: ch.URI.filePath }); } catch (_) {} } };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return { stop() { try { Services.obs.removeObserver(observer, 'http-on-modify-request'); } catch (_) {} return seen; } };
  };
  const out = { testCase, key: state.apiKey };
  const labels = () => { const kids = menu.menupopup.children; const l = []; for (let i = 0; i < kids.length; i++) l.push(kids[i].getAttribute('label')); return l; };

  // --- Preparation ---
  if (testCase === 'free-nothing-pasted') {
    p.setStringPref(prefix + 'fish.voices', '');
    out.prepared = { voicesLength: String(Zotero.Prefs.get('zotero-tts.fish.voices') || '').length, model: model() };
  } else {
    out.pickFound = pick('s2.1-pro');
    await sleep(250);
    out.prepared = { model: model(), prefHasUser: p.prefHasUserValue(modelKey), shown: menu.label };
  }

  // --- The click and what follows, to the end of the check ---
  const before = (await entries()).length;
  const watch = watchHttp();
  const origin = win.performance.now();
  testButton.click();
  const trace = [{ ms: Math.round((win.performance.now() - origin) * 10) / 10, text: line.textContent, buttonDisabled: testButton.disabled }];
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await sleep(20);
    const text = line.textContent, last = trace[trace.length - 1];
    if (text !== last.text || testButton.disabled !== last.buttonDisabled) trace.push({ ms: Math.round(win.performance.now() - origin), text, buttonDisabled: testButton.disabled });
    if (!testButton.disabled && !/^Testing/.test(text)) break;
  }
  await sleep(300);
  const requests = watch.stop();
  const after = await entries();
  const pluginLines = after.slice(before).filter(l => l.includes('[zotero-tts]')).map(l => l.slice(0, 200));
  const final = String(line.textContent || '').trim();
  const ttsPosts = requests.filter(r => r.method === 'POST' && /\/v1\/tts/.test(r.path)).length;
  const byRoute = {};
  for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
  out.firstSampleMs = trace[0].ms; out.firstSampleText = trace[0].text;
  out.trace = trace.length > 6 ? [...trace.slice(0, 3), { elided: trace.length - 5 }, ...trace.slice(-2)] : trace;
  out.final = final.slice(0, 600); out.finalMs = trace[trace.length - 1].ms;
  out.requests = { total: requests.length, byRoute, ttsPosts };
  out.pluginLinesDuringTest = pluginLines;

  // --- Restore the free model, and judge ---
  let ok = false;
  if (testCase === 'free-nothing-pasted') {
    const m = /^Connected\. ([\d,]+) voices available\. Synthesis works\.$/.exec(final);
    out.voices = m ? Number(m[1].replace(/,/g, '')) : null;
    ok = /^Testing/.test(out.firstSampleText) && !!m && ttsPosts === 1 && pluginLines.length === 0;
  } else if (testCase === 'paid-model-402') {
    out.pickBackFound = pick('s2.1-pro-free');
    await sleep(250);
    out.after = { model: model(), prefHasUser: p.prefHasUserValue(modelKey) };
    ok = final.startsWith('Connected, but synthesis failed: Fish Audio s2.1-pro: Fish Audio refused the request (402) — Insufficient API credit. API credit is managed independently from platform credit') && ttsPosts === 1 && model() === 's2.1-pro-free';
  }
  out.status = ok ? 'PASS' : 'FAIL';
  (state.tests ||= {})[testCase] = out;
  return JSON.stringify(out, null, 1);
})()
