// Run step 2, straight after the tester's zotero_plugin_install (1.16.2-beta6
// over 1.16.2-beta5, in place): diagnostics.startup() (synchronous — the JSON
// string itself), every step ok / failed empty, and the BUILD PROOF the brief
// asks for — the installed bundle, not the version string: the plugin XPI in
// the running profile (ProfD/extensions/zotero-tts@xujialiu.top.xpi) is read
// with nsIZipReader and content/zotero-tts.js hashed in Zotero — it must
// equal the xpi's own entry (f23dbde3d7db55e8f5176212418c9664b7119a573ed7c4df
// d309c9fddb0f33b1) and contain `ztts-zotero-credits-row` (issue #159's
// zoteroCreditIds template literal, absent from every earlier commit's
// sources by `git log -S` over all refs); content/preferences.css must carry
// `flex-shrink: 0` in label.ztts-help[value] (issue #158) AND the #159 gap
// rule `#ztts-zotero-section description + label[is="zotero-text-link"]`
// with `margin-inline-start: 6px` (absent from beta5 — its links touched the
// text, gap 0).
// diagnostics.zoteroTiers() must carry a `credits` field.
// (First attempt read addon.installPath — null through the AddonManager
// wrapper in this Zotero, as in the 154 run; the profile file is the same
// bytes AddonManager serves.) params: none. state: appends to
// Zotero.__zttsCredits159.
(async () => {
  const out = { step: 'postinstall-startup' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  try {
    const startupRaw = Zotero.ZoteroTTS.diagnostics.startup();
    const startup = JSON.parse(startupRaw);
    S.startup = startup;
    out.startup = {
      version: startup.version,
      stepsOk: startup.steps ? startup.steps.every((s) => s.ok) : null,
      stepCount: startup.steps ? startup.steps.length : null,
      failed: startup.failed || [],
    };

    // --- Installed bundle proof, read from the running profile. ---
    const profD = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
    const xpi = profD.clone();
    xpi.append('extensions');
    xpi.append('zotero-tts@xujialiu.top.xpi');
    if (!xpi.exists()) throw new Error('installed xpi not found in profile');
    out.installedXpiPath = xpi.path;
    const zipReader = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
    zipReader.open(xpi);
    const readEntry = (entryName) => {
      const stream = zipReader.getInputStream(entryName);
      const bis = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
      bis.setInputStream(stream);
      return bis.readByteArray(bis.available());
    };
    const toHex = (bytes) => {
      const view = new Uint8Array(bytes);
      let s = '';
      for (let i = 0; i < view.length; i++) s += view[i].toString(16).padStart(2, '0');
      return s;
    };
    let jsBytes = null;
    let cssText = null;
    try {
      jsBytes = readEntry('content/zotero-tts.js');
      cssText = new TextDecoder().decode(new Uint8Array(readEntry('content/preferences.css')));
    } finally {
      zipReader.close();
    }
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(jsBytes));
    const hex = toHex(new Uint8Array(digest));
    const jsText = new TextDecoder().decode(new Uint8Array(jsBytes));
    const creditsRowHits = (jsText.match(/ztts-zotero-credits-row/g) || []).length;
    const gapRule = cssText.match(/#ztts-zotero-section description \+ label\[is="zotero-text-link"\][^}]*\{[^}]*\}/);
    out.bundleProof = {
      jsSha256: hex,
      jsSha256MatchesXpiEntry: hex === 'f23dbde3d7db55e8f5176212418c9664b7119a573ed7c4dfd309c9fddb0f33b1',
      creditsRowOccurrences: creditsRowHits,
      creditsRowPresent: creditsRowHits > 0,
      cssHelpRuleHasFlexShrinkZero: /label\.ztts-help\[value\][\s\S]*?flex-shrink: 0;/.test(cssText),
      cssZoteroLinkGapRulePresent: !!gapRule,
      cssZoteroLinkGapRule: gapRule ? gapRule[0] : null,
      cssZoteroLinkGapIs6px: !!gapRule && /margin-inline-start: 6px/.test(gapRule[0]),
    };

    // --- diagnostics.zoteroTiers() must carry `credits` (issue #159). ---
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    S.zoteroTiersFirst = zt;
    out.zoteroTiers = {
      feature: zt.feature,
      hasCreditsField: Object.prototype.hasOwnProperty.call(zt, 'credits'),
      creditsShape: zt.credits && typeof zt.credits === 'object'
        ? {
            standard: zt.credits.standard && { credits: zt.credits.standard.credits, cheapest: zt.credits.standard.cheapest, stateKind: zt.credits.standard.state ? zt.credits.standard.state.kind : null },
            premium: zt.credits.premium && { credits: zt.credits.premium.credits, cheapest: zt.credits.premium.cheapest, stateKind: zt.credits.premium.state ? zt.credits.premium.state.kind : null },
          }
        : zt.credits,
      signedIn: zt.signedIn,
      checks: zt.checks,
      switches: zt.switches,
    };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
