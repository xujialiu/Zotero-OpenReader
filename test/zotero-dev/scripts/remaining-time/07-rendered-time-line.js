(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixture = state.fixtures?.book;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 8000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = itemID => {
    for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === itemID) return reader;
    return null;
  };
  const diag = itemID => {
    try {
      const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      for (const row of report.readers || []) if (row?.itemID === itemID) return row;
    } catch (_) {}
    return null;
  };
  const compact = seconds => '<' + Math.max(1, Math.floor(Math.max(0, Number(seconds) || 0) / 60) + 1) + ' min';
  if (!fixture?.id) throw new Error('Four Thousand Weeks fixture is missing for rendered-line check');
  const reader = readerOf(fixture.id);
  if (!reader) throw new Error('Four Thousand Weeks reader is missing for rendered-line check');
  const host = Zotero.getMainWindow();
  const beforeBounds = { outerWidth: host?.outerWidth || null, outerHeight: host?.outerHeight || null, screenX: host?.screenX || null, screenY: host?.screenY || null };
  if (host?.windowState === 2 && host.restore) host.restore();
  try { Services.focus.focusWindow(host, true); } catch (_) {}
  host?.focus?.();
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  const frame = await waitFor(() => reader._iframeWindow?.document?.querySelector('#ztts-player-frame') || null, 8000);
  if (!frame) throw new Error('player frame is missing for rendered-line check');
  if (frame.hidden) {
    reader._iframeWindow?.document?.querySelector('#ztts-player-toggle')?.click();
    await waitFor(() => !frame.hidden, 5000, 50);
  }
  if (frame.hidden) throw new Error('plugin player frame remained hidden for rendered-line check');
  const frameDoc = frame.contentDocument;
  const root = await waitFor(() => frameDoc?.querySelector('.player') || null, 8000);
  if (!root) throw new Error('player content is missing for rendered-line check');
  const manager = reader._internalReader?._readAloudManager;
  if (manager?.active && !manager.paused) manager.pause();
  const capture = label => {
    const row = diag(fixture.id);
    const remaining = frameDoc?.querySelector('.remaining-time');
    const line = remaining?.querySelector('.remaining-line');
    const rr = remaining?.getBoundingClientRect();
    const lr = line?.getBoundingClientRect();
    const text = String(line?.textContent || '').trim();
    const expected = row?.session?.remainingTime?.status === 'ready' ? `Doc ${compact(row.session.remainingTime.seconds)} · Section ${compact(row.session.remainingTime.sectionSeconds)}` : null;
    return {
      label,
      diagnostic: row?.session?.remainingTime || null,
      lineText: text,
      expectedText: expected,
      textAgrees: !!expected && text === expected,
      hidden: !!remaining?.hidden,
      lineCount: remaining ? remaining.querySelectorAll('.remaining-line').length : 0,
      lineHeight: lr?.height ?? null,
      lineBounds: lr ? { left: lr.left, right: lr.right, top: lr.top, bottom: lr.bottom, width: lr.width, height: lr.height } : null,
      containerBounds: rr ? { left: rr.left, right: rr.right, top: rr.top, bottom: rr.bottom, width: rr.width, height: rr.height } : null,
      durationVisible: !!lr && !!rr && lr.left >= rr.left - 1 && lr.right <= rr.right + 1,
      oneLine: !!lr && lr.height <= 16.001 && (!remaining || remaining.scrollHeight <= remaining.clientHeight + 1),
      layout: frame.getAttribute('data-layout') || null,
      viewport: { width: frame.contentWindow?.innerWidth || null, height: frame.contentWindow?.innerHeight || null },
    };
  };
  const normal = capture('normal');
  let narrow = null;
  let narrowed = false;
  try {
    if (host?.resizeTo && beforeBounds.outerWidth && beforeBounds.outerHeight) {
      host.resizeTo(Math.min(760, beforeBounds.outerWidth), beforeBounds.outerHeight);
      await sleep(500);
      narrowed = true;
    }
  } catch (_) {}
  narrow = capture('narrow');
  const beforeRequests = diag(fixture.id)?.session?.store?.requests ?? null;
  for (let i = 0; i < 50; i++) {
    diag(fixture.id);
    void frameDoc?.querySelector('.remaining-time')?.textContent;
  }
  const afterRequests = diag(fixture.id)?.session?.store?.requests ?? null;
  const out = {
    step: 'rendered-time-line',
    setting: { value: prefs.getBoolPref(prefix + 'readAloud.remainingTime'), user: prefs.prefHasUserValue(prefix + 'readAloud.remainingTime') },
    normal,
    narrow: { possible: narrowed, snapshot: narrow },
    requests: { before: beforeRequests, after: afterRequests, noNew: beforeRequests === afterRequests },
  };
  if (!normal.textAgrees || normal.hidden || normal.lineCount !== 1 || !normal.durationVisible || !normal.oneLine) throw new Error('normal rendered line disagreed with diagnostics: ' + JSON.stringify(out));
  if (narrowed && (!narrow.textAgrees || narrow.hidden || narrow.lineCount !== 1 || !narrow.durationVisible || !narrow.oneLine)) throw new Error('narrow rendered line disagreed with diagnostics: ' + JSON.stringify(out));
  if (!out.requests.noNew) throw new Error('rendered-line snapshots requested new audio: ' + JSON.stringify(out.requests));
  try { if (beforeBounds.outerWidth && beforeBounds.outerHeight) host.resizeTo(beforeBounds.outerWidth, beforeBounds.outerHeight); if (beforeBounds.screenX !== null && beforeBounds.screenY !== null) host.moveTo(beforeBounds.screenX, beforeBounds.screenY); } catch (_) {}
  host?.minimize?.();
  state.renderedResults = out;
  return JSON.stringify(out, null, 1);
})()
