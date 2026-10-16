// Item 1c.3 (wording of 2026-10-16): a chosen model neither list offers. Fish Audio OFF, the settings
// window 05 left open. fish.model is set to s9-not-a-model BY PREF (Zotero.Prefs.set, as the sync or a
// restore would write it: no pick, no request): the dropdown's last entry must read exactly
// `s9-not-a-model` (no price, no mark) and be the selected one, the five entries before it unchanged.
// Then fish.model is put back to the snapshot (cleared when it held no user value) and the dropdown
// returns to the five entries with the stored model selected. NEVER Test connection and never a read on
// this model: Fish answers a model it does not know as the paid s2.1-pro (#181's check was withdrawn on
// 2026-10-16), so every request to fish.audio during the script is counted and any POST fails the row.
// The pref is put back in a `finally`. params: none. state: reads snap; writes unlistedModel.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 6000, step = 20) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  if (!state.snap) throw new Error('run 00-baseline-and-isolate.js first');
  const win = Services.wm.getMostRecentWindow('zotero:pref'), doc = win?.document;
  const menu = doc?.getElementById('ztts-fish-model');
  if (!menu) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  const modelKey = prefix + 'fish.model', enabledKey = prefix + 'fish.enabled';
  if (p.getBoolPref(enabledKey)) throw new Error('Fish Audio is on: this check runs with the provider off');
  const saved = state.snap['fish.model'];
  const view = () => {
    const kids = menu.menupopup.children, labels = [], values = [];
    for (let i = 0; i < kids.length; i++) { labels.push(kids[i].getAttribute('label')); values.push(kids[i].getAttribute('value')); }
    const sel = menu.selectedItem;
    return { labels, values, value: menu.value, selectedIndex: menu.selectedIndex, selectedLabel: sel ? sel.getAttribute('label') : null, shown: menu.label, disabled: !!menu.disabled };
  };
  const entries = async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    return body ? body.split('\n\n') : [];
  };
  const watchHttp = () => {
    const seen = [];
    const observer = { observe(subject) { try { const ch = subject.QueryInterface(Ci.nsIHttpChannel); if (/(^|\.)fish\.audio$/.test(ch.URI.host)) seen.push({ method: ch.requestMethod, path: ch.URI.filePath }); } catch (_) {} } };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return { stop() { try { Services.obs.removeObserver(observer, 'http-on-modify-request'); } catch (_) {} return seen; } };
  };
  const five = ['s2.1-pro-free — free', 's2.1-pro — $15 per million bytes', 'drama-3 — $50 per million characters', 's2-pro — $15 per million bytes', 's1 — paid'];
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const prefState = () => ({ value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, hasUser: p.prefHasUserValue(modelKey) });

  const before = { ...view(), pref: prefState() };
  const logBefore = (await entries()).length;
  const watch = watchHttp();
  let set = null, back = null, prefAfter = null, error = null;
  try {
    const t0 = Date.now();
    Zotero.Prefs.set('zotero-tts.fish.model', 's9-not-a-model');
    const arrived = await waitFor(() => { const v = view(); return v.value === 's9-not-a-model' && v.labels[v.labels.length - 1] === 's9-not-a-model' ? v : null; });
    set = { ms: Date.now() - t0, found: !!arrived, ...(arrived || view()), pref: prefState() };
  } catch (e) {
    error = String(e && e.message || e);
  } finally {
    // Put the pref back, whatever happened above
    try {
      if (saved.hasUser) Zotero.Prefs.set('zotero-tts.fish.model', saved.value);
      else if (p.prefHasUserValue(modelKey)) p.clearUserPref(modelKey);
    } catch (e) { error = (error ? error + '; ' : '') + 'restore: ' + String(e && e.message || e); }
  }
  const t1 = Date.now();
  const returned = await waitFor(() => { const v = view(); return v.labels.length === 5 && v.value === (saved.hasUser ? saved.value : 's2.1-pro-free') ? v : null; });
  back = { ms: Date.now() - t1, found: !!returned, ...(returned || view()), pref: prefState() };
  prefAfter = prefState();
  await sleep(300);
  const requests = watch.stop();
  const pluginLines = (await entries()).slice(logBefore).filter(l => l.includes('[zotero-tts]')).map(l => l.slice(0, 200));
  const byRoute = {};
  for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
  const posts = requests.filter(r => r.method === 'POST').length;
  const ok = !error && same(before.labels, five) && before.value === 's2.1-pro-free' && before.disabled === false
    && !!set && set.found && set.labels.length === 6 && same(set.labels.slice(0, 5), five) && set.labels[5] === 's9-not-a-model' && set.values[5] === 's9-not-a-model'
    && set.value === 's9-not-a-model' && set.selectedIndex === 5 && set.selectedLabel === 's9-not-a-model' && set.shown === 's9-not-a-model' && set.disabled === false
    && set.pref.value === 's9-not-a-model' && set.pref.hasUser === true
    && back.found && same(back.labels, five) && back.value === 's2.1-pro-free' && back.selectedIndex === 0
    && prefAfter.hasUser === saved.hasUser && posts === 0 && pluginLines.length === 0;
  const out = {
    status: ok ? 'PASS' : 'FAIL', phase: '1c.3 an unlisted model, by pref (Fish Audio off)', error,
    fishEnabled: p.getBoolPref(enabledKey), saved: { hasUser: saved.hasUser },
    before, set, back, prefAfter, restored: prefAfter.hasUser === saved.hasUser,
    requests: { total: requests.length, posts, byRoute }, pluginLinesDuringCheck: pluginLines,
  };
  state.unlistedModel = out;
  return JSON.stringify(out, null, 1);
})()
