// Issue #82 item 2: change the speed with the plugin's speed-up shortcut
// (trusted Shift+C on the focused fixture reader). Expects every open reader's
// speed and every zotero.<lang>.speed to follow at once, the pref stamped, and
// within the quiet period the shared file to hold the new hundredths from this
// machine.
return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return null;
  };
  const state = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const out = { status: 'FAIL' };
  let host = null;

  try {
    host = Services.wm.getMostRecentWindow('navigator:browser');
    if (!host) throw new Error('no main window');
    if (host.windowState === 2) host.restore();
    host.focus();
    await sleep(400);
    host.Zotero_Tabs.select(state.readerA.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === state.readerA.tabID, 8000, 100);
    const readerA = (Zotero.Reader._readers ?? []).find(r => r && r.itemID === state.readerA.itemID);
    if (!readerA) throw new Error('reader A missing');
    readerA._iframeWindow?.focus?.();
    await sleep(300);

    const binding = String(state.baseline['shortcuts.speedUp'].value || 'Shift+C');
    out.binding = binding;

    const before = state.beforeChange;
    const percentBefore = before.speedPercent;
    const expectPercent = percentBefore + 5;
    const expectSpeed = expectPercent / 100;

    // Trusted Shift+<speed up> through nsITextInputProcessor
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(host);
    const keyName = binding.replace(/^Shift\+/, '');
    const code = 'Key' + keyName;
    const keyCode = keyName.charCodeAt(0);
    const ev = (type, key, c, kc, mods) => new host.KeyboardEvent('', { type, key, code: c, keyCode: kc, ...mods });
    tip.keydown(ev('keydown', 'Shift', 'ShiftLeft', 16, {}));
    const r = tip.keydown(ev('keydown', keyName, code, keyCode, { shiftKey: true }));
    tip.keyup(ev('keyup', keyName, code, keyCode, { shiftKey: true }));
    tip.keyup(ev('keyup', 'Shift', 'ShiftLeft', 16, {}));
    out.keydownConsumed = r === 1;

    // The spread is the observer chain: it lands within the next ticks
    const applied = await waitFor(() => {
      try {
        const mem = JSON.parse(Zotero.ZoteroTTS.diagnostics.readAloudMemory());
        if (mem.speedPercent !== expectPercent) return null;
        const rows = (mem.readers ?? []).filter(x => [state.readerA.itemID, state.readerB.itemID].includes(x.itemID));
        if (!rows.length || rows.some(x => x.speed !== expectSpeed)) return null;
        const langs = Object.entries(mem.zotero ?? {});
        if (!langs.length || langs.some(([, v]) => v.speed !== expectSpeed)) return null;
        return mem;
      } catch (e) { return null; }
    }, 5000, 100);
    if (!applied) throw new Error('the spread did not land within 5 s');
    out.spread = {
      speedPercent: applied.speedPercent,
      memorySpeed: applied.memory?.speed ?? null,
      readers: (applied.readers ?? []).filter(x => [state.readerA.itemID, state.readerB.itemID].includes(x.itemID))
        .map(x => ({ itemID: x.itemID, speed: x.speed, active: x.active, paused: x.paused })),
      zoteroSpeeds: Object.fromEntries(Object.entries(applied.zotero ?? {}).map(([k, v]) => [k, v.speed])),
      langsChangedToExpected: Object.values(applied.zotero ?? {}).every(v => v.speed === expectSpeed),
    };

    // The stamp appears at once; the push follows the quiet period (~10 s)
    const stamped = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        return (s.state?.stamped ?? []).includes('readAloud.speedPercent') ? s : null;
      } catch (e) { return null; }
    }, 5000, 100);
    if (!stamped) throw new Error('readAloud.speedPercent was not stamped');
    out.stamp = { count: stamped.state?.stamps, ts: (() => { try { const st = JSON.parse(p.getStringPref(prefix + 'webdav.syncState')); return st.stamps?.['readAloud.speedPercent'] ?? null; } catch (e) { return null; } })() };

    const pushed = await waitFor(async () => {
      try {
        const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
        const t = s.transport ?? {};
        return t.lastTrigger === 'change' && t.lastOutcome === 'ok' && (t.pushed ?? 0) >= 1 && t.running === false && t.lastAt > Date.now() - 30000 ? s : null;
      } catch (e) { return null; }
    }, 18000, 300);
    out.push = pushed ? {
      trigger: pushed.transport?.lastTrigger, outcome: pushed.transport?.lastOutcome,
      pushed: pushed.transport?.pushed, uploaded: pushed.transport?.uploaded,
    } : 'no change-trigger push within 18 s';

    const shared = JSON.parse(await d.sharedSettings());
    const item = (shared.items ?? []).find(i => i.key === 'readAloud.speedPercent') ?? null;
    out.sharedItem = item;
    const machine = (() => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync()).machine; } catch (e) { return null; } })();
    out.machineIsBy = !!item && item.by === machine;
    out.stampMatchesItemTs = !!item && item.ts === out.stamp.ts;

    // One more bounded audio probe, now that the window has been foregrounded
    const e2 = JSON.parse(await d.engine());
    const rowA = (e2.readers ?? []).find(x => x.itemID === state.readerA.itemID) ?? {};
    out.audioRecheck = { audioState: rowA.audio?.state ?? null, playing: rowA.session?.playing ?? null, playbackTime: rowA.session?.playbackTime ?? null };

    if (!item || item.value !== expectPercent) throw new Error('the shared file item is missing or wrong: ' + JSON.stringify(item));
    if (!out.machineIsBy) throw new Error('the item was not written by this machine');
    if (!out.stampMatchesItemTs) throw new Error('the item ts does not match the stamp');

    if (host.minimize) host.minimize();
    host = null;
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (host && host.minimize) host.minimize(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
