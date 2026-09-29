// Item 2 (issues #159 + #140 beta5): the TIME left on open. Reuses the window
// 02 left open. diagnostics.zoteroTiers() (async) must answer credits.standard
// = { credits: S, cheapest: 1, dearest: 1, state: { kind: 'time', low: S,
// high: S }, text: 'Remaining time: <S in the plugin's own form>' } and
// credits.premium = { credits: P, cheapest: 10, dearest: 30,
// state: { kind: 'time', low: P/30, high: P/10 }, text: 'Remaining time:
// <P/30> – <P/10>, depending on voice' } — each minute count rounded up,
// written by the plugin's OWN messages (ztts-duration-*: '1h 54min', NOT
// Zotero's narrow Intl '1h 54m'; the expected strings are computed here from
// the same figures with a mirror of those messages). The checks' messages are
// "Signed in: N Standard voices." / "… Premium voices." with no credits in
// them (the #159 change). The pane: both credits rows shown, each text the
// diagnostic's `text`, no data-ztts-none, both buy links HIDDEN — since beta5
// Add more time shows only when the dearest voice is under 3 minutes
// (offersMoreTime); at the owner's figures (114min / 8.6min) neither shows —
// both Log in links hidden. params: none. state: writes zoteroTiersFull; reads
// creditsTextStandard/Premium written by 02.
(async () => {
  const out = { step: 'credits-on-open' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02-credits-pane-structure.js first');
    const doc = win.document;

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    S.zoteroTiersFull = zt;

    // The plugin's OWN form (src/core/time-left.ts mirrors ztts-duration-*):
    // minutes rounded up, '26min' / '1h 54min' / '34d 17h 20min'; the 90d+
    // top is '90d'. Zotero's narrow Intl.DurationFormat ('1h 54m') is what
    // the plugin stopped using — recorded only.
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
    const overUnlimited = () => '90d';
    out.formatter = { nativeDurationFormat: !!(typeof Intl !== 'undefined' && Intl.DurationFormat), intlNarrowProbe: (typeof Intl !== 'undefined' && Intl.DurationFormat) ? new Intl.DurationFormat(undefined, { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' }).format({ days: 0, hours: 1, minutes: 54 }) : null };

    const cs = zt.credits && zt.credits.standard;
    const cp = zt.credits && zt.credits.premium;
    const Sfig = cs ? cs.credits : null;
    const Pfig = cp ? cp.credits : null;
    // creditText over creditState, mirrored (src/ui/zotero-credit-rows.ts):
    // 'none' → 0min, 'unlimited' → Unlimited, 'time' → the range with a
    // 90d+ top when the cheapest voice's time passes 90 days.
    const standardText = (credits) => credits === null ? null
      : credits <= 0 ? `Remaining time: ${fmtMinutes(0)}`
      : `Remaining time: ${fmtMinutes(credits)}`;
    const premiumText = (credits) => {
      if (credits === null) return null;
      if (credits <= 0) return `Remaining time: ${fmtMinutes(0)}`;
      const low = credits / 30;
      if (low > UNLIMITED_MIN) return 'Remaining time: Unlimited';
      const high = credits / 10;
      const lowTxt = fmtMinutes(low);
      const highTxt = high > UNLIMITED_MIN ? `${overUnlimited()}+` : fmtMinutes(high);
      return lowTxt === highTxt ? `Remaining time: ${lowTxt}` : `Remaining time: ${lowTxt} – ${highTxt}, depending on voice`;
    };
    const offersMoreTime = (state) => state.kind === 'none' || (state.kind === 'time' && state.low < 3);
    const expectedStandardText = Sfig === null ? null : standardText(Sfig);
    const expectedPremiumText = Pfig === null ? null : premiumText(Pfig);
    out.creditsDiagnostic = {
      standard: cs, premium: cp,
      standardShapeOk: !!cs && cs.cheapest === 1 && cs.dearest === 1 && cs.state && cs.state.kind === 'time'
        && cs.state.low === Sfig && cs.state.high === Sfig,
      premiumShapeOk: !!cp && cp.cheapest === 10 && cp.dearest === 30 && cp.state && cp.state.kind === 'time'
        && Math.abs(cp.state.low - Pfig / 30) < 1e-9 && Math.abs(cp.state.high - Pfig / 10) < 1e-9,
      expectedStandardText, expectedPremiumText,
      standardTextMatchesFormula: !!cs && cs.text === expectedStandardText,
      premiumTextMatchesFormula: !!cp && cp.text === expectedPremiumText,
      overUnlimitedTop: overUnlimited(),
    };
    out.checks = {
      standard: zt.checks['zotero-standard'],
      premium: zt.checks['zotero-premium'],
      standardMessageFormatOk: /^Signed in: [\d,]+ Standard voices\.$/.test(zt.checks['zotero-standard'].message),
      premiumMessageFormatOk: /^Signed in: [\d,]+ Premium voices\.$/.test(zt.checks['zotero-premium'].message),
      noCreditsWordInMessages: !/credit/i.test(zt.checks['zotero-standard'].message) && !/credit/i.test(zt.checks['zotero-premium'].message),
    };

    const pane = {};
    for (const tier of ['standard', 'premium']) {
      const diagText = tier === 'standard' ? (cs && cs.text) : (cp && cp.text);
      const diagState = tier === 'standard' ? (cs && cs.state) : (cp && cp.state);
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      const wantBuyHidden = !offersMoreTime(diagState || { kind: 'unknown' });
      pane[tier] = {
        rowHidden: row.hidden === true,
        text: text ? text.textContent : null,
        diagnosticText: diagText,
        textMatchesDiagnostic: !!text && text.textContent === diagText,
        noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
        buyHidden: buy.hidden === true,
        buyHiddenMatchesOffersMoreTime: buy.hidden === true === wantBuyHidden,
        wantBuyHidden,
        logInHidden: logIn.hidden === true,
      };
    }
    out.pane = pane;
    out.paintedTextsUnchangedSinceStructure = doc.getElementById('ztts-zotero-credits-standard').textContent === S.creditsTextStandard
      && doc.getElementById('ztts-zotero-credits-premium').textContent === S.creditsTextPremium;

    // Briefly confirm stability (the figure is read at load, not ticking):
    await sleep(1500);
    out.textAfter1s5 = {
      standard: doc.getElementById('ztts-zotero-credits-standard').textContent,
      premium: doc.getElementById('ztts-zotero-credits-premium').textContent,
    };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
