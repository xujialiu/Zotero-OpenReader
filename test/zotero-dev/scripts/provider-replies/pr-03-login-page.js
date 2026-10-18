// pr-03 — item 2 (#199): a login page as audio. Voices answer 200 JSON with one voice; speech
// answers 200 text/html. Test connection reads `Connection failed: … answered with a web page
// (text/html), not audio …` and Enable does not switch the section on. Needs the settings window:
// opens it, navigates to the pane, clicks and polls in ONE script (§2 transient states).
// The stub must be in login-page mode (voices 200 one voice; speech 200 text/html) before this runs.
(async () => {
  const out = {};
  const prefOn = () => Zotero.Prefs.get('zotero-tts.compatible.enabled', true);
  // the section goes into this check OFF (it was on for the voice-switch stub runs): Enable is the
  // button under test; its failed check must leave it off
  Zotero.Prefs.set('zotero-tts.compatible.enabled', false);
  await new Promise((r) => setTimeout(r, 300));
  out.enabledBefore = prefOn();
  // close an open settings window, then open fresh on the plugin pane (§1)
  const existing = Services.wm.getMostRecentWindow('zotero:pref');
  if (existing) { existing.close(); const w0 = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - w0 < 5000) await new Promise((r) => setTimeout(r, 200)); }
  await Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  const w0 = Date.now();
  let win = null;
  while (Date.now() - w0 < 10000) {
    win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) { out.error = 'no settings window'; return JSON.stringify(out); }
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) { out.navErr = String(e); }
  const w1 = Date.now();
  while (Date.now() - w1 < 8000 && !win.document.getElementById('ztts-provider-compatible')) await new Promise((r) => setTimeout(r, 200));
  const testBtn = win.document.getElementById('ztts-test-compatible');
  const result = win.document.getElementById('ztts-test-result-compatible');
  if (!testBtn || !result) { out.error = 'compatible section not found'; return JSON.stringify(out); }

  // Test connection: click and poll the result line in this same script
  testBtn.click();
  const t0 = Date.now();
  let testText = null;
  while (Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 200));
    testText = result.textContent || '';
    if (testText && testText !== 'Testing…' && !/Checking/.test(testText)) break;
  }
  out.testResult = String(testText).slice(0, 220);
  out.testHasWebPage = /answered with a web page \(text\/html\), not audio/.test(out.testResult);
  // the case text said `Connection failed`; the build reports the two-stage check as
  // `Connected, but synthesis failed: …` — same refusal, reported for the case file to correct
  out.testHasFailed = /Connection failed|synthesis failed/.test(out.testResult);

  // Enable: must not switch the section on
  const enableBtn = win.document.getElementById('ztts-enable-compatible');
  enableBtn.click();
  const t1 = Date.now();
  let enableText = null;
  while (Date.now() - t1 < 20000) {
    await new Promise((r) => setTimeout(r, 200));
    enableText = result.textContent || '';
    if (enableText && !/Checking/.test(enableText) && prefOn() !== undefined) {
      if (!/Testing/.test(enableText)) break;
    }
  }
  out.enableResult = String(enableText).slice(0, 220);
  await new Promise((r) => setTimeout(r, 400));
  out.enabledAfter = Zotero.Prefs.get('extensions.zotero.zotero-tts.compatible.enabled', true);
  out.winLeftOpen = true; // pr-99 closes it
  out.pass = !!(out.testHasFailed && out.testHasWebPage && out.enabledAfter === false);
  return JSON.stringify(out);
})()
