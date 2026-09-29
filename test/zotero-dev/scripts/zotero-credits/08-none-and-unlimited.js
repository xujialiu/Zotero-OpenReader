// Item 7 (issue #159): nothing left, and Unlimited. Keeps
// Zotero.Sync.Runner.getAPIClient and wraps it: the client it returns gets
// its own getReadAloudCreditsRemaining replaced to answer
// { standardCreditsRemaining: 0, premiumCreditsRemaining: 200000000 }
// (the instance is per-call — built per call because it carries the API key
// of the moment — so only the plugin's refresh sees the stand-in; every
// other method of that one instance and every other caller's client is
// untouched). Blanks both credits texts by hand, clicks Test connection
// beside Standard: the refresh the check triggers must paint Standard
// "No credits left" WITH data-ztts-none in --accent-red and its buy link
// shown, Premium "Unlimited" without the attribute and its buy link hidden
// (200,000,000 credits at the cheapest 10 is past Zotero's own 129,600
// minutes). Then assigns the kept getAPIClient back and clicks Test
// connection again: item 2's texts, both buy links shown. The wrapper lives
// only inside this script. params: none. state: reads
// creditsTextStandard/Premium; keeps getAPIClientOriginal (restored here).
(async () => {
  const out = { step: 'none-and-unlimited' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02 first');
    const doc = win.document;

    const expectedStandard = S.creditsTextStandard;
    const expectedPremium = S.creditsTextPremium;
    if (!expectedStandard || !expectedPremium) throw new Error('state credits texts missing -- run 02 first');

    // --- Wrap getAPIClient. ---
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.getAPIClientOriginal = orig;
    let wrappedHow = 'instance-override';
    Zotero.Sync.Runner.getAPIClient = function (options) {
      const client = orig.apply(this, arguments);
      try {
        client.getReadAloudCreditsRemaining = async () => ({ standardCreditsRemaining: 0, premiumCreditsRemaining: 200000000 });
      } catch (e) {
        wrappedHow = 'proxy-fallback (' + String(e).slice(0, 60) + ')';
        return new Proxy(client, {
          get(target, prop) {
            if (prop === 'getReadAloudCreditsRemaining') return async () => ({ standardCreditsRemaining: 0, premiumCreditsRemaining: 200000000 });
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      }
      return client;
    };
    out.wrappedHow = wrappedHow;

    const creditsS = doc.getElementById('ztts-zotero-credits-standard');
    const creditsP = doc.getElementById('ztts-zotero-credits-premium');
    creditsS.textContent = '';
    creditsP.textContent = '';

    const button = doc.getElementById('ztts-test-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    button.click();

    let noneAt = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      if (creditsS.textContent === 'No credits left' && creditsP.textContent === 'Unlimited') { noneAt = Date.now() - t0; break; }
      await sleep(150);
    }
    out.refreshedAtMs = noneAt;
    const paneRoot = doc.querySelector('.ztts-pane');
    const accentRed = win.getComputedStyle(paneRoot).getPropertyValue('--accent-red');
    const probe = doc.createElement('description');
    paneRoot.appendChild(probe);
    probe.style.color = 'var(--accent-red)';
    const redComputed = win.getComputedStyle(probe).color;
    probe.remove();
    const tierState = (tier, tierText) => {
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      return {
        text: text ? text.textContent : null,
        expectedText: tierText,
        noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
        computedColor: text ? win.getComputedStyle(text).color : null,
        buyHidden: buy.hidden === true,
      };
    };
    out.standardAfterWrap = tierState('standard', 'No credits left');
    out.premiumAfterWrap = tierState('premium', 'Unlimited');
    out.accentRedVar = accentRed.trim();
    out.redProbeComputed = redComputed;
    out.standardColorIsAccentRed = out.standardAfterWrap.computedColor === redComputed;
    out.standardResultLine = result.textContent;

    // --- Restore getAPIClient, refresh again. ---
    Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    out.getAPIClientRestored = Zotero.Sync.Runner.getAPIClient === S.getAPIClientOriginal;
    creditsS.textContent = '';
    creditsP.textContent = '';
    button.click();
    let backAt = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 20000) {
      if (creditsS.textContent === expectedStandard && creditsP.textContent === expectedPremium) { backAt = Date.now() - t1; break; }
      await sleep(150);
    }
    out.backAtMs = backAt;
    out.standardAfterRestore = tierState('standard', expectedStandard);
    out.premiumAfterRestore = tierState('premium', expectedPremium);
    out.standardAfterRestore.textMatchesItem2 = out.standardAfterRestore.text === expectedStandard;
    out.premiumAfterRestore.textMatchesItem2 = out.premiumAfterRestore.text === expectedPremium;
    out.resultLineAfterRestore = result.textContent;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
