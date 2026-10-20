// 1.6.1 bullet 3 (issue #214): Enable with a failing reply — the switch
// stays off, the failure remains visible, the buttons and ordinary inputs
// unlock.
(async () => {
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = Zotero.ZoteroTTSRun.state.pc.stubBase;
  const reqLoop = (u, w) => { const h = new URL(u).hostname; if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error(w + ' must be loopback, got ' + h); };
  reqLoop(STUB, 'stubBase');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);

  const win = Services.wm.getMostRecentWindow('zotero:pref');
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
    toggleDisabled: doc.getElementById('ztts-enable-' + id).disabled,
    testDisabled: doc.getElementById('ztts-test-' + id).disabled,
    line: doc.getElementById('ztts-test-result-' + id).textContent,
  });

  const out = {};
  if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible must be off at start');
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

  await fetch(STUB + '/control/release?mode=fail', { method: 'POST' });
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const r = row('compatible');
    if (r.line && !/Checking/.test(r.line) && r.toggleDisabled === false) { done = Date.now() - t0; break; }
  }
  out.doneAfterMs = done;
  out.finalEnabledPref = get(PRE + 'compatible.enabled');
  out.finalRow = row('compatible');
  out.finalFields = fields('compatible');
  out.switchStayedOff = out.finalEnabledPref === false;
  out.failureVisible = /synthesis failed/.test(out.finalRow.line);
  out.failureLine = out.finalRow.line;
  out.allUnlocked = out.finalFields.every((f) => !f.d);
  return JSON.stringify(out);
})()
