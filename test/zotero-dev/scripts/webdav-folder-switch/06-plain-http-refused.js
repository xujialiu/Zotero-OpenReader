// Item 6: a failed Enable stays off, and an http:// address is warned
// about, never refused. Folder off first (Disable), URL at
// http://127.0.0.1:9/dav/ (nothing listens there): Test connection and
// Enable both end their line with 'Connection failed: …' plus the
// warning; Enable leaves webdav.enabled false. The test URL goes back
// and is confirmed.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'plain-http-refused' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document;
    const line = () => doc.getElementById('ztts-webdav-message')?.textContent ?? null;

    // Folder off.
    doc.getElementById('ztts-webdav-enable').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    out.folderOff = Zotero.Prefs.get(full('webdav.enabled'), true) === false;

    // The dead http:// address, through the pref the input is bound to.
    Zotero.Prefs.set(full('webdav.url'), 'http://127.0.0.1:9/dav/', true);
    await sleep(300);
    out.urlShown = doc.querySelector('#ztts-webdav-folder input[preference$="webdav.url"]')?.value ?? null;

    // Test connection: click and poll into a trace.
    doc.getElementById('ztts-webdav-test').click();
    let testLine = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      await sleep(150);
      testLine = line();
      if (testLine && testLine !== 'Testing…') break;
    }
    out.testLine = testLine;
    out.enabledAfterTest = Zotero.Prefs.get(full('webdav.enabled'), true);

    // Enable: the same line, and the folder stays off.
    doc.getElementById('ztts-webdav-enable').click();
    let enableLine = null;
    const t2 = Date.now();
    while (Date.now() - t2 < 10000) {
      await sleep(150);
      enableLine = line();
      if (enableLine && enableLine !== 'Checking…') break;
    }
    out.enableLine = enableLine;
    await sleep(300);
    out.enabledAfterEnable = Zotero.Prefs.get(full('webdav.enabled'), true);
    out.buttonLabel = doc.getElementById('ztts-webdav-enable').getAttribute('label');
    out.inputsDisabled = Array.from(doc.getElementById('ztts-webdav-folder').querySelectorAll('input')).map((i) => !!i.disabled);

    const warning = 'Warning: http:// is not encrypted, so the password and the settings sent here, API keys included, can be read on the way. Use https:// if the server supports it.';
    out.warningExact = warning;
    out.failedPrefix = /^Connection failed: /.test(testLine ?? '');
    out.endsWithWarning = (testLine ?? '').endsWith(warning) && (enableLine ?? '').endsWith(warning);

    // The test URL back, confirmed.
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(300);
    out.urlBackMatchesTestFile = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.folderOff && out.failedPrefix && out.endsWithWarning
      && out.enabledAfterTest === false && out.enabledAfterEnable === false && out.buttonLabel === 'Enable'
      && out.inputsDisabled.every((d) => d === false)
      && out.urlBackMatchesTestFile;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
