// Item 6.21 (issue #204), cleanup: the two change-trigger prefs back, the
// auto-upload switch off, the test URL back, confirmed. The folder switch
// stays on (the isolated state); the run's final restore has the snapshot.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'slow-upload-cleanup' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    Zotero.Prefs.set(full('readAloud.speedPercent'), state.triggerSpeed.before, true);
    Zotero.Prefs.set(full('readAloud.sentenceDelayMs'), state.triggerDelay.before, true);
    Zotero.Prefs.set(full('webdav.autoUploadSettings'), false, true);
    Zotero.Prefs.set(full('webdav.url'), state.testUrl, true);
    await sleep(300);
    out.speedBack = Zotero.Prefs.get(full('readAloud.speedPercent'), true) === state.triggerSpeed.before;
    out.delayBack = Zotero.Prefs.get(full('readAloud.sentenceDelayMs'), true) === state.triggerDelay.before;
    out.autoUploadOff = Zotero.Prefs.get(full('webdav.autoUploadSettings'), true) === false;
    out.urlBack = Zotero.Prefs.get(full('webdav.url'), true) === state.testUrl;
    out.ok = out.speedBack && out.delayBack && out.autoUploadOff && out.urlBack;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
