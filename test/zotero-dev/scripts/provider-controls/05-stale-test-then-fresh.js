// 1.6.2 bullet 2 (issue #214): the same stale test through Test connection —
// a held passing reply released after the address changed must not leave a
// success line, and the switch never moves. Then a fresh check of the
// restored address passes normally.
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = Zotero.ZoteroTTSRun.state.pc.stubBase;
  const ALT = Zotero.ZoteroTTSRun.state.pc.altBase;
  const reqLoop = (u, w) => { const h = new URL(u).hostname; if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error(w + ' must be loopback, got ' + h); };
  reqLoop(STUB, 'stubBase');
  reqLoop(ALT, 'altBase');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);

  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || !win.document.getElementById('ztts-provider-compatible')) throw new Error('pane not open');
  const doc = win.document;

  const row = (id) => ({
    toggle: doc.getElementById('ztts-enable-' + id).getAttribute('label'),
    line: doc.getElementById('ztts-test-result-' + id).textContent,
  });

  const out = {};
  if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible must be off at start');
  set(PRE + 'compatible.baseURL', STUB);
  await fetch(STUB + '/control/reset', { method: 'POST' });

  // Held test against the stub, address changed while held, then released.
  const t0 = Date.now();
  doc.getElementById('ztts-test-compatible').click();
  let held = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const s = await (await fetch(STUB + '/control/state')).json();
    if (s.held >= 1) { held = Date.now() - t0; break; }
  }
  out.heldAfterMs = held;
  if (!held) throw new Error('test synthesis never held');
  set(PRE + 'compatible.baseURL', ALT);
  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const r = row('compatible');
    if (r.line && !/Testing/.test(r.line)) { done = Date.now() - t0; break; }
  }
  out.doneAfterMs = done;
  out.staleRow = row('compatible');
  out.staleLine = out.staleRow.line;
  out.noStaleSuccess = !/^Connected\./.test(out.staleRow.line);
  out.staleIsCheckAgain = out.staleRow.line === 'Settings changed during the check. Check again.';
  out.switchUnchanged = get(PRE + 'compatible.enabled') === false;

  // Fresh check of the current (restored) address passes normally.
  set(PRE + 'compatible.baseURL', STUB);
  await fetch(STUB + '/control/reset', { method: 'POST' });
  const t1 = Date.now();
  doc.getElementById('ztts-test-compatible').click();
  let held2 = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const s = await (await fetch(STUB + '/control/state')).json();
    if (s.held >= 1) { held2 = Date.now() - t1; break; }
  }
  if (!held2) throw new Error('fresh test synthesis never held');
  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  let done2 = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const r = row('compatible');
    if (r.line && !/Testing/.test(r.line)) { done2 = Date.now() - t1; break; }
  }
  out.freshRow = row('compatible');
  out.freshLine = out.freshRow.line;
  out.freshPassed = /^Connected\./.test(out.freshRow.line) && /Synthesis works\./.test(out.freshRow.line);
  out.switchStillOffAfterFreshTest = get(PRE + 'compatible.enabled') === false;
  out.baseURLRestoredToStub = get(PRE + 'compatible.baseURL') === STUB;
  return JSON.stringify(out);
})()
