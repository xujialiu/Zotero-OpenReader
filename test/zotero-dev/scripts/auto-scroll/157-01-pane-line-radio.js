// Issue #157 run, items 1 + 9 (radio part): the Auto-scroll style radiogroup.
// Three radios in order — line "Scroll at every line" (new), sentence
// "Scroll at every sentence", outside "Scroll when outside the view" — each
// with its own ? icon, the new help `ztts-help-auto-scroll-line` carrying the
// FTL text; hovering it opens the plugin tooltip with that text and Zotero's
// default tooltip stays closed. Clicking each radio moves
// readAloud.autoScrollMode to line/sentence/outside. diagnostics.l10n():
// blank [] and questionless []. Restores the baseline (this profile held no
// user value: cleared, so the pref reads the default `line` again).
// Needs the settings window OS-active for the hover; restores the pane value.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.baseline;
  const out = { errors: [] };

  // A settings window opened before the install holds the OLD pane: close and reopen
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) { try { win.close(); } catch (e) {} }
  const goneBy = Date.now() + 6000;
  while (Date.now() < goneBy && Services.wm.getMostRecentWindow('zotero:pref')) await sleep(200);
  try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); } catch (e) { out.errors.push('openPreferences: ' + String(e)); }
  const end = Date.now() + 8000;
  while (Date.now() < end && !Services.wm.getMostRecentWindow('zotero:pref')) await sleep(150);
  win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) return JSON.stringify({ error: 'settings window did not open' });
  const readyBy = Date.now() + 6000;
  while (Date.now() < readyBy && !win.document.getElementById('ztts-provider-openai-official')) {
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    await sleep(200);
  }
  if (!win.document.getElementById('ztts-provider-openai-official')) return JSON.stringify({ ...out, error: 'plugin pane did not load' });
  await sleep(500);

  const doc = win.document;
  const rg = doc.getElementById('ztts-auto-scroll-mode');
  if (!rg) return JSON.stringify({ ...out, error: 'radiogroup ztts-auto-scroll-mode absent' });

  // Radios in DOM order: value + label + adjacent ? icon
  const radios = rg.querySelectorAll('radio');
  out.radios = [];
  for (const radio of radios) {
    const help = radio.nextElementSibling;
    out.radios.push({
      value: radio.getAttribute('value'),
      label: radio.label ?? null,
      helpId: help?.getAttribute?.('data-l10n-id') ?? null,
      helpGlyph: help?.getAttribute?.('value') ?? null,
      helpAttr: help?.getAttribute?.('help') ?? null,
    });
  }
  out.expectedRadios = [
    { value: 'line', label: 'Scroll at every line', helpId: 'ztts-help-auto-scroll-line' },
    { value: 'sentence', label: 'Scroll at every sentence', helpId: 'ztts-help-auto-scroll-sentence' },
    { value: 'outside', label: 'Scroll when outside the view', helpId: 'ztts-help-auto-scroll-outside' },
  ];
  out.radiosMatch = JSON.stringify(out.radios.map(r => [r.value, r.label, r.helpId, r.helpGlyph]))
    === JSON.stringify(out.expectedRadios.map(r => [r.value, r.label, r.helpId, '?']));
  out.lineHelpTextMatchesFtl = out.radios[0]?.helpAttr === 'In A (automatic), each time the highlighted word moves onto a new line, bring that line to the reading line, even if it is already visible. Without a highlighted word (a voice without word timing, or the word highlight switched off), scroll at every sentence instead. In M (manual), leave the page alone. For PDFs and EPUBs; paginated EPUBs turn the page when the word reaches the next one.';

  // Hover the line ? icon (new) and the sentence ? icon: plugin tooltip label,
  // Zotero's default tooltip stays closed. Needs the window OS-active.
  const defaultTip = () => {
    try {
      const kids = win.InspectorUtils.getChildrenForNode(doc.documentElement, true, false);
      for (let i = 0; i < kids.length; i++) if (kids[i].localName === 'tooltip') return kids[i];
    } catch (e) { out.errors.push('defaultTip: ' + String(e)); }
    return null;
  };
  const hover = async (el, wantPrefix) => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(300);
    const box = el.getBoundingClientRect();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    win.focus();
    await sleep(200);
    const wu = win.windowUtils;
    wu.sendMouseEvent('mousemove', Math.max(1, x - 30), y, 0, 0, 0, false, 0, 0, false, false);
    await sleep(120);
    wu.sendMouseEvent('mousemove', x, y, 0, 0, 0, false, 0, 0, false, false);
    await sleep(80);
    wu.sendMouseEvent('mousemove', x + 1, y, 0, 0, 0, false, 0, 0, false, false);
    const deadline = Date.now() + 3000;
    let tipState = null, label = null;
    while (Date.now() < deadline) {
      const tip = doc.getElementById('ztts-help-tip');
      tipState = tip ? tip.state : 'absent';
      label = tip ? tip.label : null;
      if (tipState === 'open' || tipState === 'showing') break;
      wu.sendMouseEvent('mousemove', x + (Math.random() * 2 - 1), y, 0, 0, 0, false, 0, 0, false, false);
      await sleep(150);
    }
    const dTip = defaultTip();
    const result = { tipState, labelMatches: !!(label && label.startsWith(wantPrefix)), labelStart: label ? label.slice(0, 60) : null, defaultTipState: dTip ? dTip.state : 'none' };
    wu.sendMouseEvent('mousemove', 8, doc.getElementById('ztts-provider-openai-official').getBoundingClientRect().y + 8, 0, 0, 0, false, 0, 0, false, false);
    await sleep(250);
    return result;
  };
  try {
    out.hoverLine = await hover(rg.querySelector('radio[value="line"]').nextElementSibling, 'In A (automatic), each time the highlighted word moves onto a new line');
    out.hoverSentence = await hover(rg.querySelector('radio[value="sentence"]').nextElementSibling, 'In A (automatic), bring each new sentence to the reading line');
  } catch (e) { out.errors.push('hover: ' + String(e)); }

  // Click each radio: the pref follows line / sentence / outside
  out.clicks = [];
  for (const value of ['line', 'sentence', 'outside']) {
    const radio = rg.querySelector('radio[value="' + value + '"]');
    radio.click();
    await sleep(350);
    out.clicks.push({ clicked: value, pref: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), radioNow: rg.value });
  }

  // The pane's l10n report, while the pane is loaded (the field is `pane`)
  try { const l10n = JSON.parse(Zotero.ZoteroTTS.diagnostics.l10n()); out.l10n = { elements: l10n.pane?.elements ?? null, blank: l10n.pane?.blank ?? null, questionless: l10n.pane?.questionless ?? null }; }
  catch (e) { out.errors.push('l10n: ' + String(e)); }

  // Restore: the baseline held NO user value for autoScrollMode (reads line by default now)
  const base = baseline?.['readAloud.autoScrollMode'];
  if (base && base.hasUser) p.setStringPref(modeName, String(base.value));
  else if (p.prefHasUserValue(modeName)) p.clearUserPref(modeName);
  await sleep(200);
  out.restored = { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), baseline: { value: base?.value ?? null, user: !!base?.hasUser } };
  return JSON.stringify(out);
})()
