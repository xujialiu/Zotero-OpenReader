// Item 1c.1, the pick and the lock, on the settings window 05 left open (Fish Audio enabled, the
// owner's state): (1) locked, a synthetic pick of s2.1-pro is ignored and the dropdown goes back to
// the stored model; (2) the owner's paused Read Aloud player is closed (the reading guard refuses
// Disable while a session reads on a Fish voice), noted by tab and voice, never reopened;
// (3) the Disable button; (4) unlocked, a pick of s2.1-pro writes fish.model and the dropdown shows it;
// (5) a pick of the free model writes it back (equal to the default, so Gecko drops the user value).
// A pick is the menuitem's own `command`, as a click on it fires. params: none. state: writes pickAndLock,
// ownerPlayerClosed.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 8000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const win = Services.wm.getMostRecentWindow('zotero:pref'), doc = win?.document;
  const menu = doc?.getElementById('ztts-fish-model'), button = doc?.getElementById('ztts-enable-fish');
  if (!menu || !button) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  const modelKey = prefix + 'fish.model', enabledKey = prefix + 'fish.enabled';
  const pick = value => {
    const kids = menu.menupopup.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].getAttribute('value') !== value) continue;
      menu.selectedItem = kids[i];
      kids[i].doCommand();
      return true;
    }
    return false;
  };
  const view = () => ({ value: menu.value, shown: menu.label, disabled: menu.disabled, pref: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, prefHasUser: p.prefHasUserValue(modelKey), fishEnabled: p.getBoolPref(enabledKey), button: button.getAttribute('label') });
  const steps = {};

  // 1. Locked (Fish Audio enabled): a synthetic pick is ignored
  steps.lockedBefore = view();
  steps.lockedPickFound = pick('s2.1-pro');
  await sleep(200);
  steps.lockedAfterPick = view();

  // 2. The owner's paused player, closed once (noted; never reopened)
  const closed = [];
  const readers = Zotero.Reader?._readers || [];
  for (let i = 0; i < readers.length; i++) {
    const r = readers[i], m = r?._internalReader?._readAloudManager;
    if (!m?.active) continue;
    let title = null;
    try { const it = Zotero.Items.get(r.itemID); title = (it?.parentItem ?? it)?.getField('title'); } catch (_) {}
    const before = { itemID: r.itemID, tabID: r.tabID, title, paused: !!m.paused, voice: String(m.selectedVoiceID || '').slice(0, 14) + '…' };
    r._internalReader.toggleReadAloudPopup(false);
    const gone = await waitFor(() => !m.active, 7000);
    closed.push({ ...before, activeAfter: !!m.active, closed: !!gone });
  }
  state.ownerPlayerClosed = closed;
  steps.ownerPlayerClosed = closed;

  // 3. Disable
  button.click();
  const off = await waitFor(() => button.getAttribute('label') === 'Enable' && p.getBoolPref(enabledKey) === false, 8000);
  await sleep(150);
  steps.afterDisable = { ...view(), reachedEnable: !!off };

  // 4. Unlocked: a pick writes the pref
  steps.paidPickFound = pick('s2.1-pro');
  await sleep(250);
  steps.afterPaidPick = view();
  // 5. And back to the free model
  steps.freePickFound = pick('s2.1-pro-free');
  await sleep(250);
  steps.afterFreePick = view();

  const ok = steps.lockedBefore.disabled === true && steps.lockedAfterPick.pref === 's2.1-pro-free' && steps.lockedAfterPick.prefHasUser === false && steps.lockedAfterPick.value === 's2.1-pro-free'
    && steps.afterDisable.reachedEnable === true && steps.afterDisable.fishEnabled === false && steps.afterDisable.disabled === false
    && steps.afterPaidPick.pref === 's2.1-pro' && steps.afterPaidPick.prefHasUser === true && steps.afterPaidPick.value === 's2.1-pro' && steps.afterPaidPick.shown === 's2.1-pro — $15 per million bytes'
    && steps.afterFreePick.pref === 's2.1-pro-free' && steps.afterFreePick.value === 's2.1-pro-free';
  const out = { status: ok ? 'PASS' : 'FAIL', steps };
  state.pickAndLock = out;
  return JSON.stringify(out, null, 1);
})()
