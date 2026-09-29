// Item 1 (issue #159): the Zotero section's shape. Opens the settings window
// fresh (driving notes Sec1: close stale, open, navigateToPane regardless of
// the pane it lands on), self-heals both tier switches ON (the run's brief:
// both back to true; found false in this run's baseline), polls the credits
// rows' texts to fill within 20 s of the pane's load, then reads the section
// in document order — h2, note (one line) + ? (gap 4 px after the visible
// note), per tier Standard first: caption (font-weight 600), credits row
// hbox (description + Add more time zotero-text-link), switch row hbox with
// the two buttons as its FIRST children and the Log in link hidden.
// Also captures the section's geometry for the human's judgement (captions,
// credits rows, switch rows). Leaves the settings window OPEN for 03-08.
// params: none. state: creditsTextStandard/Premium for later scripts.
(async () => {
  const out = { step: 'credits-pane-structure' };
  const S = Zotero.__zttsCredits159 || (Zotero.__zttsCredits159 = {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const zh = String(Zotero.locale).startsWith('zh');
  try {
    // --- Open the pane fresh. ---
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
      out.staleClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    } else out.staleClosed = null;

    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (!win) throw new Error('settings window never appeared');
    S.paneWindowOuterID = win.docShell ? win.docShell.outerWindowID : null;
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    let section = doc.getElementById('ztts-zotero-section');
    const t2 = Date.now();
    while (!section && Date.now() - t2 < 8000) {
      await sleep(150);
      section = doc.getElementById('ztts-zotero-section');
    }
    if (!section) throw new Error('ztts-zotero-section never rendered');
    const openedAt = Date.now();

    // --- Self-heal both tier switches ON (polled on the pref). ---
    const clickToPref = async (tier, desired) => {
      const toggle = doc.getElementById('ztts-enable-zotero-' + tier);
      if (!toggle) throw new Error('toggle for ' + tier + ' missing');
      if (Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled') === desired) return { skipped: true };
      toggle.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        if (Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled') === desired) return { skipped: false, ms: Date.now() - t0 };
        await sleep(150);
      }
      throw new Error(tier + ' did not reach ' + desired);
    };
    out.standardSelfHeal = await clickToPref('standard', true);
    out.premiumSelfHeal = await clickToPref('premium', true);

    // --- Poll the credits rows' texts within 20 s of the pane's load. ---
    const creditsText = {};
    const t3 = Date.now();
    let painted = false;
    while (Date.now() - t3 < 20000) {
      const s = doc.getElementById('ztts-zotero-credits-standard');
      const pr = doc.getElementById('ztts-zotero-credits-premium');
      if (s && pr && s.textContent && pr.textContent) { painted = true; break; }
      await sleep(200);
    }
    out.creditsPaintedWithin20s = painted;
    out.creditsPaintedMs = Date.now() - openedAt;
    if (!painted) throw new Error('credits rows never painted within 20 s of pane load');
    creditsText.standard = doc.getElementById('ztts-zotero-credits-standard').textContent;
    creditsText.premium = doc.getElementById('ztts-zotero-credits-premium').textContent;
    S.creditsTextStandard = creditsText.standard;
    S.creditsTextPremium = creditsText.premium;
    out.creditsText = creditsText;

    // --- Section shape in document order. ---
    const describe = (el) => el ? {
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      id: el.id || null,
      l10nId: el.getAttribute ? el.getAttribute('data-l10n-id') : null,
      class: el.getAttribute ? el.getAttribute('class') : null,
      hidden: el.hidden === true,
    } : null;
    out.sectionChildren = Array.from(section.children).map(describe);

    const h2 = section.querySelector('label > h2');
    out.h2Text = h2 ? h2.textContent : null;
    out.h2HasLink = h2 ? !!h2.querySelector('label.zotero-text-link') : null;

    const note = section.querySelector('description[data-l10n-id="ztts-zotero-note"]');
    out.notePresent = !!note;
    out.noteText = note ? note.textContent : null;
    out.noteExpectedText = zh ? 'Zotero 自带的语音，需要登录 Zotero 账户。' : "Zotero's own voices; they need a Zotero account signed in.";
    if (note) {
      const style = win.getComputedStyle(note);
      out.note = {
        clientHeight: note.clientHeight,
        lineHeight: style.lineHeight,
        oneLine: note.clientHeight < 2 * parseFloat(style.lineHeight),
      };
    }

    const help = section.querySelector('label.ztts-help[data-l10n-id="ztts-help-zotero"]');
    out.helpPresent = !!help;
    if (help && note) {
      const hr = help.getBoundingClientRect();
      const nr = note.getBoundingClientRect();
      out.helpAfterNote = {
        helpRect: { x: +hr.x.toFixed(2), y: +hr.y.toFixed(2), w: +hr.width.toFixed(2), h: +hr.height.toFixed(2) },
        gapHelpLeftMinusNoteRight: +(hr.left - nr.right).toFixed(2),
        sameRow: help.parentNode === note.parentNode,
      };
    }

    const tierInfo = (tier) => {
      const caption = section.querySelector('label.ztts-caption[data-l10n-id="ztts-zotero-' + tier + '"]');
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      const switchRow = doc.getElementById('ztts-provider-zotero-' + tier);
      const enable = doc.getElementById('ztts-enable-zotero-' + tier);
      const test = doc.getElementById('ztts-test-zotero-' + tier);
      const result = doc.getElementById('ztts-test-result-zotero-' + tier);
      const logIn = doc.getElementById('ztts-zotero-log-in-' + tier);
      const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
      return {
        caption: caption ? { text: caption.textContent, fontWeight: win.getComputedStyle(caption).fontWeight, rect: rectOf(caption) } : null,
        creditsRow: row ? {
          hidden: row.hidden === true,
          childIds: Array.from(row.children).map((c) => c.id || c.tagName.toLowerCase()),
          text: text ? text.textContent : null,
          textHasNoneAttr: text ? text.hasAttribute('data-ztts-none') : null,
          buy: buy ? { isTextLinkClass: buy.classList.contains('zotero-text-link'), text: buy.textContent, href: buy.getAttribute('href'), hidden: buy.hidden === true } : null,
          rect: rectOf(row),
        } : null,
        switchRow: switchRow ? {
          hidden: switchRow.hidden === true,
          childIds: Array.from(switchRow.children).map((c) => c.id || c.tagName.toLowerCase()),
          firstChildIsEnableButton: switchRow.firstElementChild === enable,
          enableLabel: enable ? enable.getAttribute('label') : null,
          testLabel: test ? test.getAttribute('label') : null,
          resultText: result ? result.textContent : null,
          logIn: logIn ? { text: logIn.textContent, hidden: logIn.hidden === true, isTextLinkClass: logIn.classList.contains('zotero-text-link') } : null,
          rect: rectOf(switchRow),
        } : null,
        switchPref: Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled'),
      };
    };
    out.standard = tierInfo('standard');
    out.premium = tierInfo('premium');

    // --- The section sits after Xiaomi MiMo (the last provider, #113/#159 order) and before the voice browser. ---
    const root = doc.querySelector('.ztts-pane');
    const groupboxes = Array.from(root.querySelectorAll(':scope > groupbox'));
    out.groupboxCount = groupboxes.length;
    out.groupboxIds = groupboxes.map((g) => g.id || null);
    out.zoteroIsLastProviderSection = (function () {
      const ids = groupboxes.map((g) => g.id);
      const zi = ids.indexOf('ztts-zotero-section');
      const mi = ids.indexOf('ztts-provider-mimo');
      const vi = ids.indexOf('ztts-voice-browser-section');
      return zi >= 0 && mi >= 0 && zi === mi + 1 && (vi < 0 || zi < vi);
    })();

    // Force layout once for the rects above (scrollIntoView + measure in the
    // same script; the rows measure 0x0 without it).
    section.scrollIntoView({ block: 'center' });
    await sleep(150);
    out.rectsRefreshed = {};
    for (const tier of ['standard', 'premium']) {
      const cap = section.querySelector('label.ztts-caption[data-l10n-id="ztts-zotero-' + tier + '"]');
      const row = doc.getElementById('ztts-zotero-credits-row-' + tier);
      const switchRow = doc.getElementById('ztts-provider-zotero-' + tier);
      const text = doc.getElementById('ztts-zotero-credits-' + tier);
      const buy = doc.getElementById('ztts-zotero-buy-' + tier);
      const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
      // Item 1's geometry (issue #159): the Add more time link starts 6 px
      // after the credits text's right edge (the beta5 gap rule; 0 px on
      // 1.16.2-beta5).
      const tr = text ? text.getBoundingClientRect() : null;
      const br = buy ? buy.getBoundingClientRect() : null;
      const gapBuy = tr && br ? +(br.left - tr.right).toFixed(2) : null;
      out.rectsRefreshed[tier] = {
        caption: rectOf(cap), creditsRow: rectOf(row), switchRow: rectOf(switchRow),
        creditsText: rectOf(text), buyLink: rectOf(buy),
        gapBuyLeftMinusTextRight: gapBuy,
        gapBuyIsSixPx: gapBuy !== null && Math.abs(gapBuy - 6) <= 0.5,
      };
    }
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
