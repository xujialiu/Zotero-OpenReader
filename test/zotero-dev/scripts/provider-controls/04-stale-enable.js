// 1.6.2 bullet 1 (issue #214): Start Enable, hold the synthesis reply,
// write a different safe address straight to the pref, release the original
// passing reply. Expected: enabled stays false, the changed address is
// kept, and the line reads "Settings changed during the check. Check again."
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

  const fields = (id) => {
    const sec = doc.getElementById('ztts-provider-' + id);
    return Array.from(sec.querySelectorAll('input, menulist, checkbox')).map((el) => ({
      f: (el.getAttribute('preference') || el.id).replace(PRE, ''), d: !!el.disabled,
    }));
  };
  const row = (id) => ({
    toggle: doc.getElementById('ztts-enable-' + id).getAttribute('label'),
    line: doc.getElementById('ztts-test-result-' + id).textContent,
  });

  const out = {};
  if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible must be off at start');
  set(PRE + 'compatible.baseURL', STUB);
  await fetch(STUB + '/control/reset', { method: 'POST' });

  const t0 = Date.now();
  doc.getElementById('ztts-enable-compatible').click();
  let held = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const s = await (await fetch(STUB + '/control/state')).json();
    if (s.held >= 1) { held = Date.now() - t0; break; }
  }
  out.heldAfterMs = held;
  if (!held) throw new Error('synthesis never held');

  // Change the configuration the way a restore or sync would.
  set(PRE + 'compatible.baseURL', ALT);
  await sleep(200);
  out.stillLockedAfterWrite = fields('compatible').every((f) => f.d);
  out.baseURLNow = get(PRE + 'compatible.baseURL');

  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const r = row('compatible');
    if (r.line && !/Checking/.test(r.line) && r.toggle !== 'Checking…') { done = Date.now() - t0; break; }
  }
  out.doneAfterMs = done;
  out.finalEnabledPref = get(PRE + 'compatible.enabled');
  out.finalRow = row('compatible');
  out.finalFields = fields('compatible');
  out.changedURLRetained = get(PRE + 'compatible.baseURL') === ALT;
  out.staleLine = out.finalRow.line;
  out.lineIsStaleMessage = out.finalRow.line === 'Settings changed during the check. Check again.';
  out.stayedOff = out.finalEnabledPref === false;
  out.unlockedAfter = out.finalFields.every((f) => !f.d);
  return JSON.stringify(out);
})()
