// Item 1.2, the issue #158 sentence: every .ztts-help computes
// flex-shrink: 0, and the ? after the Zotero note stays 16.25 × 16.25 px
// while the note is made to wrap (its textContent set to its own text three
// times over), then the note is restored with document.l10n.translateElements.
// Also reports the width × height of EVERY .ztts-help in the pane (the brief
// asks for the table). Self-contained: opens the pane fresh (driving notes
// Sec1), polls the plugin's own sheet into doc.styleSheets before reading,
// closes the window at the end. Touches only the Zotero note's textContent
// (restored and verified). params: none. state: none.
(async () => {
  const out = { step: 'help-shrink-wrap' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // --- Open the pane fresh. ---
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (!win) throw new Error('settings window never appeared');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t2 = Date.now();
    while (Date.now() - t2 < 10000 && !doc.getElementById('ztts-zotero-section')) await sleep(150);
    const section = doc.getElementById('ztts-zotero-section');
    if (!section) throw new Error('Zotero section never rendered');

    // The pane's own sheet lands a beat after navigateToPane — poll for it.
    let pluginSheet = null;
    const t3 = Date.now();
    while (Date.now() - t3 < 8000 && !pluginSheet) {
      for (const sheet of doc.styleSheets) {
        if (sheet.href && /preferences\.css/.test(sheet.href) && /zotero\+tts|zotero-tts/i.test(sheet.href)) { pluginSheet = sheet; break; }
      }
      if (!pluginSheet) await sleep(150);
    }
    out.pluginSheetFound = !!pluginSheet;
    if (pluginSheet) {
      out.helpRuleFromSheet = (function () {
        for (const rule of pluginSheet.cssRules) {
          if (rule.selectorText && rule.selectorText.includes('label.ztts-help[value]')) {
            return { selectorText: rule.selectorText, cssText: rule.style.cssText };
          }
        }
        return null;
      })();
    }

    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };

    // --- Every .ztts-help: computed flex-shrink and its box. ---
    const helps = Array.from(doc.querySelectorAll('.ztts-help'));
    out.helpCount = helps.length;
    out.helps = helps.map((el) => ({
      l10nId: el.getAttribute('data-l10n-id'),
      flexShrink: win.getComputedStyle(el).flexShrink,
      box: rectOf(el),
    }));
    out.allFlexShrinkZero = out.helps.every((h) => h.flexShrink === '0');

    // --- The #158 experiment on the Zotero note's row. ---
    const note = section.querySelector('description[data-l10n-id="ztts-zotero-note"]');
    const help = section.querySelector('label.ztts-help[data-l10n-id="ztts-help-zotero"]');
    if (!note || !help) throw new Error('note or ? missing');
    const originalText = note.textContent;
    const before = { noteBox: rectOf(note), helpBox: rectOf(help) };
    note.textContent = originalText + originalText + originalText;
    note.getBoundingClientRect(); // force layout
    await sleep(100);
    const wrapped = { noteBox: rectOf(note), helpBox: rectOf(help), noteClientHeight: note.clientHeight };
    out.wrapExperiment = {
      before,
      wrapped,
      noteGrewTaller: wrapped.noteBox.h > before.noteBox.h + 5,
      helpStillSquare: Math.abs(wrapped.helpBox.w - 16.25) <= 0.01 && Math.abs(wrapped.helpBox.h - 16.25) <= 0.01,
    };

    // --- Restore with Fluent, verify. ---
    await doc.l10n.translateElements([note]);
    note.getBoundingClientRect();
    await sleep(100);
    const restored = { noteText: note.textContent, textRestored: note.textContent === originalText, helpBox: rectOf(help), noteBox: rectOf(note) };
    out.restored = restored;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  // Self-contained: close the window either way.
  try {
    const win2 = Services.wm.getMostRecentWindow('zotero:pref');
    if (win2) {
      win2.close();
      const t9 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t9 < 10000) await sleep(200);
    }
    out.settingsWindowOpenAfter = !!Services.wm.getMostRecentWindow('zotero:pref');
  } catch (e) { out.settingsWindowCloseError = String(e); }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
