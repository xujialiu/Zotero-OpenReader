// The reading checks' setup (item 1c.4 and the short re-check's read): fixture-a.pdf imported as a
// standalone attachment and opened in a tab (the main window is restored for the page to initialize), the
// Read Aloud popup opened on the remembered Fish voice (already listed: no memory write; Zotero's own tiers
// are off, so nothing metered can answer), the first sentences read with the free model at volume 0, the
// audio probed, then the popup closed again (the tab stays for the next scripts) and the host minimized
// again, unless params.keepHostRestored (a script after this one that needs the foreground). Each synthesis
// line `fish: N word timestamps for M chars (note)` and every request to fish.audio (method + path, the
// response status, and for a POST the `model` header only, never Authorization) is listed: the audio
// requests must all be answered 200 and carry s2.1-pro-free.
// params: fixturesDir, keepHostRestored. state: reads snap; writes fixture, firstRead.
(async () => {
  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params || {};
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  if (!state.snap) throw new Error('run 00-baseline-and-isolate.js first');
  if (!p.getBoolPref(prefix + 'fish.enabled')) throw new Error('Fish Audio is off: run 09-enable-commit.js first');
  if (Zotero.Prefs.get('zotero-tts.fish.model') !== 's2.1-pro-free') throw new Error('fish.model is not the free model');
  const entries = async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    return body ? body.split('\n\n') : [];
  };
  const watchHttp = () => {
    const seen = [], byChannel = new Map(), topics = ['http-on-modify-request', 'http-on-examine-response'];
    const observer = {
      observe(subject, topic) {
        try {
          const ch = subject.QueryInterface(Ci.nsIHttpChannel);
          if (!/(^|\.)fish\.audio$/.test(ch.URI.host)) return;
          if (topic === 'http-on-modify-request') {
            const rec = { at: Date.now(), method: ch.requestMethod, path: ch.URI.filePath, model: null, status: null };
            if (rec.method === 'POST') { try { rec.model = ch.getRequestHeader('model'); } catch (_) {} }
            seen.push(rec); byChannel.set(ch.channelId, rec);
          } else {
            const rec = byChannel.get(ch.channelId);
            if (rec) rec.status = ch.responseStatus;
          }
        } catch (_) {}
      },
    };
    for (const t of topics) Services.obs.addObserver(observer, t);
    return {
      async stop() {
        const end = Date.now() + 4000;
        while (Date.now() < end && seen.some(r => r.status === null)) await sleep(100);
        for (const t of topics) { try { Services.obs.removeObserver(observer, t); } catch (_) {} }
        return seen;
      },
    };
  };
  const fishLine = /fish: (\d+) word timestamps? for (\d+) chars(?: \(([^)]*)\))?( \(cached\))?/;
  const parse = l => { const m = fishLine.exec(l); return m ? { words: Number(m[1]), chars: Number(m[2]), note: m[3] ?? null, cached: !!m[4], prefetch: /prefetch: fish:/.test(l) } : null; };
  const engineOf = async itemID => {
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (const r of diag.readers || []) if (r.itemID === itemID) return r;
    return null;
  };

  // --- The window for the page, the fixture, the reader ---
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host.windowState === host.STATE_MINIMIZED) host.restore();
  host.focus();
  await sleep(500);
  const hostState = host.windowState;
  // The fixture of this run is reused when an earlier attempt of this script left it (resumable)
  let item = state.fixture ? Zotero.Items.get(state.fixture.itemID) : null;
  if (!item) {
    const file = PathUtils.join(params.fixturesDir, 'fixture-a.pdf');
    const title = 'Zotero-OpenReader fish-model ' + new Date().toISOString().slice(0, 16);
    item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    if (!item?.id) throw new Error('the fixture did not import');
    state.fixture = { itemID: item.id, key: item.key, title };
  }
  const readerOf = () => { const list = Zotero.Reader._readers || []; for (let i = 0; i < list.length; i++) if (list[i].itemID === item.id && !list[i]._window?.closed) return list[i]; return null; };
  if (!readerOf()) await Zotero.Reader.open(item.id);
  const t0 = Date.now();
  const reader = await waitFor(() => { const r = readerOf(); return r?._internalReader?._readAloudManager ? r : null; }, 24000, 200);
  if (!reader) throw new Error('the fixture reader did not initialize within 24 s');
  const readyMs = Date.now() - t0;
  state.fixture.tabID = reader.tabID;
  if (host.Zotero_Tabs?.select && reader.tabID) host.Zotero_Tabs.select(reader.tabID);
  await sleep(1500);
  const ir = reader._internalReader, m = ir._readAloudManager;

  // --- Open the popup and watch the first sentences ---
  const before = (await entries()).length;
  const watch = watchHttp();
  const opened = Date.now();
  ir.toggleReadAloudPopup(true);
  const first = await waitFor(async () => { const e = await engineOf(item.id); return e?.session ? e : null; }, 15000, 120);
  if (!first) { try { ir.toggleReadAloudPopup(false); } catch (_) {} throw new Error('no engine session within 15 s of the popup opening'); }
  // The session exists before the voice list has arrived: wait for the voice, then insist on a Fish one
  const chosen = await waitFor(async () => { const e = await engineOf(item.id); const v = String(e?.session?.voice || m.selectedVoiceID || ''); return v || null; }, 20000, 150);
  const voice = String(chosen || '');
  if (!voice.startsWith('fish::')) { try { ir.toggleReadAloudPopup(false); } catch (_) {} throw new Error('the session is not on a Fish voice (credits are the owner\'s): "' + voice.slice(0, 20) + '"'); }
  const samples = [];
  const sampleEnd = Date.now() + 9000;
  while (Date.now() < sampleEnd) {
    const e = await engineOf(item.id);
    const s = e?.session;
    samples.push({ t: Date.now() - opened, position: s?.position ?? null, index: s?.currentIndex ?? null, playing: s?.playing ?? null, paused: s?.paused ?? null, audio: e?.audio?.state ?? null, playbackTime: s?.playbackTime ?? null, requests: s?.store?.requests ?? null, clips: s?.store?.clips ?? null, prefetchOrder: s?.prefetch?.order ? s.prefetch.order.length : null });
    await sleep(500);
  }
  const player = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  let open = null;
  for (let i = 0; i < (player.readers || []).length; i++) if (player.readers[i]?.open) open = player.readers[i];
  const lines = (await entries()).slice(before).filter(l => l.includes('fish:')).map(l => ({ ...(parse(l) || { raw: l.slice(0, 160) }) }));
  // The `fish:` filter also catches `…voice fish::…` lines of the engine: only the parsed ones are synthesis lines
  const synth = lines.filter(l => l.words !== undefined);
  const requests = await watch.stop();
  const byRoute = {};
  for (const r of requests) { const k = r.method + ' ' + r.path; byRoute[k] = (byRoute[k] || 0) + 1; }
  const tts = requests.filter(r => r.method === 'POST' && /\/v1\/tts/.test(r.path)), ttsStatuses = {}, ttsModels = {};
  for (const r of tts) { ttsStatuses[r.status] = (ttsStatuses[r.status] || 0) + 1; ttsModels[r.model] = (ttsModels[r.model] || 0) + 1; }
  const manager = { active: !!m.active, paused: !!m.paused, voice: voice.slice(0, 18) + '…', tier: String(m.selectedTier || '') };

  // --- Close the popup again; the tab stays ---
  ir.toggleReadAloudPopup(false);
  const closed = await waitFor(() => !m.active, 8000);
  const out = {
    status: 'PASS', fixture: { itemID: item.id, key: item.key }, hostStateWhenOpened: hostState, readyMs,
    manager, playerState: open ? { opened: open.state?.opened, active: open.state?.active, playing: open.state?.playing, provider: open.state?.provider, error: open.state?.error ?? null } : null,
    samples: samples.length > 6 ? [...samples.slice(0, 3), { elided: samples.length - 5 }, ...samples.slice(-2)] : samples,
    audio: { first: samples[0]?.audio, last: samples[samples.length - 1]?.audio, clockMoved: (samples[samples.length - 1]?.playbackTime ?? 0) > (samples[0]?.playbackTime ?? 0), positionMoved: samples[samples.length - 1]?.position !== samples[0]?.position },
    fishLines: lines.slice(0, 12), fishLineCount: lines.length, synthesisLines: synth.length,
    requests: { total: requests.length, byRoute, tts: { count: tts.length, statuses: ttsStatuses, models: ttsModels } }, closedAfterRead: !!closed,
  };
  if (!synth.length) out.status = 'FAIL: no synthesis line';
  else if (!synth.every(l => typeof l.note === 'string' && l.note.includes('s2.1-pro-free'))) out.status = 'FAIL: a synthesis line does not name s2.1-pro-free';
  else if (!tts.length) out.status = 'CHECK: no audio request (served from the cache): the statuses were not observed';
  else if (tts.some(r => r.status !== 200)) out.status = 'FAIL: an audio request was not answered 200';
  else if (tts.some(r => r.model !== 's2.1-pro-free')) out.status = 'FAIL: an audio request carried another model header';
  // The foreground step is over: minimize again (the cleanup puts the tab and bounds back)
  if (!params.keepHostRestored && host.windowState !== host.STATE_MINIMIZED) { host.minimize(); await sleep(500); }
  out.hostMinimizedAfter = host.windowState === host.STATE_MINIMIZED;
  state.firstRead = out;
  return JSON.stringify(out, null, 1);
})()
