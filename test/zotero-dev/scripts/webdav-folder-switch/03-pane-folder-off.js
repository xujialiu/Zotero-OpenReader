// Item 3: the pane with the folder off. Opens the settings window fresh
// (a reinstall leaves the old pane), navigates to the plugin's pane, and
// reads: Enable before Test connection in the DOM, the button labels, the
// three folder inputs open, the five rows that use the folder greyed, the
// three switches' prefs untouched, the password covered with its eye free.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'pane-folder-off' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Close any open settings window and wait it down to null.
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) { w.close(); let n = 0; while (Services.wm.getMostRecentWindow('zotero:pref') && n++ < 50) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null; n = 0;
    while (n++ < 60) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) break; await sleep(100); }
    if (!win) throw new Error('no settings window opened');
    state.prefsWindowOpen = true;
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    n = 0;
    while (n++ < 60 && !win.document.getElementById('ztts-webdav-enable')) await sleep(100);
    const doc = win.document;
    const byId = (id) => doc.getElementById(id);
    out.paneReady = !!byId('ztts-webdav-enable');

    // Enable before Test connection in the DOM.
    const enable = byId('ztts-webdav-enable');
    const test = byId('ztts-webdav-test');
    out.order = {
      enableThenTest: !!(enable && test && (enable.compareDocumentPosition(test) & win.Node.DOCUMENT_POSITION_FOLLOWING)),
    };
    out.labels = {
      enable: enable?.getAttribute('label') ?? null,
      test: test?.querySelector?.('label')?.getAttribute('value') ?? test?.getAttribute('label') ?? '(data-l10n)',
      enableDisabled: enable?.disabled ?? null,
      testDisabled: test?.disabled ?? null,
    };

    // The folder's three inputs, and the password's cover and eye.
    const inputs = Array.from(byId('ztts-webdav-folder')?.querySelectorAll('input') ?? []);
    out.inputs = inputs.map((i) => ({
      pref: String(i.getAttribute('preference') ?? '').replace(/^extensions\.zotero\.zotero-tts\./, ''),
      disabled: !!i.disabled,
      type: i.type,
      revealed: i.getAttribute('data-revealed') === 'true',
    }));
    const pwd = inputs.find((i) => /webdav\.password/.test(String(i.getAttribute('preference') ?? '')));
    const eye = pwd?.nextElementSibling;
    out.passwordEye = eye ? { isReveal: eye.getAttribute('class') === 'ztts-reveal', disabled: !!eye.disabled } : null;

    // The five rows that use the folder, greyed while it is off.
    const rows = ['ztts-webdav-sync-positions', 'ztts-webdav-sync-settings', 'ztts-webdav-auto-upload', 'ztts-webdav-upload', 'ztts-webdav-download'];
    out.rows = rows.map((id) => ({ id, disabled: !!byId(id)?.disabled }));

    // The three switches' prefs, read before and after a beat — unchanged by the greying.
    const read = () => ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings'].map((k) => Zotero.Prefs.get(full(k), true));
    out.switchPrefs = { before: read() };
    await sleep(400);
    out.switchPrefs.after = read();

    // The WebDAV line and the folder's switch as the settings read now.
    out.messageLine = byId('ztts-webdav-message')?.textContent ?? null;
    out.enabledPref = Zotero.Prefs.get(full('webdav.enabled'), true);

    // Leave the pane scrolled to the WebDAV group for the screenshot.
    byId('ztts-webdav-folder')?.scrollIntoView({ block: 'start' });
    out.ok = out.paneReady && out.order.enableThenTest && out.labels.enable === 'Enable'
      && out.inputs.every((i) => !i.disabled)
      && out.rows.every((r) => r.disabled)
      && out.passwordEye?.disabled === false;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
