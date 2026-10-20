// 1.6.1 bullet 1 (issue #214): while Enable's synthesis reply is held, the
// whole Compatible section is locked — both buttons, every input, the
// secret eyes; another disabled provider stays editable; an account
// (api-key) notification must not unlock the checking section. Releasing
// the passing reply enables Compatible with the success line and the
// fields stay locked (enabled locks).
(async () => {
  const P = Zotero.ZoteroTTSRun.params;
  const PRE = 'extensions.zotero.zotero-tts.';
  const STUB = Zotero.ZoteroTTSRun.state.pc.stubBase;
  const reqLoop = (u, w) => { const h = new URL(u).hostname; if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error(w + ' must be loopback, got ' + h); };
  reqLoop(STUB, 'stubBase');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const get = (n) => Zotero.Prefs.get(n, true);
  const set = (n, v) => Zotero.Prefs.set(n, v, true);

  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || !win.document.getElementById('ztts-provider-compatible')) throw new Error('pane not open');
  const doc = win.document;

  const fields = (id) => {
    const sec = doc.getElementById('ztts-provider-' + id);
    if (!sec) return null;
    return Array.from(sec.querySelectorAll('input, menulist, checkbox')).map((el) => {
      const prefFull = el.getAttribute('preference') || '';
      const eye = el.nextElementSibling && el.nextElementSibling.getAttribute && el.nextElementSibling.getAttribute('class') === 'ztts-reveal' ? el.nextElementSibling : null;
      return {
        f: prefFull ? prefFull.replace(PRE, '') : el.id || el.tagName,
        d: !!el.disabled,
        eye: eye ? !!eye.disabled : null,
        revealed: el.getAttribute('data-revealed') === 'true',
      };
    });
  };
  const row = (id) => ({
    toggle: doc.getElementById('ztts-enable-' + id).getAttribute('label'),
    toggleDisabled: doc.getElementById('ztts-enable-' + id).disabled,
    testDisabled: doc.getElementById('ztts-test-' + id).disabled,
    line: doc.getElementById('ztts-test-result-' + id).textContent,
  });
  const stub = async (p) => (await fetch(STUB + p, { method: p.startsWith('/control/re') ? 'POST' : 'GET' })).json();

  const out = {};
  if (get(PRE + 'compatible.enabled') !== false) throw new Error('compatible must be off at start');
  await fetch(STUB + '/control/reset', { method: 'POST' });

  // A control section: another disabled provider with fields.
  const controlId = ['azure', 'openai-official', 'speechify'].find((id) => get(PRE + id + '.enabled') === false && doc.getElementById('ztts-provider-' + id));
  out.controlId = controlId;
  out.controlEnabled = controlId ? get(PRE + controlId + '.enabled') : 'none';

  // Click Enable, hold the synthesis reply.
  const t0 = Date.now();
  doc.getElementById('ztts-enable-compatible').click();
  let held = null;
  for (let i = 0; i < 80; i++) {
    await sleep(100);
    const s = await stub('/control/state');
    if (s.held >= 1) { held = Date.now() - t0; break; }
  }
  out.heldAfterMs = held;
  if (!held) throw new Error('synthesis reply never held');

  out.heldRow = row('compatible');
  out.heldFields = fields('compatible');
  out.heldControlFields = fields(controlId);
  out.heldEnabledPref = get(PRE + 'compatible.enabled');

  // An account notification must not unlock the checking section.
  Zotero.Notifier.trigger('modify', 'api-key', []);
  await sleep(500);
  out.afterNotifyRow = row('compatible');
  out.afterNotifyFields = fields('compatible');

  // Release the passing reply.
  await fetch(STUB + '/control/release?mode=pass', { method: 'POST' });
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    if (get(PRE + 'compatible.enabled') === true && row('compatible').toggle === 'Disable') { done = Date.now() - t0; break; }
  }
  out.enabledAfterMs = done;
  out.finalEnabledPref = get(PRE + 'compatible.enabled');
  out.finalRow = row('compatible');
  out.finalFields = fields('compatible');
  out.lineIsSuccess = /^Connected\./.test(out.finalRow.line) && /voices available\./.test(out.finalRow.line) && /Synthesis works\./.test(out.finalRow.line);
  out.allHeldLocked = out.heldFields.every((f) => f.d) && out.heldFields.every((f) => f.eye === null || f.eye === true);
  out.controlStayedEditable = out.heldControlFields ? out.heldControlFields.every((f) => !f.d) : null;
  out.notifyDidNotUnlock = out.afterNotifyFields.every((f) => f.d) && out.afterNotifyRow.toggleDisabled === true;
  out.finalStillLocked = out.finalFields.every((f) => f.d);
  return JSON.stringify(out);
})()
