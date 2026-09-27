(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = id => { const readers = Zotero.Reader?._readers || []; for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === id) return readers[i]; return null; };
  const diag = id => { try { const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); const rows = report.readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === id) return rows[i]; } catch (_) {} return null; };
  const fixture = state.fixtures?.epub;
  const reader = fixture ? readerOf(fixture.id) : null;
  if (!reader) throw new Error('EPUB reader from scope run is missing');
  const host = Zotero.getMainWindow();
  const hostBefore = state.isolation?.hostBefore || null;
  if (host?.windowState === 2 && host.restore) host.restore();
  host?.focus?.();
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  const doc = reader._iframeWindow?.document;
  const existingFrame = doc?.getElementById('ztts-player-frame');
  if (existingFrame?.hidden) doc?.getElementById('ztts-player-toggle')?.click();
  const frame = await waitFor(() => { const candidate = doc?.getElementById('ztts-player-frame'); return candidate && !candidate.hidden && candidate.contentDocument?.querySelector('.player') ? candidate : null; }, 15000);
  if (!frame) throw new Error('EPUB player frame is not open');
  const child = frame.contentWindow;
  const frameDoc = frame.contentDocument;
  const manager = reader._internalReader?._readAloudManager;
  const trustedToggle = () => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window, K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(win);
    const result = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    tip.endInputTransaction?.();
    return result;
  };
  const snapshot = () => {
    const root = frame.contentDocument?.querySelector('.player');
    const remaining = frame.contentDocument?.querySelector('.remaining-time');
    const frameRect = frame.getBoundingClientRect();
    const rootRect = root?.getBoundingClientRect();
    const rows = [];
    const lineNodes = remaining?.querySelectorAll('.remaining-line') || [];
    for (let i = 0; i < lineNodes.length; i++) {
      const line = lineNodes[i], name = line.querySelector('.remaining-name'), duration = line.querySelector('.remaining-duration');
      const lr = line.getBoundingClientRect(), nr = name?.getBoundingClientRect(), dr = duration?.getBoundingClientRect();
      const rr = remaining?.getBoundingClientRect();
      const durationVisible = dr ? dr.left >= lr.left - 1 && dr.right <= lr.right + 1 && dr.right <= (rr?.right || lr.right) + 1 : lr.left >= (rr?.left || lr.left) - 1 && lr.right <= (rr?.right || lr.right) + 1;
      rows.push({ text: String(line.textContent || ''), name: String(name?.textContent || ''), duration: String(duration?.textContent || ''), height: lr.height, durationVisible, nameEllipsis: name ? getComputedStyle(name).textOverflow : null });
    }
    if (!rows.length && remaining) {
      const spans = remaining.querySelectorAll('span');
      for (let i = 0; i < spans.length; i++) rows.push({ text: String(spans[i].textContent || ''), name: String(spans[i].textContent || ''), duration: '', durationVisible: true, nameEllipsis: getComputedStyle(spans[i]).textOverflow });
    }
    const lines = rows.map(row => row.text);
    const controls = root?.querySelector('.controls');
    const controlOrder = controls ? Array.from(controls.children).map(node => node.matches?.('[data-adjust="volume"]') ? 'volume' : node.className || node.tagName) : [];
    const remainingIndex = controlOrder.indexOf('remaining-time');
    const volumeIndex = controlOrder.indexOf('volume');
    return {
      frame: { layout: frame.getAttribute('data-layout'), styleHeight: frame.style.height, styleWidth: frame.style.width, rect: { width: frameRect.width, height: frameRect.height } },
      root: root ? { className: root.className, rect: { width: rootRect.width, height: rootRect.height }, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight } : null,
      remaining: remaining ? { hidden: !!remaining.hidden, title: remaining.title, aria: remaining.getAttribute('aria-label'), lines, rows, lineCount: rows.length, lineHeights: rows.map(row => row.height ?? null), durationVisible: rows.every(row => row.durationVisible), rect: (() => { const r = remaining.getBoundingClientRect(); return { width: r.width, height: r.height }; })(), scrollWidth: remaining.scrollWidth, clientWidth: remaining.clientWidth } : null,
      controlOrder,
      remainingAfterVolume: remainingIndex >= 0 && volumeIndex >= 0 && remainingIndex === volumeIndex + 1,
      floatingOrder: root ? Array.from(root.children).map(node => node.className || node.tagName) : [],
      manager: { active: !!manager?.active, paused: !!manager?.paused, voice: manager?.selectedVoiceID || null },
    };
  };
  const out = { step: 'ui-setting-layout', before: snapshot(), settingToggle: {}, layouts: {}, widths: {}, longTitle: null };
  if (!out.before.remaining || out.before.remaining.hidden || !out.before.remaining.lines.length) throw new Error('remaining-time row was not visible before toggle');
  const prefKey = prefix + 'readAloud.remainingTime';

  // Exercise the actual pane checkbox while a paused session remains active.
  let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { try { prefWin.close(); } catch (_) {} await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000); }
  const opened = Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); if (opened?.then) await opened;
  prefWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 8000);
  if (!prefWin) throw new Error('settings window did not open for toggle');
  try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (_) {}
  const checkbox = await waitFor(() => prefWin.document.querySelector('.ztts-pane [data-l10n-id="ztts-remaining-time"]'), 10000);
  if (!checkbox) throw new Error('remaining-time checkbox missing for toggle');
  if (!checkbox.checked) checkbox.click();
  await waitFor(() => prefs.getBoolPref(prefKey) === true && checkbox.checked, 3000);
  checkbox.click();
  const off = await waitFor(() => prefs.getBoolPref(prefKey) === false && !!frame.contentDocument?.querySelector('.remaining-time')?.hidden, 5000);
  const offSnapshot = snapshot();
  checkbox.click();
  const on = await waitFor(() => prefs.getBoolPref(prefKey) === true && !frame.contentDocument?.querySelector('.remaining-time')?.hidden, 5000);
  const onSnapshot = snapshot();
  out.settingToggle = { off, on, offSnapshot, onSnapshot, activeStayed: offSnapshot.manager.active === out.before.manager.active, pausedStayed: offSnapshot.manager.paused === out.before.manager.paused, linesRestored: onSnapshot.remaining?.lines?.length === out.before.remaining.lines.length };
  try { prefWin.close(); } catch (_) {}
  await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000);
  if (!off || !on || !out.settingToggle.activeStayed || !out.settingToggle.pausedStayed || !out.settingToggle.linesRestored) throw new Error('setting toggle changed reading or did not restore row: ' + JSON.stringify(out.settingToggle));

  // Exercise an intentionally long section title through the live outline.
  // The product line keeps generic Doc/Section labels, so the title must not
  // displace either duration even when the underlying heading is long.
  const internal = reader._internalReader;
  const managerWaived = Components.utils.waiveXrays(manager);
  let originalOutline = null;
  try {
    const structure = Components.utils.waiveXrays(internal._sdt.structure);
    const outline = structure.catalog.outline;
    if (outline?.length && outline[0]) {
      originalOutline = outline;
      const altered = JSON.parse(JSON.stringify(outline));
      const longTitle = 'A deliberately long section title that must stay out of the compact display';
      altered[0].children[0].title = longTitle;
      structure.catalog.outline = Components.utils.cloneInto(altered, reader._iframeWindow);
      try { managerWaived.repositionTo(0); } catch (_) {}
      await sleep(250);
      if (manager.active && !manager.paused) manager.pause();
      await sleep(200);
    }
  } catch (_) {}
  const longSnapshot = snapshot();
  out.longTitle = { mutationApplied: !!originalOutline, title: longSnapshot.remaining?.title || null, lines: longSnapshot.remaining?.lines || [], durationVisible: longSnapshot.remaining?.durationVisible, lineCount: longSnapshot.remaining?.lineCount, lineHeights: longSnapshot.remaining?.lineHeights || [] };
  if (originalOutline) { try { Components.utils.waiveXrays(internal._sdt.structure).catalog.outline = originalOutline; } catch (_) {} }
  if (originalOutline && (out.longTitle.durationVisible === false || out.longTitle.lineCount !== 1 || !out.longTitle.lines[0]?.includes('Doc') || !out.longTitle.lines[0]?.includes('Section') || out.longTitle.lines[0]?.includes('deliberately long'))) throw new Error('long section title changed the compact generic line: ' + JSON.stringify(out.longTitle));

  const setLayout = async layout => {
    const fn = Components.utils.waiveXrays(child).zttsSwitchLayout;
    if (typeof fn !== 'function') throw new Error('player layout export missing');
    fn(layout);
    const ok = await waitFor(() => frame.getAttribute('data-layout') === layout && frame.contentDocument?.querySelector('.player'), 5000);
    if (!ok) throw new Error('layout did not switch to ' + layout);
    await sleep(150);
  };
  const measure = (layout, stateName) => ({ layout, stateName, snapshot: snapshot(), options: !!frame.contentDocument?.querySelector('.options-toggle'), menus: !!frame.contentDocument?.querySelector('.layout-menu') });
  const menuSnapshot = async selector => {
    const button = frame.contentDocument.querySelector(selector);
    if (!button) throw new Error('menu button missing: ' + selector);
    button.click();
    const popover = await waitFor(() => frame.contentDocument.querySelector('.popover'), 3000, 50);
    if (!popover) throw new Error('menu did not open: ' + selector);
    const rect = popover.getBoundingClientRect();
    const viewport = { width: child.innerWidth, height: child.innerHeight };
    const result = { selector, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, side: popover.dataset.side || null, viewport, inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1, itemCount: popover.querySelectorAll('button').length };
    button.click();
    await waitFor(() => !frame.contentDocument.querySelector('.popover'), 2000, 50);
    return result;
  };
  for (const layout of ['top', 'A', 'B']) {
    await setLayout(layout);
    if (layout === 'B') {
      const root = frame.contentDocument.querySelector('.player');
      const options = frame.contentDocument.querySelector('.options-toggle');
      if (!root.classList.contains('collapsed')) options.click();
      await sleep(150);
      out.layouts[layout + '-collapsed'] = measure(layout, 'collapsed');
      if (root.classList.contains('collapsed')) options.click();
      await sleep(150);
      out.layouts[layout + '-expanded'] = measure(layout, 'expanded');
      out.layouts[layout + '-options-toggle'] = { ariaExpanded: options.getAttribute('aria-expanded'), collapsedHeight: out.layouts[layout + '-collapsed'].snapshot.frame.rect.height, expandedHeight: out.layouts[layout + '-expanded'].snapshot.frame.rect.height };
      out.layouts[layout + '-layout-menu'] = await menuSnapshot('.layout-menu');
      const move = Components.utils.waiveXrays(child).zttsMovePreview;
      const beforeRect = frame.getBoundingClientRect();
      if (typeof move === 'function') move(12, 8);
      await sleep(100);
      const movedRect = frame.getBoundingClientRect();
      if (typeof move === 'function') move(-12, -8);
      out.layouts[layout + '-drag'] = { moved: Math.abs(movedRect.left - beforeRect.left) > 1 || Math.abs(movedRect.top - beforeRect.top) > 1, before: { left: beforeRect.left, top: beforeRect.top }, after: { left: movedRect.left, top: movedRect.top } };
    } else {
      out.layouts[layout] = measure(layout, 'bar');
    }
  }
  const bars = [out.layouts.top.snapshot, out.layouts.A.snapshot];
  if (!bars.every(value => value.frame.rect.height === 34 && value.root?.rect.height === 34 && value.remaining?.durationVisible && value.remaining?.lineCount === 1 && value.remaining?.rect.height === 16 && value.remainingAfterVolume)) throw new Error('top/bottom bar order, height or duration visibility failed: ' + JSON.stringify(out.layouts));
  if (out.layouts['B-collapsed'].snapshot.frame.rect.height !== 128 || out.layouts['B-expanded'].snapshot.frame.rect.height !== 222) throw new Error('floating panel height did not allocate the remaining-time row: ' + JSON.stringify(out.layouts));
  if (!out.layouts['B-collapsed'].snapshot.floatingOrder.includes('remaining-time') || !out.layouts['B-expanded'].snapshot.floatingOrder.includes('remaining-time')) throw new Error('floating panel did not mount remaining-time above controls: ' + JSON.stringify(out.layouts));
  if (!out.layouts['B-drag'].moved || !out.layouts['B-layout-menu'].inViewport || out.layouts['B-layout-menu'].itemCount !== 3 || out.layouts['B-options-toggle'].ariaExpanded !== 'true') throw new Error('floating menu/drag geometry failed: ' + JSON.stringify(out.layouts));

  // Compare ordinary and narrow host widths, restoring the host bounds before
  // returning to the minimized bridge state.
  await setLayout('top');
  const normalWidth = host?.outerWidth || null;
  out.widths.normal = { hostWidth: normalWidth, player: snapshot() };
  let narrowPossible = false;
  try {
    if (host?.resizeTo && normalWidth) { host.resizeTo(Math.min(760, normalWidth), host.outerHeight); await sleep(500); narrowPossible = true; }
  } catch (_) {}
  out.widths.narrow = { hostWidth: host?.outerWidth || null, player: snapshot(), possible: narrowPossible };
  if (narrowPossible && (out.widths.narrow.player.remaining?.hidden || !out.widths.narrow.player.remaining?.durationVisible || out.widths.narrow.player.remaining?.lineCount !== 1 || out.widths.narrow.player.remaining?.rect.height !== 16)) throw new Error('remaining-time row or duration disappeared at narrow width: ' + JSON.stringify(out.widths.narrow));

  // Compact text: the final segment is a finite sub-minute estimate; playing
  // it through the real manager must replace that line with Finished.
  try { manager.repositionTo((reader._internalReader?._readAloudSegments?.segments?.length || 1) - 1); } catch (_) {}
  await sleep(250);
  if (manager.active && !manager.paused) manager.pause();
  const subminute = await waitFor(() => {
    const row = diag(fixture.id);
    return row?.session?.remainingTime?.status === 'ready' && Number(row.session.remainingTime.seconds) < 60 ? row : null;
  }, 5000, 75);
  await waitFor(() => snapshot().remaining?.lines?.[0]?.includes('<1 min'), 3000, 75);
  out.compact = { subminute: subminute?.session?.remainingTime || null, subminuteLine: snapshot().remaining?.lines?.[0] || null, playKeys: null, finished: null, finishedLine: null };
  if (!subminute || !out.compact.subminuteLine?.includes('<1 min') || out.compact.subminuteLine.includes('<0 min') || out.compact.subminuteLine.includes('sec')) throw new Error('sub-minute compact line failed: ' + JSON.stringify(out.compact));
  out.compact.playKeys = trustedToggle();
  const finished = await waitFor(() => { const row = diag(fixture.id); return row?.session?.remainingTime?.status === 'finished' ? row : null; }, 7000, 75);
  out.compact.finished = finished?.session?.remainingTime || null;
  await waitFor(() => snapshot().remaining?.lines?.[0] === 'Finished', 3000, 75);
  out.compact.finishedLine = snapshot().remaining?.lines?.[0] || null;
  if (!finished || finished.session.remainingTime.seconds !== 0 || out.compact.finishedLine !== 'Finished') throw new Error('finished compact line failed: ' + JSON.stringify(out.compact));
  if (manager.active && !manager.paused) manager.pause();
  try {
    if (hostBefore && host?.resizeTo) host.resizeTo(hostBefore.outerWidth, hostBefore.outerHeight);
    if (hostBefore && host?.moveTo) host.moveTo(hostBefore.screenX, hostBefore.screenY);
  } catch (_) {}
  if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
  state.uiResults = out;
  return JSON.stringify(out, null, 1);
})()
