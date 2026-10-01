// Run step 2, straight after the tester's zotero_plugin_install (1.16.3-beta8
// over 1.16.3-beta5, in place; beta8 = #140 rebased onto main's #160-#163):
// diagnostics.startup() (synchronous — the JSON string itself), every step ok /
// failed empty, and the BUILD PROOF the brief asks for — the installed bundle,
// not the version string: the plugin XPI in the running profile
// (ProfD/extensions/zotero-tts@xujialiu.top.xpi) is read with nsIZipReader and
// content/zotero-tts.js hashed in Zotero — it must equal the xpi's own entry
// (5360ebe07885cc627590abdff2b6a4efe6921c7ba8579a03f8c8d8cef51829ee, issue
// #140's a9f47c0) and contain the #140 strings:
// `ztts-reminder-used-up` (the used-up reminder's message id), `zoteroRefusals`
// (the new diagnostic) and `ztts-duration-hm` (the plugin's own `1h 54min`
// form), plus `formatOverUnlimited` (the 90d+ range top); the #159 proof
// `ztts-zotero-credits-row` stays in the bundle too. `ztts-player-time-used-up`
// and the player's `addMoreTime` string are GONE since beta5 (the player's
// auto-opened alert and its buy-time command were removed).
// content/preferences.css must still carry `flex-shrink: 0` in
// label.ztts-help[value] (issue #158) AND the #159 gap rule — since e86555c
// the selector is `#ztts-zotero-section description > span + label[is="zotero-text-link"]`
// with `margin-inline-start: 6px` — plus the red rule for `[data-ztts-none]`.
// diagnostics.zoteroTiers() must carry `credits`, each tier's state of kind
// 'time' (issue #140; 'left' was #159's shape), and the new
// diagnostics.zoteroRefusals() must answer `last: null` (nothing refused yet).
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
    const count = (needle) => (jsText.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const gapRule = cssText.match(/#ztts-zotero-section description > span \+ label\[is="zotero-text-link"\][^}]*\{[^}]*\}/);
    out.bundleProof = {
      jsSha256: hex,
      jsSha256MatchesXpiEntry: hex === '5360ebe07885cc627590abdff2b6a4efe6921c7ba8579a03f8c8d8cef51829ee',
      reminderUsedUpOccurrences: count('ztts-reminder-used-up'),
      zoteroRefusalsOccurrences: count('zoteroRefusals'),
      durationHmOccurrences: count('ztts-duration-hm'),
      formatOverUnlimitedOccurrences: count('formatOverUnlimited'),
      creditsRowOccurrences: count('ztts-zotero-credits-row'),
      issue140StringsPresent: count('ztts-reminder-used-up') > 0 && count('zoteroRefusals') > 0 && count('ztts-duration-hm') > 0 && count('formatOverUnlimited') > 0,
      playerAlertStringsGone: count('ztts-player-time-used-up') === 0 && count('addMoreTime') === 0,
      creditsRowPresent: count('ztts-zotero-credits-row') > 0,
      cssHelpRuleHasFlexShrinkZero: /label\.ztts-help\[value\][\s\S]*?flex-shrink: 0;/.test(cssText),
      cssZoteroLinkGapRulePresent: !!gapRule,
      cssZoteroLinkGapRule: gapRule ? gapRule[0] : null,
      cssZoteroLinkGapIs6px: !!gapRule && /margin-inline-start: 6px/.test(gapRule[0]),
      cssNoneAttrRedRulePresent: /#ztts-zotero-section \[data-ztts-none\][^}]*\{[^}]*--accent-red/.test(cssText),
    };

    // --- diagnostics.zoteroTiers() must carry `credits`, state kind 'time' (#140). ---
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    S.zoteroTiersFirst = zt;
    // --- The new refusal diagnostic exists and reports nothing yet (#140 beta5). ---
    const zr = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroRefusals());
    out.zoteroRefusals = { feature: zr.feature, last: zr.last ?? null, lastIsNull: zr.last === null };

    out.zoteroTiers = {
      feature: zt.feature,
      hasCreditsField: Object.prototype.hasOwnProperty.call(zt, 'credits'),
      creditsShape: zt.credits && typeof zt.credits === 'object'
        ? {
            standard: zt.credits.standard && {
              credits: zt.credits.standard.credits,
              cheapest: zt.credits.standard.cheapest,
              dearest: zt.credits.standard.dearest,
              stateKind: zt.credits.standard.state ? zt.credits.standard.state.kind : null,
              state: zt.credits.standard.state,
              text: zt.credits.standard.text,
            },
            premium: zt.credits.premium && {
              credits: zt.credits.premium.credits,
              cheapest: zt.credits.premium.cheapest,
              dearest: zt.credits.premium.dearest,
              stateKind: zt.credits.premium.state ? zt.credits.premium.state.kind : null,
              state: zt.credits.premium.state,
              text: zt.credits.premium.text,
            },
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
