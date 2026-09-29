// Item 6 (issue #159): signed in again, at once. Puts hasCredentials back
// with the exact descriptor 06 kept (Object.defineProperty), fires the
// api-key notification again, and polls up to 20 s: both Log in links
// hidden, both credits rows shown again with item 2's exact texts. Leaves
// hasCredentials RESTORED and both switches ON. params: none. state: reads
// credentialsDescriptor (06) and creditsTextStandard/Premium (02).
(async () => {
  const out = { step: 'signed-in-again' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02 first');
    const doc = win.document;
    const desc = S.credentialsDescriptor;
    if (!desc) throw new Error('state.credentialsDescriptor missing -- 06 did not complete');
    Object.defineProperty(Zotero.Sync.Data.Local, 'hasCredentials', desc);
    out.syncRunnerEnabledAfterRestore = !!Zotero.Sync.Runner.enabled;

    await Zotero.Notifier.trigger('modify', 'api-key', []);
    let settledAt = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const rowS = doc.getElementById('ztts-zotero-credits-row-standard');
      const rowP = doc.getElementById('ztts-zotero-credits-row-premium');
      const liS = doc.getElementById('ztts-zotero-log-in-standard');
      const liP = doc.getElementById('ztts-zotero-log-in-premium');
      if (rowS && rowP && liS && liP
        && rowS.hidden === false && rowP.hidden === false
        && liS.hidden === true && liP.hidden === true
        && doc.getElementById('ztts-zotero-credits-standard').textContent
        && doc.getElementById('ztts-zotero-credits-premium').textContent) {
        settledAt = Date.now() - t0;
        break;
      }
      await sleep(150);
    }
    out.settledAtMs = settledAt;

    const expectedStandard = S.creditsTextStandard;
    const expectedPremium = S.creditsTextPremium;
    const tierState = (tier, expected) => {
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      const result = doc.getElementById('ztts-test-result-zotero-' + tier);
      const enable = doc.getElementById('ztts-enable-zotero-' + tier);
      return {
        creditsRowHidden: row.hidden === true,
        creditsText: text ? text.textContent : null,
        creditsTextMatchesItem2: !!text && text.textContent === expected,
        noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
        logInHidden: logIn.hidden === true,
        resultText: result ? result.textContent : null,
        enableDisabled: !!enable.disabled,
        pref: Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled'),
      };
    };
    out.standard = tierState('standard', expectedStandard);
    out.premium = tierState('premium', expectedPremium);

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiers = {
      signedIn: zt.signedIn,
      creditsStandard: zt.credits && zt.credits.standard ? zt.credits.standard.credits : zt.credits,
      creditsPremium: zt.credits && zt.credits.premium ? zt.credits.premium.credits : null,
      checksStandard: zt.checks['zotero-standard'],
    };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
