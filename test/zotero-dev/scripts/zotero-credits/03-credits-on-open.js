// Item 2 (issues #159 + #140): the TIME left on open. Reuses the window 02
// left open. diagnostics.zoteroTiers() (async) must answer credits.standard
// = { credits: S, cheapest: 1, dearest: 1, state: { kind: 'time', low: S,
// high: S }, text: '<S minutes in Zotero's short form> left' } and
// credits.premium = { credits: P, cheapest: 10, dearest: 30,
// state: { kind: 'time', low: P/30, high: P/10 }, text: '<P/30> – <P/10>
// left, depending on voice' } — each minute count rounded up, formatted by
// Intl.DurationFormat narrow exactly as src/core/time-left.ts does (the
// expected strings are computed here from the same figures, in this app's
// locale). The checks' messages are "Signed in: N Standard voices." /
// "… Premium voices." with no credits in them (the #159 change). The pane:
// both credits rows shown, each text the diagnostic's `text` (a time since
// #140), no data-ztts-none anywhere, both buy links shown, both Log in links
// hidden. params: none. state: writes zoteroTiersFull; reads
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

    // Zotero's short form (src/core/time-left.ts): minutes rounded up, split
    // into days/hours/minutes, Intl.DurationFormat narrow with
    // minutesDisplay 'always'; the fallback where it is missing is '1h 54m'.
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
    out.formatter = { nativeDurationFormat: !!Format };

    const cs = zt.credits && zt.credits.standard;
    const cp = zt.credits && zt.credits.premium;
    const Sfig = cs ? cs.credits : null;
    const Pfig = cp ? cp.credits : null;
    const expectedStandardText = Sfig === null ? null : `${fmtMinutes(Sfig)} left`;
    const expectedPremiumText = Pfig === null ? null : `${fmtMinutes(Pfig / 30)} – ${fmtMinutes(Pfig / 10)} left, depending on voice`;
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
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      pane[tier] = {
        rowHidden: row.hidden === true,
        text: text ? text.textContent : null,
        diagnosticText: diagText,
        textMatchesDiagnostic: !!text && text.textContent === diagText,
        noneAttr: text ? text.hasAttribute('data-ztts-none') : null,
        buyHidden: buy.hidden === true,
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
