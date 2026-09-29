// Issue #82 item 5: a settings restore whose readAloud.speedPercent differs is
// reading-guarded while a player is open and applies when none is. The restore's
// file picker and confirm are blocking native dialogs (never triggered from the
// bridge), so the live evidence is the guard's own decision input —
// diagnostics.readingImpact(changes) — with the apply path already proven by the
// sync adoptions (items 3–4). Positive: speedPercent names the open player's tab.
// Negatives: an unchanged volume and an unrelated key affect nothing even with
// the player open.
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
    // Open fixture A's player and pause it
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
    if (!readerA._internalReader._readAloudManager?.active) readerA._internalReader.toggleReadAloudPopup(true);
    const managerA = await waitFor(() => {
      const m = readerA._internalReader._readAloudManager;
      return m && m.active ? m : null;
    }, 24000, 200);
    if (!managerA) throw new Error('the player did not start a session');
    try { managerA.pause(); } catch (e) { try { managerA.togglePaused(); } catch (e2) {} }
    await waitFor(() => managerA.active && managerA.paused, 8000, 100);
    if (host.minimize) host.minimize();
    host = null;

    const volumeNow = p.getIntPref(prefix + 'readAloud.volume');
    // With the player open: a restore-shaped change of the speed names the tab
    const impactSpeed = JSON.parse(await d.readingImpact(JSON.stringify({ 'readAloud.speedPercent': 250 })));
    out.playerOpen = {
      sessions: impactSpeed.sessions,
      affected: impactSpeed.affected,
      fixtureTitle: (impactSpeed.sessions ?? []).map(s => s.title),
    };
    // Negatives while the player is still open
    const impactVolumeEqual = JSON.parse(await d.readingImpact(JSON.stringify({ 'readAloud.volume': volumeNow })));
    const impactUnrelated = JSON.parse(await d.readingImpact(JSON.stringify({ 'shortcuts.stop': 'Shift+Q' })));
    const impactNoSpeedKey = JSON.parse(await d.readingImpact(JSON.stringify({ 'highlight.sentence': 'off' })));
    out.negativesWhileOpen = {
      volumeUnchangedValue: { affected: impactVolumeEqual.affected },
      unrelatedShortcutKey: { affected: impactUnrelated.affected },
      backupWithoutTheKey: { affected: impactNoSpeedKey.affected },
    };

    // Close the player; the same proposed change affects nothing
    readerA._internalReader.toggleReadAloudPopup(false);
    await waitFor(() => {
      const m = readerA._internalReader._readAloudManager;
      return m && !m.active;
    }, 10000, 150);
    const impactClosed = JSON.parse(await d.readingImpact(JSON.stringify({ 'readAloud.speedPercent': 250 })));
    out.playerClosed = { sessions: impactClosed.sessions, affected: impactClosed.affected };

    const checks = {
      openNamesTab: (out.playerOpen.affected ?? []).length === 1 && (out.playerOpen.sessions ?? []).length === 1
        && String(out.playerOpen.affected[0]).includes('ztts 2026-09-29 A'),
      volumeEqualQuiet: (out.negativesWhileOpen.volumeUnchangedValue.affected ?? []).length === 0,
      unrelatedQuiet: (out.negativesWhileOpen.unrelatedShortcutKey.affected ?? []).length === 0,
      withoutKeyQuiet: (out.negativesWhileOpen.backupWithoutTheKey.affected ?? []).length === 0,
      closedQuiet: (out.playerClosed.affected ?? []).length === 0 && (out.playerClosed.sessions ?? []).length === 0,
    };
    out.checks = checks;
    out.note = 'The full restore click-through (file picker + Services.prompt.confirm) is a blocking native flow the tester rules forbid triggering; the guard substrate is this decision input, and the apply path is the pref-write observer proven live in items 3 and 4.';
    if (!checks.openNamesTab) throw new Error('the open player was not named for a speedPercent change');
    if (!checks.closedQuiet) throw new Error('the closed state still reports an impact');
    out.status = 'PASS';
    return JSON.stringify(out);
  } catch (error) {
    out.error = String(error);
    try { if (host && host.minimize) host.minimize(); } catch (e) {}
    throw new Error(JSON.stringify(out));
  }
})()
