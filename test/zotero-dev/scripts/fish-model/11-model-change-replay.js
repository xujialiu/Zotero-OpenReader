// Item 1c.4: a change of model is heard. On the fixture tab 10 left open (Fish Audio on, free model):
// (A) the popup closed and opened again replays the sentences of the first read: each synthesis line
//     ends `(cached)` and no request leaves; (B) fish.model set to s2.1-pro BY PREF and the popup opened
//     once more: no line is `(cached)` (the old model's audio is not served for the new one), a POST to
//     the tts route goes out and is answered 402 (API credit 0, nothing can be charged), the Player's
//     error line and the manager's error are read. The free model is put back by pref (cleared, equal
//     to the default). The popup is closed after each half. Volume 0, nothing is audible.
// params: none. state: reads fixture; writes modelChange.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  if (!state.fixture) throw new Error('run 10-fixture-first-read.js first');
  if (Zotero.Prefs.get('zotero-tts.fish.model') !== 's2.1-pro-free') throw new Error('fish.model is not the free model');
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
  const fishLine = /fish: (\d+) word timestamps? for (\d+) chars(?: \(([^)]*)\))?( \(cached\))?/;
  const parse = l => { const m = fishLine.exec(l); return m ? { words: Number(m[1]), chars: Number(m[2]), note: m[3] ?? null, cached: !!m[4] } : null; };
  const engineOf = async itemID => { const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); for (const r of diag.readers || []) if (r.itemID === itemID) return r; return null; };
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host.windowState === host.STATE_MINIMIZED) host.restore();
  host.focus();
  const item = Zotero.Items.get(state.fixture.itemID);
  const reader = (() => { const list = Zotero.Reader._readers || []; for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id && !list[i]._window?.closed) return list[i]; return null; })();
  if (!reader?._internalReader?._readAloudManager) throw new Error('the fixture reader is not open');
  if (host.Zotero_Tabs?.select && reader.tabID) host.Zotero_Tabs.select(reader.tabID);
  const ir = reader._internalReader, m = ir._readAloudManager;
  if (m.active) { ir.toggleReadAloudPopup(false); await waitFor(() => !m.active, 8000); }
  await sleep(500);

  /** Open the popup, give it `ms` to read, report what the log, the wire and the Player say, close it. */
  const session = async ms => {
    const before = (await entries()).length;
    const watch = watchHttp();
    ir.toggleReadAloudPopup(true);
    await waitFor(async () => { const e = await engineOf(item.id); return e?.session ? e : null; }, 15000, 120);
    const voice = await waitFor(async () => { const e = await engineOf(item.id); return String(e?.session?.voice || m.selectedVoiceID || '') || null; }, 20000, 150);
    if (!String(voice || '').startsWith('fish::')) { try { ir.toggleReadAloudPopup(false); } catch (_) {} throw new Error('the session is not on a Fish voice: "' + String(voice || '').slice(0, 20) + '"'); }
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < ms) { last = await engineOf(item.id); await sleep(300); }
    const player = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    let open = null;
    for (let i = 0; i < (player.readers || []).length; i++) if (player.readers[i]?.open) open = player.readers[i];
    const all = (await entries()).slice(before);
    const lines = all.filter(l => l.includes('fish:')).map(parse).filter(Boolean);
    const requests = watch.stop();
    const byRoute = {};
    for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
    const refusals = all.filter(l => /402|refused the request|Insufficient API credit|no longer lists|model-gone/i.test(l)).map(l => l.slice(0, 260));
    const result = {
      voice: voice.slice(0, 18) + '…', fishLines: lines.length, cachedLines: lines.filter(l => l.cached).length, uncachedLines: lines.filter(l => !l.cached).length,
      notes: [...new Set(lines.map(l => l.note))], first: lines[0] ?? null,
      ttsPosts: requests.filter(r => r.method === 'POST' && /\/v1\/tts/.test(r.path)).length, requests: byRoute,
      managerError: m.error ?? null, playerError: open?.state?.error ?? null, playerActionError: open?.actionError ?? null,
      sessionError: last?.session?.error ?? null, store: last?.session?.store ? { requests: last.session.store.requests, clips: last.session.store.clips } : null,
      refusalEntries: refusals.length, refusalSample: refusals[0] ?? null,
    };
    ir.toggleReadAloudPopup(false);
    result.closed = !!(await waitFor(() => !m.active, 8000));
    await sleep(600);
    return result;
  };

  const out = { status: 'FAIL' };
  out.freeReplay = await session(7000);
  Zotero.Prefs.set('zotero-tts.fish.model', 's2.1-pro');
  out.modelNow = Zotero.Prefs.get('zotero-tts.fish.model');
  try {
    out.paidReplay = await session(7000);
  } finally {
    Zotero.Prefs.set('zotero-tts.fish.model', 's2.1-pro-free');
  }
  out.modelAfter = { value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, hasUser: p.prefHasUserValue(prefix + 'fish.model') };
  const a = out.freeReplay, b = out.paidReplay;
  out.status = a.fishLines >= 1 && a.cachedLines === a.fishLines && a.ttsPosts === 0
    && b.cachedLines === 0 && b.ttsPosts >= 1 && out.modelAfter.value === 's2.1-pro-free' ? 'PASS' : 'FAIL';
  state.modelChange = out;
  return JSON.stringify(out, null, 1);
})()
