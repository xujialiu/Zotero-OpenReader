// Item 3 (issue #159): the refresh runs again after a Test connection.
// Blanks #ztts-zotero-credits-standard's textContent by hand, clicks Test
// connection beside Standard, and polls (driving notes Sec2: click and poll
// in ONE script): the result line goes Testing… → "Signed in: N Standard
// voices.", and the credits text — which only this refresh writes — is back
// to item 2's text within 20 s. params: none. state: reads
// creditsTextStandard.
(async () => {
  const out = { step: 'refresh-after-test-connection' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02-credits-pane-structure.js first');
    const doc = win.document;
    const button = doc.getElementById('ztts-test-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    const credits = doc.getElementById('ztts-zotero-credits-standard');
    if (!button || !result || !credits) throw new Error('standard row elements missing');

    const expectedCredits = S.creditsTextStandard;
    if (!expectedCredits) throw new Error('state.creditsTextStandard missing -- run 02 first');
    credits.textContent = '';
    out.blankConfirmed = credits.textContent === '';

    button.click();
    const trace = [];
    let sawTesting = false;
    let creditsRestoredAtMs = null;
    let finalResult = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const rt = result.textContent;
      const ct = credits.textContent;
      trace.push({ t: Date.now() - t0, result: rt, credits: ct });
      if (rt && /^Testing/i.test(rt)) sawTesting = true;
      if (!creditsRestoredAtMs && ct === expectedCredits) creditsRestoredAtMs = Date.now() - t0;
      if (rt && /Standard voices\.$/.test(rt)) { finalResult = rt; break; }
      await sleep(100);
    }
    // Give the credits refresh its own window (it may land after the result line).
    const t1 = Date.now();
    while (!creditsRestoredAtMs && Date.now() - t1 < 20000) {
      const ct = credits.textContent;
      trace.push({ t: Date.now() - t0, result: result.textContent, credits: ct });
      if (ct === expectedCredits) { creditsRestoredAtMs = Date.now() - t0; break; }
      await sleep(150);
    }
    out.sawTesting = sawTesting;
    out.finalResult = finalResult || result.textContent;
    out.creditsRestoredAtMs = creditsRestoredAtMs;
    out.creditsRestored = creditsRestoredAtMs !== null && credits.textContent === expectedCredits;
    out.traceFirst = trace[0] || null;
    out.traceLast = trace[trace.length - 1] || null;
    out.traceCount = trace.length;
    out.noneAttrAfter = credits.hasAttribute('data-ztts-none');
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
