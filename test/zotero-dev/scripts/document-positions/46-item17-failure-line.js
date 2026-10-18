// document-positions item 17, first half (#207): with the plugin's own file
// syncing ok, the version-2 file goes up as xujialiu-positions.json; opening
// Settings → OpenReader pokes both transports; the Sync group's positions line
// must report the Positions File's failure, with its time and error, while the
// own transport stays ok. The current shared file is stashed first; the
// settings window is left open for the second half (31).
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);

  const pre = JSON.parse(await d.positionSync());
  out.pre = { ownOutcome: pre.transport?.lastOutcome, ownTrigger: pre.transport?.lastTrigger, sharedOutcome: pre.shared?.transport?.lastOutcome, sharedUploaded: pre.shared?.transport?.uploaded, sharedItems: pre.shared?.documents?.items };
  if (pre.transport?.lastOutcome !== 'ok') throw new Error('own transport not ok before the swap: ' + JSON.stringify(out.pre));
  if (pre.shared?.transport?.running) throw new Error('shared transport busy');

  // Stash the file as it stands (the run's own state), then the v2 swap.
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const current = await g.text();
  s.sharedFileRunState = current;
  out.runStateBytes = current.length;
  const v2 = '{"format":"xujialiu-positions","version":2,"items":[]}';
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: v2, cache: 'no-store' });
  out.putStatus = put.status;
  const v = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.swapVerified = (await v.text()) === v2;

  // Open Settings on the plugin pane (the pane-open poke), then read the line.
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  const winStarted = Date.now();
  let win = null;
  while (Date.now() - winStarted < 15000) {
    win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) break;
    await sleep(300);
  }
  if (!win) throw new Error('settings window did not open');
  s.settingsWindowOpenedAt = Date.now();
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) { out.paneNavError = String(e).slice(0, 100); }
  let line = null;
  const lineStarted = Date.now();
  while (Date.now() - lineStarted < 15000) {
    line = win.document.getElementById('ztts-sync-positions-status');
    if (line) break;
    await sleep(250);
  }
  if (!line) throw new Error('the positions status line did not appear');
  line.__zttsProbe = 'item17';

  // Wait for the shared sync behind the pane-open poke to fail.
  const waitStarted = Date.now();
  let shared = null;
  while (Date.now() - waitStarted < 30000) {
    await sleep(700);
    const st = JSON.parse(await d.positionSync());
    shared = st.shared?.transport;
    if (shared?.running === false && shared?.lastOutcome === 'error' && (shared?.lastAt ?? 0) > s.settingsWindowOpenedAt - 2000) break;
  }
  out.sharedAfterPoke = { outcome: shared?.lastOutcome, error: shared?.lastError, lastAt: shared?.lastAt, uploaded: shared?.uploaded, skipped: shared?.lastOutcome === 'skipped' };
  const own = JSON.parse(await d.positionSync());
  out.ownAfterPoke = { outcome: own.transport?.lastOutcome, trigger: own.transport?.lastTrigger, lastAt: own.transport?.lastAt };

  // The line's text and time, after a settle beat.
  await sleep(1200);
  out.lineText = String(line.textContent ?? '');
  out.lineHidden = line.hidden === true || line.hidden === 'true';
  const expectedTime = shared?.lastAt ? new Date(shared.lastAt).toLocaleTimeString() : null;
  out.sharedTimeFormatted = expectedTime;
  out.lineCarriesSharedTime = !!expectedTime && out.lineText.includes(expectedTime);
  out.lineMatchesExpected = out.lineText === `Reading positions sync failed ${expectedTime}: ${shared?.lastError ?? ''}`;
  out.probeSet = line.__zttsProbe === 'item17';
  out.paneReloaded = win.closed;
  return JSON.stringify(out);
})()
