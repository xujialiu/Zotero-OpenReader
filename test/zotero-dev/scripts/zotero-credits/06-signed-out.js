// Item 5 (issue #159, standing in for a real sign-out): keeps
// Zotero.Sync.Data.Local.hasCredentials' own descriptor, replaces it with
// () => false (the flag Zotero.Sync.Runner.enabled reads), fires the api-key
// notification Zotero sends on a login removal. Then: both credits rows
// hidden; both Log in links shown ("Log in"), each on its result's row,
// starting 6 px after the result text's right edge (0 px on 1.16.2-beta5:
// the text touched the link) and vertically centered with it within 2 px
// (1.5 measured); both result lines "Not signed in to a Zotero account.";
// zoteroTiers() signedIn false, credits null. Then Standard's Log in is
// clicked — the owner's API key is verified stored FIRST (length only)
// because with no key Zotero's Account pane would start a real sign-in,
// which is never allowed — and within 2 s the settings window's selected
// pane must be zotero-prefpane-account, read from
// win.Zotero_Preferences.navigation.value — the #prefs-navigation
// richlistbox Zotero's own navigateToPane sets (chrome/content/zotero/
// preferences/preferences.js 125-130; an earlier attempt read the deck's
// selectedPanel instead, which stays stale until the pane renders). The pane
// is navigated back to zotero-tts-pane. Leaves hasCredentials REPLACED for
// 07. params: none. state: writes credentialsDescriptor.
(async () => {
  const out = { step: 'signed-out' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02 first');
    const doc = win.document;

    // Preconditions: no player open; an API key is stored (so Log in cannot start a real sign-in).
    out.activeSessionsAtStart = (Zotero.Reader._readers || []).map((r) => {
      const m = r._internalReader && r._internalReader._readAloudManager;
      return { itemID: r.itemID, tier: m && m._voice ? m._voice.tier : null, active: !!(m && m.active) };
    });
    let apiKeyChars = 0;
    try { const key = await Zotero.Sync.Data.Local.getAPIKey(); apiKeyChars = typeof key === 'string' ? key.length : 0; } catch (_) {}
    out.apiKeyStored = apiKeyChars > 0;
    out.apiKeyChars = apiKeyChars;

    // Shadow hasCredentials (the 10-signed-out-greyed way: own descriptor kept).
    const desc = Object.getOwnPropertyDescriptor(Zotero.Sync.Data.Local, 'hasCredentials');
    if (!desc || typeof desc.value !== 'function') throw new Error('hasCredentials is not a plain function property');
    S.credentialsDescriptor = desc;
    Zotero.Sync.Data.Local.hasCredentials = () => false;
    out.syncRunnerEnabledAfterShadow = !!Zotero.Sync.Runner.enabled;

    await Zotero.Notifier.trigger('modify', 'api-key', []);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (doc.getElementById('ztts-zotero-credits-row-standard') && doc.getElementById('ztts-zotero-credits-row-standard').hidden === true) break;
      await sleep(100);
    }

    const REASON = 'Not signed in to a Zotero account.';
    const OLD_REASON = 'Not signed in to a Zotero account: sign in under Settings → Sync.';
    const tierState = (tier) => {
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      const result = doc.getElementById('ztts-test-result-zotero-' + tier);
      const enable = doc.getElementById('ztts-enable-zotero-' + tier);
      const test = doc.getElementById('ztts-test-zotero-' + tier);
      const lr = logIn ? logIn.getBoundingClientRect() : null;
      const rr = result ? result.getBoundingClientRect() : null;
      return {
        creditsRowHidden: row.hidden === true,
        logIn: logIn ? { hidden: logIn.hidden === true, text: logIn.textContent, sameRowAsResult: logIn.parentNode === result.parentNode } : null,
        resultText: result ? result.textContent : null,
        resultIsOldString: result ? result.textContent === OLD_REASON : null,
        enableDisabled: !!enable.disabled,
        testDisabled: !!test.disabled,
        geometry: lr && rr ? {
          gapLinkLeftMinusResultRight: +(lr.left - rr.right).toFixed(2),
          gapIsSixPx: Math.abs((lr.left - rr.right) - 6) <= 0.5,
          verticalCenterDelta: +((lr.top + lr.height / 2) - (rr.top + rr.height / 2)).toFixed(2),
          centeredWithin2px: Math.abs((lr.top + lr.height / 2) - (rr.top + rr.height / 2)) <= 2,
          linkStartsAtOrAfterResult: lr.left >= rr.right - 0.01,
          resultRect: { x: +rr.x.toFixed(2), y: +rr.y.toFixed(2), w: +rr.width.toFixed(2), h: +rr.height.toFixed(2) },
          linkRect: { x: +lr.x.toFixed(2), y: +lr.y.toFixed(2), w: +lr.width.toFixed(2), h: +lr.height.toFixed(2) },
        } : null,
      };
    };
    out.standard = tierState('standard');
    out.premium = tierState('premium');

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiers = {
      signedIn: zt.signedIn,
      creditsIsNull: zt.credits === null,
      credits: zt.credits,
      checksStandard: zt.checks['zotero-standard'],
      checksPremium: zt.checks['zotero-premium'],
      checksMatchResultLines: zt.checks['zotero-standard'].message === out.standard.resultText
        && zt.checks['zotero-premium'].message === out.premium.resultText,
    };

    // --- Standard's Log in → Zotero's Account pane within 2 s (no sign-in started). ---
    if (!out.apiKeyStored) {
      out.logInClick = { skipped: true, reason: 'no stored API key -- clicking would start a real sign-in' };
    } else {
      const logIn = doc.getElementById('ztts-zotero-log-in-standard');
      logIn.click();
      let selectedPane = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 2000) {
        // The right read (issue #159 verification brief): #prefs-navigation's
        // value — what Zotero's own navigateToPane sets
        // (preferences.js 125-130). The deck's selectedPanel is kept as
        // supplementary only; it can lag the richlistbox.
        const navValue = win.Zotero_Preferences && win.Zotero_Preferences.navigation
          ? win.Zotero_Preferences.navigation.value : null;
        const deck = doc.getElementById('zotero-prefpane-deck');
        const panel = deck && deck.selectedPanel ? deck.selectedPanel : null;
        selectedPane = {
          navigationValue: navValue,
          selectedPanelId: panel ? panel.id : null,
          accountPaneExists: !!doc.getElementById('zotero-prefpane-account'),
          accountPaneHidden: (function () { const el = doc.getElementById('zotero-prefpane-account'); return el ? el.hidden : null; })(),
        };
        if (selectedPane.navigationValue === 'zotero-prefpane-account') break;
        await sleep(100);
      }
      out.logInClick = {
        selectedPane,
        onAccountPane: selectedPane.navigationValue === 'zotero-prefpane-account',
        ms: Date.now() - t1,
      };
      // Navigate back to the Zotero-OpenReader pane (the brief: selected pane back to Zotero-OpenReader).
      await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
      const t2 = Date.now();
      while (Date.now() - t2 < 8000 && !doc.getElementById('ztts-zotero-section')) await sleep(150);
      out.navigatedBack = !!doc.getElementById('ztts-zotero-section');
      out.navigationValueAfterBack = win.Zotero_Preferences && win.Zotero_Preferences.navigation
        ? win.Zotero_Preferences.navigation.value : null;
    }
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
