// Item 7 (issues #159 + #140 beta5): nothing left, the link's place when
// shown, an under-3 range, a 90d+ range, and Unlimited. Keeps
// Zotero.Sync.Runner.getAPIClient and wraps it (instance override, Proxy
// fallback): the client it returns gets its own getReadAloudCreditsRemaining
// replaced to answer a figure the script sets. Four rounds, each blanking
// both credits texts and clicking Test connection beside Standard:
//   1. { standard: 0, premium: 200000000 } — Standard reads "Remaining time:
//      0min" WITH data-ztts-none in --accent-red and its buy link SHOWN
//      (0 credits offer more time); its test result fails with "No remaining
//      time on Standard. Add more time first." (beta5's check, #140);
//      Premium reads "Remaining time: Unlimited" without the attribute, its
//      buy link hidden (200,000,000 at the dearest 30 a minute is past
//      Zotero's 129,600 minutes = 90 days).
//   2. { standard: 114, premium: 80 } — Standard item 2's text; Premium
//      "Remaining time: 3min – 8min, depending on voice" (80: 2.67 min at 30
//      → written 3min, under 3 → its buy link SHOWN — measured here: 6 px
//      after the text's right edge, same baseline (Range rects top/bottom
//      equal)); Standard's test result "Signed in: N Standard voices."
//   3. { standard: 114, premium: 1500000 } — Premium "Remaining time:
//      34d 17h 20min – 90d+, depending on voice" (50,000 minutes at 30;
//      150,000 at 10 past 90 days → the 90d+ top), its link hidden (50,000
//      minutes is not under 3).
//   4. getAPIClient restored, click again — item 2's texts, both links
//      hidden (the owner's figures are 3 minutes or more).
// The expected strings are computed from the figures with a mirror of the
// plugin's own messages (ztts-duration-*: '0min', '3min', '1h 54min',
// '34d 17h 20min', '90d'). The wrapper lives only inside this script.
// params: none. state: reads creditsTextStandard/Premium; keeps
// getAPIClientOriginal (restored here).
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

    // --- The plugin's own form (ztts-duration-*), minutes rounded up. ---
    const fmtMinutes = (minutes) => {
      const rest = Math.max(0, Math.ceil(minutes));
      const days = Math.floor(rest / 1440);
      const hours = Math.floor((rest % 1440) / 60);
      const mins = rest % 60;
      if (days > 0) return `${days}d ${hours}h ${mins}min`;
      if (hours > 0) return `${hours}h ${mins}min`;
      return `${mins}min`;
    };
    const UNLIMITED_MIN = 129600;
    const premiumText = (credits) => {
      if (credits <= 0) return `Remaining time: ${fmtMinutes(0)}`;
      const low = credits / 30;
      if (low > UNLIMITED_MIN) return 'Remaining time: Unlimited';
      const high = credits / 10;
      const lowTxt = fmtMinutes(low);
      const highTxt = high > UNLIMITED_MIN ? '90d+' : fmtMinutes(high);
      return lowTxt === highTxt ? `Remaining time: ${lowTxt}` : `Remaining time: ${lowTxt} – ${highTxt}, depending on voice`;
    };
    const standardText = (credits) => credits <= 0 ? `Remaining time: ${fmtMinutes(0)}` : `Remaining time: ${fmtMinutes(credits)}`;

    // --- Wrap getAPIClient; the answer is mutable for the rounds. ---
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.getAPIClientOriginal = orig;
    let answer = { standardCreditsRemaining: 0, premiumCreditsRemaining: 200000000 };
    let wrappedHow = 'instance-override';
    Zotero.Sync.Runner.getAPIClient = function (options) {
      const client = orig.apply(this, arguments);
      try {
        client.getReadAloudCreditsRemaining = async () => ({ ...answer });
      } catch (e) {
        wrappedHow = 'proxy-fallback (' + String(e).slice(0, 60) + ')';
        return new Proxy(client, {
          get(target, prop) {
            if (prop === 'getReadAloudCreditsRemaining') return async () => ({ ...answer });
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
    const button = doc.getElementById('ztts-test-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');

    // The link's place when shown: 6 px after the text's right edge, on the
    // same baseline — Range rects over each one's text node, top/bottom equal.
    const linkGeometry = (tier) => {
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      if (!text || !buy || buy.hidden === true) return { shown: false };
      const tr = text.getBoundingClientRect();
      const br = buy.getBoundingClientRect();
      const range = doc.createRange();
      const textRects = (range.selectNodeContents(text), range.getClientRects());
      const textLine = textRects.length ? textRects[0] : null;
      const buyRects = (range.selectNodeContents(buy), range.getClientRects());
      const buyLine = buyRects.length ? buyRects[0] : null;
      const gap = +(br.left - tr.right).toFixed(2);
      return {
        shown: true,
        gapBuyLeftMinusTextRight: gap,
        gapIsSixPx: Math.abs(gap - 6) <= 0.5,
        textLineTop: textLine ? +textLine.top.toFixed(2) : null,
        textLineBottom: textLine ? +textLine.bottom.toFixed(2) : null,
        buyLineTop: buyLine ? +buyLine.top.toFixed(2) : null,
        buyLineBottom: buyLine ? +buyLine.bottom.toFixed(2) : null,
        baselineDeltaTop: textLine && buyLine ? +(buyLine.top - textLine.top).toFixed(2) : null,
        baselineDeltaBottom: textLine && buyLine ? +(buyLine.bottom - textLine.bottom).toFixed(2) : null,
        sameBaseline: !!(textLine && buyLine) && Math.abs(buyLine.top - textLine.top) <= 0.5 && Math.abs(buyLine.bottom - textLine.bottom) <= 0.5,
      };
    };

    const round = async (stdCredits, premCredits, wantResultRe) => {
      const wantStandard = standardText(stdCredits);
      const wantPremium = premiumText(premCredits);
      answer = { standardCreditsRemaining: stdCredits, premiumCreditsRemaining: premCredits };
      creditsS.textContent = '';
      creditsP.textContent = '';
      button.click();
      let at = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        if (creditsS.textContent === wantStandard && creditsP.textContent === wantPremium) { at = Date.now() - t0; break; }
        await sleep(150);
      }
      const tierState = (tier, tierText) => {
        const text = doc.getElementById('ztts-zotero-credits-' + tier);
        const buy = doc.getElementById('ztts-zotero-buy-' + tier);
        return {
          text: text ? text.textContent : null,
          expectedText: tierText,
          noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
          computedColor: text ? win.getComputedStyle(text).color : null,
          buyHidden: buy.hidden === true,
          link: linkGeometry(tier),
        };
      };
      return {
        refreshedAtMs: at,
        standard: tierState('standard', wantStandard),
        premium: tierState('premium', wantPremium),
        resultLine: result.textContent,
        resultLineMatches: wantResultRe ? wantResultRe.test(result.textContent) : null,
      };
    };

    // --- Round 1: nothing left (link shown, test refused), and Unlimited. ---
    out.round1 = await round(0, 200000000, /^No remaining time on Standard\. Add more time first\.$/);
    out.accentRedVar = win.getComputedStyle(doc.querySelector('.ztts-pane')).getPropertyValue('--accent-red').trim();
    const paneRoot = doc.querySelector('.ztts-pane');
    const probe = doc.createElement('description');
    paneRoot.appendChild(probe);
    probe.style.color = 'var(--accent-red)';
    out.redProbeComputed = win.getComputedStyle(probe).color;
    probe.remove();
    out.round1.standardColorIsAccentRed = out.round1.standard.computedColor === out.redProbeComputed;
    out.round1.standardLink = linkGeometry('standard');
    out.round1.zeroForm = out.round1.standard.text === 'Remaining time: 0min';
    out.round1.unlimitedForm = out.round1.premium.text === 'Remaining time: Unlimited';

    // --- Round 2: a range under 3 minutes at the dearest voice — the link shows. ---
    out.round2 = await round(114, 80, /^Signed in: [\d,]+ Standard voices\.$/);

    // --- Round 3: a range whose top is 90d+; the link hides again. ---
    out.round3 = await round(114, 1500000, /^Signed in: [\d,]+ Standard voices\.$/);
    out.round3.premiumTopIs90dPlus = /90d\+/.test(out.round3.premium.text || '') && out.round3.premium.text === out.round3.premium.expectedText;

    // --- Restore getAPIClient, refresh again: item 2's texts, links hidden. ---
    Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    out.getAPIClientRestored = Zotero.Sync.Runner.getAPIClient === S.getAPIClientOriginal;
    answer = { standardCreditsRemaining: null, premiumCreditsRemaining: null };
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
    const tierStateFinal = (tier, expected) => {
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      return {
        text: text ? text.textContent : null,
        expectedText: expected,
        textMatchesItem2: !!text && text.textContent === expected,
        noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
        buyHidden: buy.hidden === true,
      };
    };
    out.standardAfterRestore = tierStateFinal('standard', expectedStandard);
    out.premiumAfterRestore = tierStateFinal('premium', expectedPremium);
    out.resultLineAfterRestore = result.textContent;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
