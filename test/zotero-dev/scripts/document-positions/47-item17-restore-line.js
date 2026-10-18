// document-positions item 17, second half (#207): the file back as it stood,
// then — only once 60 s have passed since the failure, inside which a trigger
// is skipped — a tab open+close; the open pane's positions line reads
// `Reading positions synced <time>; …` again within about a second, with no
// reload of the pane. Closes the settings window afterwards.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);

  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || win.closed) throw new Error('the settings window is not open (run 46 first)');
  const line = win.document.getElementById('ztts-sync-positions-status');
  if (!line) throw new Error('the status line is gone from the open pane');
  out.lineStillFailedAtStart = String(line.textContent ?? '').includes('failed');
  out.probeSurvived = line.__zttsProbe === 'item17';
  const failAt = JSON.parse(await d.positionSync()).shared?.transport?.lastAt ?? 0;

  // The file back as it stood before the swap.
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const text = s.sharedFileRunState;
  if (typeof text !== 'string') throw new Error('run-state stash missing (run 46 first)');
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: text, cache: 'no-store' });
  out.putStatus = put.status;
  const v = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.restoreVerified = (await v.text()) === text;

  // The retry window: a trigger inside 60 s of the failure is skipped.
  const readyAt = failAt + 61000;
  const waitMs = Math.max(0, readyAt - Date.now());
  out.waitedMs = waitMs;
  if (waitMs > 0) await sleep(waitMs + 500);
  out.windowWaitedOut = Date.now() >= failAt + 60000;

  // The poke: open and close the fixture's tab.
  const r = await Zotero.Reader.open(f.itemID);
  const started = Date.now();
  while (Date.now() - started < 24000 && !(r?._internalReader && r?._internalReader?._readAloudManager)) await sleep(700);
  const win0 = Zotero.getMainWindow();
  win0.Zotero_Tabs.select(r.tabID);
  await sleep(1200);
  win0.Zotero_Tabs.close(String(r.tabID));
  f.tabID = null;
  const pokeAt = Date.now();
  let shared = null;
  while (Date.now() - pokeAt < 30000) {
    await sleep(400);
    const st = JSON.parse(await d.positionSync());
    shared = st.shared?.transport;
    if (shared?.running === false && shared?.lastOutcome === 'ok' && (shared?.lastAt ?? 0) > pokeAt - 2500) break;
  }
  out.sharedAfterPoke = { outcome: shared?.lastOutcome, lastAt: shared?.lastAt, uploaded: shared?.uploaded };
  const own = JSON.parse(await d.positionSync());
  out.ownAfterPoke = { outcome: own.transport?.lastOutcome, lastAt: own.transport?.lastAt };

  // The line within about a second of the sync — polled at 150 ms.
  const lineStarted = Date.now();
  let recovered = null;
  while (Date.now() - lineStarted < 6000) {
    const t = String(line.textContent ?? '');
    if (!t.includes('failed') && t.includes('Reading positions synced')) { recovered = { afterMs: Date.now() - (shared?.lastAt ?? pokeAt), text: t }; break; }
    await sleep(150);
  }
  out.recoveredLine = recovered ?? null;
  out.recoveredWithinAboutSecond = !!recovered && recovered.afterMs <= 1500;
  out.lineHidden = line.hidden === true || line.hidden === 'true';
  out.probeSurvivedAfter = line.__zttsProbe === 'item17';
  out.expectedRecoveredText = shared?.lastAt ? (() => {
    const st = JSON.parse(`{"at":${shared.lastAt}}`);
    return 'Reading positions synced ' + new Date(st.at).toLocaleTimeString();
  })() : null;
  out.lineStartsWithExpected = !!recovered && !!out.expectedRecoveredText && recovered.text.startsWith(out.expectedRecoveredText);

  // The window closed again (as found).
  try { win.close(); } catch (e) { out.winCloseError = String(e).slice(0, 80); }
  const closedStarted = Date.now();
  while (Date.now() - closedStarted < 8000 && !Services.wm.getMostRecentWindow('zotero:pref')?.closed) await sleep(300);
  await sleep(800);
  out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
  return JSON.stringify(out);
})()
