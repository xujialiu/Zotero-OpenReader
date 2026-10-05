// Item 4: Enable on the test folder. Clicks the folder's Enable and polls
// the button label, the connection line and the pref every 100 ms into a
// trace (§2), then reads the committed state: enabled true, button
// Disable, the three inputs locked, the password covered with its eye
// greyed, the five rows live, no warning on an https:// address.
(async () => {
  const out = { step: 'enable-test-folder' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document;
    const enable = doc.getElementById('ztts-webdav-enable');
    if (!enable) throw new Error('no enable button');
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;
    const label = () => enable.getAttribute('label');
    const snap = () => ({ t: Date.now() % 100000, label: label(), line: line(), enabled: Zotero.Prefs.get(full('webdav.enabled'), true) });
    const before = snap();

    enable.click();
    const trace = [before];
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await sleep(100);
      const s = snap();
      const last = trace[trace.length - 1];
      if (s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.enabled === true && s.label === 'Disable') break;
    }
    out.trace = trace;

    // The committed state, field by field.
    const inputs = Array.from(doc.getElementById('ztts-webdav-folder')?.querySelectorAll('input') ?? []);
    out.final = {
      line: line(),
      buttonLabel: label(),
      enabled: Zotero.Prefs.get(full('webdav.enabled'), true),
      inputs: inputs.map((i) => ({
        pref: String(i.getAttribute('preference') ?? '').replace(/^extensions\.zotero\.zotero-tts\./, ''),
        disabled: !!i.disabled,
        revealed: i.getAttribute('data-revealed') === 'true',
      })),
      rows: ['ztts-webdav-sync-positions', 'ztts-webdav-sync-settings', 'ztts-webdav-auto-upload', 'ztts-webdav-upload', 'ztts-webdav-download']
        .map((id) => ({ id, disabled: !!doc.getElementById(id)?.disabled })),
    };
    const pwd = inputs.find((i) => /webdav\.password/.test(String(i.getAttribute('preference') ?? '')));
    const eye = pwd?.nextElementSibling;
    out.passwordEye = eye ? { isReveal: eye.getAttribute('class') === 'ztts-reveal', disabled: !!eye.disabled } : null;
    out.lineHasWarning = /Warning: http:\/\//.test(out.final.line ?? '');
    out.lineIsConnected = /^Connected to .+\.$/.test(out.final.line ?? '');
    // Leave the pane where the owner can see the group for the screenshot.
    doc.getElementById('ztts-webdav-folder')?.scrollIntoView({ block: 'start' });
    out.ok = out.final.enabled === true && out.final.buttonLabel === 'Disable'
      && out.lineIsConnected && !out.lineHasWarning
      && out.final.inputs.every((i) => i.disabled)
      && out.passwordEye?.disabled === true && out.final.inputs.find((i) => i.pref === 'webdav.password')?.revealed === false
      && out.final.rows.every((r) => !r.disabled);
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
