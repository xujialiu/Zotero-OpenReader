// Cleanup (item 1c.6) and restoration. In this order, each step on its own try/catch so a failure
// never skips the restoration after it: diagnostics.l10n() with the settings window still open
// (blank, questionless); the settings window closed; the fixture's popup and tab closed and its item
// erased; the dynamic documentVoices records and every snapshotted pref put back (user-value state
// included; reader.readAloudVoices, then readAloud.memory last); the position store compared with the
// baseline BEFORE the WebDAV folder goes back on (rows, loaded, local entries and the shared counts must
// equal it; `deletions` is reported, not gated: erasing a fixture whose position row was saved by reading
// adds one LOCAL tombstone that never leaves the machine, and cannot be taken back through the bridge);
// the folder switch restored last, and ONLY if the fixture, the prefs and the position store are clean,
// its transports waited for; the on-disk snapshot compared once more with the prefs; the debug store read for dead objects and plugin errors, then restored; the console's
// plugin errors since the run began sorted into the two planned refusals (the 402 of 1c.4, the
// model-gone of 1c.3) and anything else; the selected tab and the host's bounds put back, and the
// host minimized (the owner's standing exception). The owner's closed player is never reopened.
// params: none. state: reads snap, docs, positionBefore, errorsBefore, debugBefore, host, fixture, runStart.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const errors = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 120) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const step = async (name, fn) => { try { return await fn(); } catch (e) { errors.push(name + ': ' + String(e && e.message || e)); return null; } };
  if (!state.snap) throw new Error('no baseline snapshot: nothing to restore from');
  const snap = state.snap, docs = state.docs || {};
  const d = Zotero.ZoteroTTS?.diagnostics;
  const out = { steps: {} };
  const host = Services.wm.getMostRecentWindow('navigator:browser');

  // 1. l10n with the pane open, then the settings window closed
  out.steps.l10n = await step('l10n', async () => {
    const l = JSON.parse(await d.l10n());
    return { paneOpen: !!l.pane, elements: l.pane?.elements ?? null, blank: l.pane?.blank ?? null, questionless: l.pane?.questionless ?? null, zoteroLocale: l.zoteroLocale, source: l.source };
  });
  out.steps.settingsWindow = await step('settings window', async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) win.close();
    const gone = await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 8000);
    return { wasOpen: !!win, closed: !!gone };
  });

  // 2. The fixture: popup, tab, item. The owner's tab is selected first.
  out.steps.fixture = await step('fixture', async () => {
    const id = state.fixture?.itemID;
    if (!id) return { fixture: false };
    if (host?.Zotero_Tabs?.select && state.host?.selectedTab && state.host.selectedTab !== state.fixture.tabID) host.Zotero_Tabs.select(state.host.selectedTab);
    const readers = [];
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === id) readers.push(list[i]);
    for (const reader of readers) {
      const m = reader._internalReader?._readAloudManager;
      if (m?.active) { reader._internalReader.toggleReadAloudPopup(false); await waitFor(() => !m.active, 8000); }
      if (reader.tabID && host?.Zotero_Tabs?.close) host.Zotero_Tabs.close(reader.tabID);
    }
    await waitFor(() => { const l = Zotero.Reader?._readers || []; for (let i = 0; i < l.length; i++) if (l[i]?.itemID === id && !l[i]?._window?.closed && l[i]?.tabID) return false; return true; }, 10000);
    const item = Zotero.Items.get(id);
    if (item) await item.eraseTx();
    for (let i = (Zotero.Reader?._readers || []).length - 1; i >= 0; i--) {
      const r = Zotero.Reader._readers[i];
      if (r?.itemID === id && (r?._window?.closed || r?.tabID === null)) Zotero.Reader._readers.splice(i, 1);
    }
    let stillReader = false;
    const l2 = Zotero.Reader?._readers || [];
    for (let i = 0; i < l2.length; i++) if (l2[i]?.itemID === id) stillReader = true;
    return { itemID: id, readersClosed: readers.length, itemGone: !Zotero.Items.get(id), readerGone: !stillReader };
  });

  // 3. Dynamic document records and the snapshotted prefs
  const read = key => { const t = p.getPrefType(key); let v = null; try { if (t === p.PREF_BOOL) v = p.getBoolPref(key); else if (t === p.PREF_INT) v = p.getIntPref(key); else if (t === p.PREF_STRING) v = p.getStringPref(key); } catch (_) {} return { type: t, hasUser: p.prefHasUserValue(key), value: v }; };
  const same = rec => { const c = read(rec.key); return c.hasUser === rec.hasUser && (!rec.hasUser || c.value === rec.value); };
  const put = rec => {
    if (same(rec)) return false;
    if (!rec.hasUser) { p.clearUserPref(rec.key); return true; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value));
    else p.setStringPref(rec.key, String(rec.value ?? ''));
    return true;
  };
  out.steps.documentRecords = await step('document records', async () => {
    const branch = p.getBranch(prefix + 'documentVoices.');
    let removed = 0, written = 0;
    for (const child of branch.getChildList('')) if (!Object.prototype.hasOwnProperty.call(docs, child)) { branch.clearUserPref(child); removed++; }
    for (const [child, value] of Object.entries(docs)) { let now = null; try { now = branch.getStringPref(child); } catch (_) {} if (now !== value) { branch.setStringPref(child, value); written++; } }
    return { baseline: Object.keys(docs).length, removed, rewritten: written };
  });
  const last = ['reader.readAloudVoices', 'readAloud.memory'];
  const rest = Object.keys(snap).filter(n => !last.includes(n) && !n.startsWith('webdav.'));
  out.steps.prefs = await step('prefs', async () => {
    const wrote = [];
    for (const n of [...rest, ...last]) if (put(snap[n])) wrote.push(n);
    const mismatched = Object.keys(snap).filter(n => !n.startsWith('webdav.') && !same(snap[n]));
    const fish = {};
    for (const n of ['fish.enabled', 'fish.model', 'fish.freeOnly', 'fish.voices', 'fish.includeOfficial', 'fish.includeOwn', 'fish.includeManual', 'readAloud.volume']) {
      const c = read(prefix + n);
      fish[n] = { hasUser: c.hasUser, ...(typeof c.value === 'string' && n === 'fish.voices' ? { length: c.value.length } : { value: c.value }) };
    }
    return { rewritten: wrote, mismatched, now: fish };
  });

  // 4. The position store against the baseline, before the folder goes back on
  const idle = async () => {
    const pos = JSON.parse(await d.position()), sync = JSON.parse(await d.positionSync());
    const set = JSON.parse(await d.settingsSync()), up = JSON.parse(await d.settingsUpload());
    return { pos, sync, set, up, idle: pos.store?.queued === 0 && pos.store?.writing === false && pos.store?.lastError === null && sync.transport?.running === false && sync.shared?.transport?.running === false && set.transport?.pendingChange === false && set.transport?.running === false && up.autoUpload?.pending === false };
  };
  out.steps.positions = await step('positions', async () => {
    await waitFor(async () => (await idle()).idle, 15000, 200);
    const a = await idle(), b = state.positionBefore;
    const now = { rows: a.pos.database?.rows, loaded: a.pos.store?.loaded, localEntries: a.sync.localEntries, sharedDocuments: a.sync.shared?.documents };
    const was = { rows: b.rows, loaded: b.loaded, localEntries: b.localEntries, sharedDocuments: b.sharedDocuments };
    return { baseline: was, now, deletions: { before: b.deletions, now: a.pos.store?.deletions, added: (a.pos.store?.deletions ?? 0) - (b.deletions ?? 0) }, clean: a.idle && JSON.stringify(now) === JSON.stringify(was), idle: a.idle, folder: a.sync.folder };
  });
  out.steps.snapshotFile = await step('snapshot file', async () => {
    const file = JSON.parse(await IOUtils.readUTF8(PathUtils.join(Zotero.ZoteroTTSRun.params.tmpDir, 'fish-model', 'snapshot.json')));
    const mismatched = Object.keys(file.snap).filter(n => !n.startsWith('webdav.') && !same(file.snap[n]));
    return { prefs: Object.keys(file.snap).length, mismatched };
  });

  // 5. The WebDAV folder switch, last
  out.steps.folder = await step('folder', async () => {
    const rec = snap['webdav.enabled'];
    const f = out.steps;
    const localClean = !errors.length && f.fixture?.itemGone !== false && f.fixture?.readerGone !== false && f.prefs?.mismatched?.length === 0 && f.snapshotFile?.mismatched?.length === 0 && f.positions?.clean === true;
    if (!localClean) return { skipped: 'local state is not clean: the folder stays OFF and its switch is still owed', snapshot: { value: rec.value, hasUser: rec.hasUser } };
    const wrote = put(rec);
    await sleep(500);
    const settled = await waitFor(async () => (await idle()).idle, 40000, 300);
    const a = await idle();
    const sync = a.sync.transport || {};
    return {
      snapshot: { value: rec.value, hasUser: rec.hasUser }, rewritten: wrote, now: { value: read(prefix + 'webdav.enabled').value, hasUser: read(prefix + 'webdav.enabled').hasUser },
      folder: { positionSync: a.sync.folder, settingsUpload: a.up.folder, settingsSync: a.set.folder }, transportsIdle: !!settled,
      lastSync: { trigger: sync.lastTrigger ?? null, outcome: sync.lastOutcome ?? null, adopted: sync.adopted ?? null, dropped: sync.dropped ?? null, uploaded: sync.uploaded ?? null, shared: { outcome: a.sync.shared?.transport?.lastOutcome ?? null, uploaded: a.sync.shared?.transport?.uploaded ?? null, adopted: a.sync.shared?.transport?.adopted ?? null, dropped: a.sync.shared?.transport?.dropped ?? null } },
      lastErrors: { store: a.pos.store?.lastError ?? null, positions: a.sync.transport?.lastError ?? null, shared: a.sync.shared?.transport?.lastError ?? null, settings: a.set.transport?.lastError ?? null, upload: a.up.autoUpload?.lastError ?? null },
      switches: ['webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings', 'webdav.enabledMigrated'].map(n => ({ n, same: same(snap[n]) })),
    };
  });

  // 6. The debug store and the console
  out.steps.debugStore = await step('debug store', async () => {
    const text = String(await Zotero.Debug.get());
    const at = text.indexOf('=========================================================');
    const body = at >= 0 ? text.slice(text.indexOf('\n\n', at) + 2) : text;
    const lines = body ? body.split('\n\n') : [];
    const plugin = lines.filter(l => l.includes('[zotero-tts]'));
    const dead = lines.filter(l => /dead object/i.test(l));
    const levelOne = lines.filter(l => /^\(1\)/.test(l));
    const family = l => /refused the request \(402\)/.test(l) ? 'planned 402 (1c.4)' : /no longer lists the model s9-not-a-model/.test(l) ? 'planned model-gone (1c.3)' : 'other';
    const fams = {};
    for (const l of levelOne) { const f = family(l); fams[f] = (fams[f] || 0) + 1; }
    const others = levelOne.filter(l => family(l) === 'other').map(l => l.slice(0, 220)).slice(0, 8);
    const restored = state.debugBefore === false && Zotero.Debug.storing ? (Zotero.Debug.setStore(false), true) : false;
    return { entries: lines.length, pluginLines: plugin.length, deadObjectLines: dead.length, errorLevelEntries: levelOne.length, errorLevelFamilies: fams, otherErrorLevel: others, storeTurnedOff: restored, storingNow: !!Zotero.Debug.storing };
  });
  out.steps.console = await step('console', async () => {
    const rows = [];
    for (const m of Services.console.getMessageArray() || []) {
      let e = null; try { e = m.QueryInterface(Ci.nsIScriptError); } catch (_) { continue; }
      if (e.timeStamp < state.runStart) continue;
      rows.push({ t: e.timeStamp, source: String(e.sourceName || '').split('/').pop().slice(0, 40), msg: String(e.errorMessage || e.message || '').slice(0, 170) });
    }
    const fam = r => /refused the request \(402\)/.test(r.msg) ? 'planned 402 (1c.4)' : /no longer lists the model s9-not-a-model/.test(r.msg) ? 'planned model-gone (1c.3)' : /uncaught exception: undefined/.test(r.msg) ? 'noise: uncaught exception: undefined' : /Missing resource in locale/.test(r.msg) ? 'noise: missing locale resource' : /selectionRanges/.test(r.msg) ? 'noise: selectionRanges' : /NS_ERROR_FILE_UNRECOGNIZED_PATH/.test(r.msg) ? 'noise: UNRECOGNIZED_PATH' : 'other';
    const fams = {};
    for (const r of rows) { const f = fam(r); fams[f] = (fams[f] || 0) + 1; }
    const others = rows.filter(r => fam(r) === 'other').slice(0, 10);
    return { sinceRunStart: rows.length, families: fams, others, pluginSourced: rows.filter(r => /zotero-tts/.test(r.source) || /SynthesisError|zotero-tts/.test(r.msg)).length };
  });

  // 7. Tab, bounds, minimize
  out.steps.host = await step('host', async () => {
    const b = state.host;
    if (host?.Zotero_Tabs?.select && b?.selectedTab) host.Zotero_Tabs.select(b.selectedTab);
    const wasMinimized = host.windowState === host.STATE_MINIMIZED;
    let bounds = { x: host.screenX, y: host.screenY, w: host.outerWidth, h: host.outerHeight };
    let sameBounds = !!b && bounds.x === b.x && bounds.y === b.y && bounds.w === b.w && bounds.h === b.h;
    if (b && !sameBounds && host.windowState === host.STATE_NORMAL) { host.moveTo(b.x, b.y); host.resizeTo(b.w, b.h); await sleep(300); bounds = { x: host.screenX, y: host.screenY, w: host.outerWidth, h: host.outerHeight }; sameBounds = bounds.x === b.x && bounds.y === b.y && bounds.w === b.w && bounds.h === b.h; }
    const selected = host.Zotero_Tabs?.selectedID ?? null;
    if (!wasMinimized) { host.minimize(); await sleep(600); }
    return { baselineState: b?.windowState, wasMinimizedAlready: wasMinimized, boundsBefore: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null, boundsNow: bounds, boundsSame: sameBounds, selectedTab: selected, selectedTabIsOwners: selected === b?.selectedTab, minimizedNow: host.windowState === host.STATE_MINIMIZED };
  });

  const version = await step('version', async () => JSON.parse(d.startup()).version);
  out.build = version;
  out.errors = errors;
  const f = out.steps;
  out.status = !errors.length && f.settingsWindow?.closed && f.fixture?.itemGone && f.fixture?.readerGone && f.prefs?.mismatched?.length === 0 && f.snapshotFile?.mismatched?.length === 0 && f.positions?.clean
    && f.folder?.folder?.positionSync === true && f.folder?.folder?.settingsUpload === true && f.folder?.folder?.settingsSync === true && f.folder?.transportsIdle
    && f.debugStore?.storingNow === false && f.host?.minimizedNow ? 'PASS' : 'CHECK';
  state.cleanup = out;
  return JSON.stringify(out, null, 1);
})()
