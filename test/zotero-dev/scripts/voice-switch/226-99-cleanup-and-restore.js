(async () => {
  // Issue #226 cleanup: fixture readers closed and items erased, every changed
  // pref restored byte-identically (honoring each user-value flag: set or CLEAR),
  // the WebDAV folder switch back to its snapshot, position rows back to the
  // baseline, the host minimized. readAloud.memory is restored LAST.
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const S = Zotero.ZoteroTTS.diagnostics;
  const base = Zotero.__ztts226;
  if (!base?.prefSnapshot) throw new Error('the baseline snapshot is missing');
  const out = { status: 'FAIL', steps: {}, errors: [] };
  const step = async (name, fn) => { try { out.steps[name] = await fn(); } catch (e) { out.errors.push(name + ': ' + String(e)); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, timeout = 15000, stepMs = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(stepMs);
    }
    return test();
  };

  await step('fixtures-out', async () => {
    for (const row of (base.fixtures || [])) {
      const list = Zotero.Reader?._readers || [];
      for (let i = 0; i < list.length; i++) {
        try {
          if (Components.utils.isDeadWrapper?.(list[i]) || list[i]?.itemID !== row.itemID) continue;
          try { list[i]._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
          const closing = list[i].close?.(); if (closing && typeof closing.then === 'function') await closing;
        } catch (_) {}
      }
      try { const old = Zotero.Items.get(row.itemID); if (old) await old.eraseTx(); } catch (_) {}
    }
    await waitFor(() => !(Zotero.Reader?._readers || []).some(r => (base.fixtures || []).some(row => row.itemID === r?.itemID)), 10000, 150);
    const pos = JSON.parse(await S.position());
    return { rows: pos.database?.rows, baseline: base.positionRowsBaseline, back: pos.database?.rows === base.positionRowsBaseline };
  });

  await step('prefs-restored', async () => {
    // readAloud.memory is restored last, after every reader that could re-persist is closed.
    const order = Object.keys(base.prefSnapshot).filter(n => !n.endsWith('readAloud.memory'));
    const results = {};
    for (const name of order) {
      const snap = base.prefSnapshot[name];
      try {
        if (snap.user) {
          if (snap.type === 'int') p.setIntPref(name, Number(snap.value));
          else if (snap.type === 'bool') p.setBoolPref(name, !!snap.value);
          else p.setStringPref(name, String(snap.value ?? ''));
        } else if (p.prefHasUserValue(name)) {
          p.clearUserPref(name);
        }
        results[name.replace(prefix, '').replace('extensions.zotero.', '')] = { ok: true };
      } catch (e) { results[name] = { ok: false, error: String(e) }; }
    }
    const memName = prefix + 'readAloud.memory';
    const mem = base.prefSnapshot[memName];
    let memory = { present: !!mem };
    if (mem) {
      try {
        if (mem.user) p.setStringPref(memName, String(mem.value ?? ''));
        else if (p.prefHasUserValue(memName)) p.clearUserPref(memName);
        memory.restored = true;
      } catch (e) { memory.error = String(e); }
    }
    return { restored: results, memoryLast: memory };
  });

  await step('verify-prefs', async () => {
    const rows = {};
    for (const [name, snap] of Object.entries(base.prefSnapshot)) {
      let now = null;
      try {
        if (snap.type === 'int') now = p.getIntPref(name);
        else if (snap.type === 'bool') now = p.getBoolPref(name);
        else now = p.getStringPref(name);
      } catch (_) { now = null; }
      const userNow = p.prefHasUserValue(name);
      rows[name.replace(prefix, '').replace('extensions.zotero.', '')] = { same: now === snap.value && userNow === snap.user, was: snap.user ? String(snap.value) : `(default) user=${snap.user}`, now: userNow ? String(now) : `(default) user=${userNow}` };
    }
    return rows;
  });

  await step('webdav-restore', async () => {
    const snap = base.webdavEnabled;
    const name = prefix + 'webdav.enabled';
    if (snap) {
      if (snap.user) p.setBoolPref(name, !!snap.value);
      else if (p.prefHasUserValue(name)) p.clearUserPref(name);
    }
    await sleep(300);
    const after = JSON.parse(await S.positionSync());
    const match = after.folder === (snap ? snap.value : after.folder);
    return { snapshot: snap, now: { folder: after.folder, enabled: after.enabled }, match };
  });

  await step('debug-store', async () => {
    if (base.debugStoringBefore === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
    return { storingBefore: base.debugStoringBefore, storingNow: Zotero.Debug.storing };
  });

  await step('host-minimized', async () => {
    const win = Zotero.getMainWindow();
    const before = win.windowState;
    try { if (win.minimize) win.minimize(); else win.windowState = 2; } catch (e) { out.errors.push('minimize: ' + String(e)); }
    await sleep(400);
    return { before, now: win.windowState };
  });

  out.status = out.errors.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 1);
})()
