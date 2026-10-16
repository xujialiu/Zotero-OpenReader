// Item 1c.3, second half: a model Fish does not offer is never asked for while a document is being
// read. On the fixture tab (Fish Audio on, free model, volume 0) the popup is opened and, because a
// script-started session's output stays suspended on this Zotero, a trusted Shift+Space (workflow
// section 6) starts the clock. When the playhead has moved, fish.model is set to s9-not-a-model BY PREF.
// From then on: the Player's error line (diagnostics.pluginPlayer(), and the player frame's own status
// button) must become the ztts-player-fish-model-gone text once a sentence is wanted that is not yet
// prepared; no `fish: … word timestamps … (s9-not-a-model)` line; no POST to the tts route after the
// change; the refusal is logged as an error. Then the free model is put back by pref and the popup
// closed. If the clock cannot be started the script says so and forces an unprepared sentence with
// repositionTo instead (and the row is then not the natural reading the case describes).
// params: none. state: reads fixture; writes modelGone.
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
  const GONE = 'Fish Audio no longer offers the chosen model, or OpenReader could not confirm that it does. Choose another model under Settings → OpenReader → Fish Audio.';
  const entries = async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    return body ? body.split('\n\n') : [];
  };
  const watchHttp = () => {
    const seen = [];
    const observer = { observe(subject) { try { const ch = subject.QueryInterface(Ci.nsIHttpChannel); if (/(^|\.)fish\.audio$/.test(ch.URI.host)) seen.push({ at: Date.now(), method: ch.requestMethod, path: ch.URI.filePath }); } catch (_) {} } };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return { stop() { try { Services.obs.removeObserver(observer, 'http-on-modify-request'); } catch (_) {} return seen; } };
  };
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
  const trustedShiftSpace = () => {
    reader.focus?.(); reader._iframeWindow?.focus?.();
    const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
    tip.beginInputTransactionForTests(host);
    const ev = (key, code, kc) => new host.KeyboardEvent('', { key, code, keyCode: kc });
    tip.keydown(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
    tip.keydown(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
    tip.keyup(ev(' ', 'Space', host.KeyboardEvent.DOM_VK_SPACE));
    tip.keyup(ev('Shift', 'ShiftLeft', host.KeyboardEvent.DOM_VK_SHIFT));
  };
  const playerView = async () => {
    const player = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    let open = null;
    for (let i = 0; i < (player.readers || []).length; i++) if (player.readers[i]?.open) open = player.readers[i];
    const frame = reader._iframeWindow?.document?.getElementById('ztts-player-frame');
    const status = frame?.contentDocument?.querySelector('.status-button');
    return { error: open?.state?.error ?? null, actionError: open?.actionError ?? null, statusHidden: status ? !!status.hidden : null, statusTitle: status?.title || null };
  };

  const before = (await entries()).length;
  const watch = watchHttp();
  const out = { status: 'FAIL' };
  ir.toggleReadAloudPopup(true);
  await waitFor(async () => { const e = await engineOf(item.id); return e?.session ? e : null; }, 15000, 120);
  const voice = String(await waitFor(async () => { const e = await engineOf(item.id); return String(e?.session?.voice || m.selectedVoiceID || '') || null; }, 20000, 150) || '');
  if (!voice.startsWith('fish::')) { try { ir.toggleReadAloudPopup(false); } catch (_) {} throw new Error('the session is not on a Fish voice: "' + voice.slice(0, 20) + '"'); }
  await waitFor(async () => (await engineOf(item.id))?.session?.store?.clips >= 3, 10000, 200);

  // --- The clock: trusted presses until the output runs and the position moves ---
  let presses = 0;
  const audioOf = async () => { const e = await engineOf(item.id); return { state: e?.audio?.state ?? null, time: e?.session?.playbackTime ?? null, position: e?.session?.position ?? null }; };
  for (let i = 0; i < 4; i++) {
    const a = await audioOf();
    if (a.state === 'running') break;
    trustedShiftSpace(); presses++;
    await sleep(500);
    if (m.active && m.paused) { trustedShiftSpace(); presses++; await sleep(500); }
  }
  const a1 = await audioOf(); await sleep(600); const a2 = await audioOf();
  out.clock = { presses, first: a1, second: a2, running: a2.state === 'running', moved: (a2.time ?? 0) > (a1.time ?? 0), managerPaused: !!m.paused };
  const natural = out.clock.running && out.clock.moved;
  out.naturalProgress = natural;
  // The playhead has to move at least once (reading), within a bounded wait
  if (natural) await waitFor(async () => ((await engineOf(item.id))?.session?.position ?? 0) >= 1, 20000, 200);

  // --- The model goes away while it reads ---
  const atChange = await engineOf(item.id);
  const tChange = Date.now();
  out.atChange = { position: atChange?.session?.position ?? null, index: atChange?.session?.currentIndex ?? null, clips: atChange?.session?.store?.clips ?? null, requests: atChange?.session?.store?.requests ?? null, prefetchOrder: atChange?.session?.prefetch?.order ?? null };
  Zotero.Prefs.set('zotero-tts.fish.model', 's9-not-a-model');
  if (!natural) { try { m.repositionTo(11); out.forced = 'repositionTo(11): the clock could not be started'; } catch (e) { out.forced = 'repositionTo failed: ' + String(e); } }
  const trace = [];
  let seen = null;
  const end = Date.now() + 70000;
  while (Date.now() < end) {
    const e = await engineOf(item.id), v = await playerView();
    const row = { t: Date.now() - tChange, position: e?.session?.position ?? null, requests: e?.session?.store?.requests ?? null, clips: e?.session?.store?.clips ?? null, managerError: m.error ?? null, playerError: v.error };
    if (!trace.length || JSON.stringify({ ...row, t: 0 }) !== JSON.stringify({ ...trace[trace.length - 1], t: 0 })) trace.push(row);
    if (v.error === GONE) { seen = { ...row, actionError: v.actionError }; break; }
    await sleep(250);
  }
  // The frame paints the state a beat after the controller holds it: read the ! button as the user sees it, and its popover
  await sleep(800);
  const frameDoc = reader._iframeWindow?.document?.getElementById('ztts-player-frame')?.contentDocument;
  const status = frameDoc?.querySelector('.status-button');
  out.playerDom = { statusHidden: status ? !!status.hidden : null, statusText: status?.textContent ?? null, statusTitle: status?.title ?? null };
  try { status?.click(); await sleep(300); } catch (_) {}
  out.popover = { message: frameDoc?.querySelector('.error-message')?.textContent ?? null, retryButton: !!frameDoc?.querySelector('.retry') };
  const requests = watch.stop();
  const all = (await entries()).slice(before);
  const after = requests.filter(r => r.at >= tChange);
  out.trace = trace.length > 8 ? [...trace.slice(0, 3), { elided: trace.length - 6 }, ...trace.slice(-3)] : trace;
  out.playerErrorSeen = seen;
  out.ttsPostsBeforeChange = requests.filter(r => r.at < tChange && r.method === 'POST' && /\/v1\/tts/.test(r.path)).length;
  out.ttsPostsAfterChange = after.filter(r => r.method === 'POST' && /\/v1\/tts/.test(r.path)).length;
  out.requestsAfterChange = after.map(r => r.method + ' ' + r.path);
  out.s9WordTimestampLines = all.filter(l => /word timestamps?/.test(l) && l.includes('(s9-not-a-model)')).length;
  out.fishLinesInScript = all.filter(l => /fish: \d+ word timestamps?/.test(l)).length;
  const refusals = all.filter(l => l.includes('no longer lists the model s9-not-a-model')).map(l => l.slice(0, 200));
  out.refusalEntries = refusals.length; out.refusalSample = refusals[0] ?? null;
  out.gone = GONE;

  // --- Back to the free model; the popup closed ---
  Zotero.Prefs.set('zotero-tts.fish.model', 's2.1-pro-free');
  ir.toggleReadAloudPopup(false);
  out.closed = !!(await waitFor(() => !m.active, 8000));
  out.modelAfter = { value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, hasUser: p.prefHasUserValue(prefix + 'fish.model') };
  out.status = natural && seen && out.playerDom.statusTitle === GONE && out.popover.message === GONE && out.ttsPostsAfterChange === 0 && out.s9WordTimestampLines === 0 && out.refusalEntries >= 1 && out.modelAfter.value === 's2.1-pro-free' ? 'PASS' : (seen && out.playerDom.statusTitle === GONE && out.ttsPostsAfterChange === 0 && out.s9WordTimestampLines === 0 ? 'PASS (forced, not natural reading)' : 'FAIL');
  state.modelGone = out;
  return JSON.stringify(out, null, 1);
})()
