// Item 2 (issue #159): the credits on open. Reuses the window 02 left open.
// diagnostics.zoteroTiers() (async) must answer credits.standard =
// { credits: S, cheapest: 1, state: { kind: 'left', credits: S } } and
// credits.premium the same with cheapest 10; the checks' messages are
// "Signed in: N Standard voices." / "… Premium voices." with no credits in
// them (the #159 change: the message no longer carries the figure). The
// pane: both credits rows shown, each text "<formatted S> credits left"
// (Fluent's locale grouping), no data-ztts-none anywhere, both buy links
// shown, both Log in links hidden. params: none. state: reads
// creditsTextStandard/Premium written by 02; writes zoteroTiersFull.
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
    const locale = Zotero.locale || 'en-US';
    const fmt = (n) => new Intl.NumberFormat(locale).format(n);

    const cs = zt.credits && zt.credits.standard;
    const cp = zt.credits && zt.credits.premium;
    out.creditsDiagnostic = {
      standard: cs, premium: cp,
      standardShapeOk: !!cs && cs.cheapest === 1 && cs.state && cs.state.kind === 'left' && cs.state.credits === cs.credits,
      premiumShapeOk: !!cp && cp.cheapest === 10 && cp.state && cp.state.kind === 'left' && cp.state.credits === cp.credits,
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
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      const figure = tier === 'standard' ? cs.credits : cp.credits;
      const expected = (new Intl.NumberFormat(locale).format(figure)) + ' credits left';
      pane[tier] = {
        rowHidden: row.hidden === true,
        text: text ? text.textContent : null,
        expectedText: expected,
        textMatchesFigure: !!text && text.textContent === expected,
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
