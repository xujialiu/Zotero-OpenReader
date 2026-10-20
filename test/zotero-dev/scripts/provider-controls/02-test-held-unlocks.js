// 1.6.1 bullet 2 (issue #214): Test connection on the disabled section —
// while held, the fields are locked; once it finishes they unlock and the
// switch stays off (a passing test never commits).
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = Zotero.ZoteroTTSRun.state.pc.stubBase;
  const reqLoop = (u, w) => { const h = new URL(u).hostname; if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error(w + ' must be loopback, got ' + h); };
  reqLoop(STUB, 'stubBase');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);

  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || !win.document.getElementById('ztts-provider-compatible')) throw new Error('pane not open');
  const doc = win.document;

  const fields = (id) => {
    const sec = doc.getElementById('ztts-provider-' + id);
    return Array.from(sec.querySelectorAll('input, menulist, checkbox')).map((el) => {
      const eye = el.nextElementSibling && el.nextElementSibling.getAttribute && el.nextElementSibling.getAttribute('class') === 'ztts-reveal' ? el.nextElementSibling : null;
      return { f: (el.getAttribute('preference') || el.id).replace(PRE, ''), d: !!el.disabled, eye: eye ? !!eye.disabled : null };
    });
  };
  const row = (id) => ({
    toggle: doc.getElementById('ztts-enable-' + id).getAttribute('label'),
    testDisabled: doc.getElementById('ztts-test-' + id).disabled,
    line: doc.getElementById('ztts-test-result-' + id).textContent,
  });

  const out = {};
  // Off first (01 left it on): through the button, guard refused up front by 00's reader check.
  if (get(PRE + 'compatible.enabled') === true) {
    doc.getElementById('ztts-enable-compatible').click();
    const dlg = null;
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (get(PRE + 'compatible.enabled') === false) break;
    }
    if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible did not turn off' + (dlg ? '' : ''));
    out.disabledFirst = true;
  }
  await fetch(STUB + '/control/reset', { method: 'POST' });

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
  out.heldRow = row('compatible');
  out.heldFields = fields('compatible');
  out.heldEnabledPref = get(PRE + 'compatible.enabled');

  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const r = row('compatible');
    if (r.line && !/Testing/.test(r.line) && r.testDisabled === false) { done = Date.now() - t0; break; }
  }
  out.doneAfterMs = done;
  out.finalEnabledPref = get(PRE + 'compatible.enabled');
  out.finalRow = row('compatible');
  out.finalFields = fields('compatible');
  out.heldAllLocked = out.heldFields.every((f) => f.d);
  out.finalAllUnlocked = out.finalFields.every((f) => !f.d);
  out.lineIsSuccess = /^Connected\./.test(out.finalRow.line);
  out.switchStayedOff = out.finalEnabledPref === false && out.finalRow.toggle === 'Enable';
  return JSON.stringify(out);
})()
