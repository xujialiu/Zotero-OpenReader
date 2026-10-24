// Item 1c.1 (the entries) and the first-paint half of the mechanism checks. Opens a FRESH settings
// window on the plugin pane straight after an install (the model list is cached 30 minutes in the
// plugin's session, so only the first open after an install can show the state before Fish's list
// arrives) and samples menulist#ztts-fish-model every 15 ms from the moment the window exists, with a
// MutationObserver beside it: the entries at first sight (the four known models, never empty), the
// moment and shape of the list's arrival, the final entries and their labels, the selection against
// fish.model, the locale, and whether the dropdown is disabled (it is, while Fish Audio is enabled).
// The window is left open for the scripts after it. params: none. state: writes paneEntries.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 8000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(step); }
    return test();
  };
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const old = Services.wm.getMostRecentWindow('zotero:pref');
  if (old) { old.close(); await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref')); }
  const snapshot = w => {
    const menu = w?.document?.getElementById('ztts-fish-model');
    if (!menu) return null;
    const popup = menu.menupopup || menu.querySelector('menupopup');
    const kids = popup ? popup.children : [];
    const items = [];
    for (let i = 0; i < kids.length; i++) items.push({ value: kids[i].getAttribute('value'), label: kids[i].getAttribute('label') });
    return { items, value: menu.value, selectedIndex: menu.selectedIndex, disabled: !!menu.disabled, shown: menu.label ?? null };
  };
  const t0 = Date.now();
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  const changes = [], mutations = [];
  let win = null, navigated = false, observer = null, lastKey = '', firstSeen = null, stableSince = 0;
  const key = s => JSON.stringify([s.items.map(i => i.label), s.value, s.disabled]);
  while (Date.now() - t0 < 30000) {
    const w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w && w.Zotero_Preferences?.navigation && !navigated) {
      navigated = true; win = w;
      try {
        observer = new w.MutationObserver(() => {
          const s = snapshot(w);
          if (s) mutations.push({ t: Date.now() - t0, count: s.items.length, value: s.value, disabled: s.disabled });
        });
        observer.observe(w.document, { subtree: true, childList: true });
      } catch (e) { mutations.push({ error: String(e) }); }
      w.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    }
    const s = win ? snapshot(win) : null;
    if (s) {
      const k = key(s);
      if (k !== lastKey) { lastKey = k; stableSince = Date.now(); changes.push({ t: Date.now() - t0, count: s.items.length, labels: s.items.map(i => i.label), value: s.value, disabled: s.disabled }); }
      if (!firstSeen) firstSeen = { t: Date.now() - t0, ...s };
      if (Date.now() - firstSeen.t - t0 > 6500 || (s.items.length >= 5 && Date.now() - stableSince > 800)) break;
    }
    await sleep(15);
  }
  try { observer?.disconnect(); } catch (_) {}
  if (!firstSeen) throw new Error('menulist#ztts-fish-model never appeared');
  const final = snapshot(win);
  const menu = win.document.getElementById('ztts-fish-model');
  // The labels lost their prices after the 2026-10-16 beta2 run (the owner): free or paid, never a price.
  const expected = ['s2.1-pro-free — free', 's2.1-pro — paid', 'drama-3 — paid', 's2-pro — paid'];
  const labels = final.items.map(i => i.label);
  const modelKey = prefix + 'fish.model';
  const out = {
    status: 'PASS', phase: '1c.1 entries',
    locale: { zotero: Zotero.locale, app: Services.locale.appLocalesAsBCP47[0] },
    firstSeen: { ms: firstSeen.t, count: firstSeen.items.length, labels: firstSeen.items.map(i => i.label), disabled: firstSeen.disabled },
    changes, mutationCount: mutations.length, mutationsHead: mutations.slice(0, 6),
    final: { count: labels.length, labels, values: final.items.map(i => i.value), value: final.value, selectedIndex: final.selectedIndex, shown: final.shown, disabled: final.disabled, disabledAttribute: menu.getAttribute('disabled'), tag: menu.localName },
    firstFourAsExpected: expected.every((l, i) => labels[i] === l),
    fifth: labels[4] ?? null, beyondFive: labels.slice(5),
    pref: { value: Zotero.Prefs.get('zotero-tts.fish.model') ?? null, hasUser: p.prefHasUserValue(modelKey) },
    selectedIsPref: final.value === (Zotero.Prefs.get('zotero-tts.fish.model') ?? 's2.1-pro-free'),
    fishEnabled: p.getBoolPref(prefix + 'fish.enabled'),
  };
  state.paneEntries = out;
  return JSON.stringify(out, null, 1);
})()
