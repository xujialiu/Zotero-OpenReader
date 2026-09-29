// Item 8 (NEW, issue #140 beta5): Enable refuses a Zotero tier whose credits
// are 0. Keeps Zotero.Sync.Runner.getAPIClient and wraps it (instance
// override, Proxy fallback — the same wrap 08 uses), turns Premium OFF
// through its own switch (as item 4 did), then:
//   1. answer { standard: 114, premium: 0 } → click Enable beside Premium:
//      "Checking…" first, then the result "No remaining time on Premium.
//      Add more time first."; the switch STAYS OFF (the pref unchanged —
//      beta5's check fails the tier before it is switched on); the credits
//      row then reads "Remaining time: 0min" with data-ztts-none in
//      --accent-red and its Add more time link shown. The row's refresh is
//      async beside the check (first run: it landed after the refusal was
//      read, and its stale 0min was still there at the second Enable), so
//      the row is POLLED for its text after each Enable.
//   2. answer 20 → click Enable again → the pref goes true, the result
//      "Signed in: N Premium voices.", the label Disable; the credits row
//      refreshes to the 20-figure range.
// The wrapper is restored here; the pref's final owner value is 99's typed
// restore (Premium ends ON here, which the time-left kit needs anyway).
// params: none. state: reads nothing from earlier scripts; writes nothing
// later scripts need.
(async () => {
  const out = { step: 'enable-at-zero' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02 first');
    const doc = win.document;
    const toggle = doc.getElementById('ztts-enable-zotero-premium');
    const result = doc.getElementById('ztts-test-result-zotero-premium');
    const text = doc.getElementById('ztts-zotero-credits-premium');
    const buy = doc.getElementById('ztts-zotero-buy-premium');
    if (!toggle || !result || !text || !buy) throw new Error('premium row elements missing');
    const pref = () => Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    const label = () => toggle.getAttribute('label');
    const paneRoot = doc.querySelector('.ztts-pane');

    // --- Wrap getAPIClient; the answer is mutable. ---
    const orig = Zotero.Sync.Runner.getAPIClient;
    if (typeof orig !== 'function') throw new Error('Zotero.Sync.Runner.getAPIClient is not a function');
    S.getAPIClientOriginal = orig;
    let answer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 0 };
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

    // --- Premium off through its own switch (item 4's setup). ---
    out.prefBefore = pref();
    if (pref() !== false) {
      toggle.click();
      const tOff = Date.now();
      while (pref() !== false && Date.now() - tOff < 25000) await sleep(150);
    }
    out.premiumOffBefore = pref() === false;

    // --- Enable at 0: refused. ---
    const trace = [];
    answer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 0 };
    toggle.click();
    let sawChecking = false;
    let refusedAtMs = null;
    let finalLabel = null;
    let prefAfterRefusal = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const rt = result.textContent;
      trace.push({ t: Date.now() - t0, result: rt, label: label(), pref: pref() });
      if (rt && /Checking/i.test(rt)) sawChecking = true;
      if (rt && /No remaining time on Premium\./.test(rt)) {
        refusedAtMs = Date.now() - t0;
        finalLabel = label();
        prefAfterRefusal = pref();
        break;
      }
      await sleep(80);
    }
    out.refusalTraceFirst = trace[0] || null;
    out.refusalTraceLast = trace[trace.length - 1] || null;
    out.refusalTraceCount = trace.length;
    out.sawChecking = sawChecking;
    out.refusedAtMs = refusedAtMs;
    out.refusalResult = result.textContent;
    out.refusalResultExact = result.textContent === 'No remaining time on Premium. Add more time first.';
    out.labelAfterRefusal = finalLabel || label();
    out.prefUnchangedByRefusal = prefAfterRefusal === false;
    // The row's own refresh (onChecked) lands beside the check — poll it.
    let rowSettledAtMs = null;
    const tRow = Date.now();
    while (Date.now() - tRow < 8000) {
      if (text.textContent === 'Remaining time: 0min') { rowSettledAtMs = Date.now() - tRow; break; }
      await sleep(100);
    }
    out.rowSettledAtMs = rowSettledAtMs;
    const redProbe = doc.createElement('description');
    paneRoot.appendChild(redProbe);
    redProbe.style.color = 'var(--accent-red)';
    const accentRed = win.getComputedStyle(redProbe).color;
    redProbe.remove();
    out.rowAfterRefusal = {
      text: text.textContent,
      textIsZeroMin: text.textContent === 'Remaining time: 0min',
      noneAttr: text.hasAttribute('data-ztts-none'),
      computedColor: win.getComputedStyle(text).color,
      colorIsAccentRed: win.getComputedStyle(text).color === accentRed,
      buyHidden: buy.hidden === true,
    };

    // --- Enable at 20: switched on. ---
    answer = { standardCreditsRemaining: 114, premiumCreditsRemaining: 20 };
    toggle.click();
    let onAtMs = null;
    let onResult = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 25000) {
      const rt = result.textContent;
      if (pref() === true && /Premium voices\.$/.test(rt)) { onAtMs = Date.now() - t1; onResult = rt; break; }
      await sleep(80);
    }
    out.enabledAtMs = onAtMs;
    out.enableResult = onResult || result.textContent;
    out.prefTrueAfter = pref() === true;
    out.labelAfterEnable = label();
    // The 20-figure range, polled the same way (1min at 30 a minute, 2min at 10).
    let rowOnAtMs = null;
    const tRow2 = Date.now();
    while (Date.now() - tRow2 < 8000) {
      if (text.textContent === 'Remaining time: 1min – 2min, depending on voice') { rowOnAtMs = Date.now() - tRow2; break; }
      await sleep(100);
    }
    out.rowOnAtMs = rowOnAtMs;
    out.rowAfterEnable = {
      text: text.textContent,
      textIsTwentyRange: text.textContent === 'Remaining time: 1min – 2min, depending on voice',
      noneAttr: text.hasAttribute('data-ztts-none'),
      buyHidden: buy.hidden === true,
    };

    // --- Wrapper restored; the pref's owner value is 99's typed restore. ---
    Zotero.Sync.Runner.getAPIClient = S.getAPIClientOriginal;
    out.getAPIClientRestored = Zotero.Sync.Runner.getAPIClient === S.getAPIClientOriginal;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
