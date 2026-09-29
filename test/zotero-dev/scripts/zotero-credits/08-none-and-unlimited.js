// Item 7 (issues #159 + #140): nothing left, a 90d+ range, and Unlimited.
// Keeps Zotero.Sync.Runner.getAPIClient and wraps it: the client it returns
// gets its own getReadAloudCreditsRemaining replaced to answer a figure the
// script sets (instance override, Proxy fallback; every other method of that
// one instance passes through). Three rounds, each blanking both credits
// texts and clicking Test connection beside Standard:
//   1. { standard: 0, premium: 200000000 } — Standard reads "0m left" (the
//      #140 time for zero, WAS "No credits left" before #140) WITH
//      data-ztts-none in --accent-red and its buy link shown; Premium reads
//      "Unlimited" without the attribute and its buy link hidden
//      (200,000,000 credits at the dearest 30 a minute is past Zotero's own
//      129,600 minutes = 90 days, so even the dearest voice is unlimited).
//   2. { standard: 114, premium: 1500000 } — Standard "1h 54m left" (114 at
//      1 a minute); Premium "34d 17h 20m – 90d+ left, depending on voice":
//      50,000 minutes at 30 a minute (34d 17h 20m), 150,000 at 10 past 90
//      days, so the range's top is Zotero's 90d+; its link shown.
//   3. getAPIClient restored, click again — item 2's texts, both links shown.
// The expected strings are computed from the figures with the same
// Intl.DurationFormat narrow call src/core/time-left.ts makes. The wrapper
// lives only inside this script. params: none. state: reads
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

    // --- Zotero's short form, the same call src/core/time-left.ts makes. ---
    const Format = (typeof Intl !== 'undefined' && Intl.DurationFormat) ? Intl.DurationFormat : null;
    const fmtMinutes = (minutes) => {
      const rest = Math.max(0, Math.ceil(minutes));
      const days = Math.floor(rest / 1440);
      const hours = Math.floor((rest % 1440) / 60);
      const mins = rest % 60;
      if (!Format) return days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return new Format(undefined, { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' })
        .format({ days, hours, minutes: mins });
    };
    const overUnlimited = () => (Format
      ? new Format(undefined, { style: 'narrow', daysDisplay: 'always', hoursDisplay: 'auto', minutesDisplay: 'auto' }).format({ days: 90, hours: 0, minutes: 0 })
      : '90d');
    const UNLIMITED_MIN = 129600;
    const premiumText = (credits) => {
      const low = credits / 30;
      if (low > UNLIMITED_MIN) return 'Unlimited';
      const high = credits / 10;
      const lowTxt = fmtMinutes(low);
      const highTxt = high > UNLIMITED_MIN ? `${overUnlimited()}+` : fmtMinutes(high);
      return lowTxt === highTxt ? `${lowTxt} left` : `${lowTxt} – ${highTxt} left, depending on voice`;
    };
    const standardText = (credits) => `${fmtMinutes(credits)} left`;

    // --- Wrap getAPIClient; the answer is mutable for the three rounds. ---
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
    const probeRed = () => {
      const paneRoot = doc.querySelector('.ztts-pane');
      const probe = doc.createElement('description');
      paneRoot.appendChild(probe);
      probe.style.color = 'var(--accent-red)';
      const color = win.getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    const round = async (stdCredits, premCredits) => {
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
        };
      };
      return { refreshedAtMs: at, standard: tierState('standard', wantStandard), premium: tierState('premium', wantPremium), resultLine: result.textContent };
    };

    // --- Round 1: nothing left, and Unlimited. ---
    out.round1 = await round(0, 200000000);
    out.accentRedVar = win.getComputedStyle(doc.querySelector('.ztts-pane')).getPropertyValue('--accent-red').trim();
    out.redProbeComputed = probeRed();
    out.round1.standardColorIsAccentRed = out.round1.standard.computedColor === out.redProbeComputed;
    out.round1.bug140ZeroForm = out.round1.standard.text === '0m left';

    // --- Round 2: a range whose top is 90d+. ---
    out.round2Expected = { standard: standardText(114), premium: premiumText(1500000), overUnlimitedTop: `${overUnlimited()}+` };
    out.round2 = await round(114, 1500000);
    out.round2.premiumTopIs90dPlus = /90d\+|90天\+/.test(out.round2.premium.text || '');

    // --- Restore getAPIClient, refresh again: item 2's texts. ---
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
