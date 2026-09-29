// Item 4 (issue #159): a tier switched off keeps its figure. Requires no
// player open (the reading guard refuses a switch affecting an active
// session — this run's only active session is the owner's own fish-tier
// tab, whose key cannot match zotero-premium, so the guard must not fire;
// a #ztts-notice dialog appearing would mean that assumption was wrong and
// is reported instead of assumed away). Disables Premium: the switch row
// reads Enable, the credits row stays shown with item 2's text. Restores
// with Enable (Checking… → Signed in: …, Disable), polled on the pref (the
// label-only race the zotero-tiers kit found live 2026-09-15).
// params: none. state: reads creditsTextPremium; writes nothing new.
(async () => {
  const out = { step: 'tier-off-keeps-figure' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02 first');
    const doc = win.document;
    const expectedCredits = S.creditsTextPremium;
    if (!expectedCredits) throw new Error('state.creditsTextPremium missing -- run 02 first');

    out.activeSessionsAtStart = (Zotero.Reader._readers || []).map((r) => {
      const m = r._internalReader && r._internalReader._readAloudManager;
      return { itemID: r.itemID, tier: m && m._voice ? m._voice.tier : null, active: !!(m && m.active) };
    });
    const creditsRow = doc.getElementById('ztts-zotero-credits-row-premium');
    const creditsText = doc.getElementById('ztts-zotero-credits-premium');
    const toggle = doc.getElementById('ztts-enable-zotero-premium');
    const result = doc.getElementById('ztts-test-result-zotero-premium');

    out.before = { label: toggle.getAttribute('label'), pref: Zotero.Prefs.get('zotero-tts.zotero-premium.enabled'), creditsText: creditsText.textContent };
    toggle.click();
    const trace = [];
    let sawNotice = false;
    let prefFalseAt = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const pref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
      trace.push({ t: Date.now() - t0, label: toggle.getAttribute('label'), pref });
      if (doc.getElementById('ztts-notice')) sawNotice = true;
      if (pref === false) { prefFalseAt = Date.now() - t0; break; }
      await sleep(100);
    }
    out.noticeDialogAppeared = sawNotice;
    out.disableTraceFirst = trace[0] || null;
    out.disableTraceCount = trace.length;
    out.prefFalseAtMs = prefFalseAt;
    if (prefFalseAt === null) throw new Error('Premium did not go off (the guard may have refused -- see noticeDialogAppeared)');

    out.afterDisable = {
      label: toggle.getAttribute('label'),
      creditsRowHidden: creditsRow.hidden === true,
      creditsText: creditsText.textContent,
      creditsTextUnchanged: creditsText.textContent === expectedCredits,
      noneAttr: creditsText.hasAttribute('data-ztts-none'),
      buyHidden: doc.getElementById('ztts-zotero-buy-premium').hidden === true,
    };

    // --- Restore with Enable, polled on the pref. ---
    toggle.click();
    let sawChecking = false;
    let prefTrueAt = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 25000) {
      const label = toggle.getAttribute('label');
      const pref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
      if (/checking/i.test(label || '')) sawChecking = true;
      if (pref === true) { prefTrueAt = Date.now() - t1; break; }
      await sleep(100);
    }
    const t2 = Date.now();
    while (Date.now() - t2 < 20000) {
      if (/voices\.$/.test(result.textContent || '')) break;
      await sleep(150);
    }
    out.restore = {
      sawChecking,
      prefTrueAtMs: prefTrueAt,
      label: toggle.getAttribute('label'),
      pref: Zotero.Prefs.get('zotero-tts.zotero-premium.enabled'),
      resultText: result.textContent,
      creditsTextAfterRestore: creditsText.textContent,
    };
    if (prefTrueAt === null) throw new Error('Premium did not come back on');
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
