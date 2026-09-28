// Issue #155 run, item 9: the Scrolling section (2026-09-29, 1.16.2-beta2).
// Opens the settings window, navigates to the plugin pane, and reads the
// section structure: headings in order, the Scrolling groupbox's three rows
// in order, the Highlight groupbox free of them, the radio labels, the
// reading-line row's texts and field, and diagnostics.l10n().
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { errors: [] };
  // No settings window was open at baseline (155-00); open one now
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) {
    try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); } catch (e) { out.errors.push('open: ' + String(e)); }
    const end = Date.now() + 8000;
    while (Date.now() < end && !Services.wm.getMostRecentWindow('zotero:pref')) await sleep(150);
    win = Services.wm.getMostRecentWindow('zotero:pref');
  }
  if (!win) return JSON.stringify({ error: 'no settings window after open' });
  out.windowOpened = true;
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) { out.errors.push('navigate: ' + String(e)); }
  const end = Date.now() + 6000;
  while (Date.now() < end && !win.document.getElementById('ztts-provider-openai-official')) await sleep(120);
  await sleep(500);
  const doc = win.document;
  out.loaded = !!doc.getElementById('ztts-provider-openai-official');
  if (!out.loaded) return JSON.stringify(out);

  // Section headings in document order
  out.headings = Array.from(doc.querySelectorAll('h2[data-l10n-id]')).map(h => h.getAttribute('data-l10n-id'));
  // The Scrolling groupbox: the one whose h2 is ztts-heading-scrolling
  const groupBoxOf = headingId => {
    const h = Array.from(doc.querySelectorAll('h2[data-l10n-id]')).find(x => x.getAttribute('data-l10n-id') === headingId);
    let node = h;
    while (node && node.localName !== 'groupbox') node = node.parentElement;
    return node;
  };
  const scrollingBox = groupBoxOf('ztts-heading-scrolling');
  const highlightBox = groupBoxOf('ztts-heading-highlight');
  const readingBox = groupBoxOf('ztts-heading-reading');
  const rowIds = ['ztts-default-auto-scroll', 'ztts-auto-scroll-mode', 'ztts-reading-line'];
  const idsInside = box => (box ? rowIds.filter(id => !!box.querySelector('#' + id)) : null);
  out.scrolling = {
    found: !!scrollingBox,
    rowIdsInDocumentOrder: scrollingBox
      ? Array.from(scrollingBox.querySelectorAll('[id]')).map(e => e.id).filter(id => rowIds.includes(id))
      : null,
    rows: scrollingBox ? idsInside(scrollingBox) : null,
    headingText: scrollingBox?.querySelector('h2')?.textContent ?? null,
  };
  out.highlight = { found: !!highlightBox, rows: highlightBox ? idsInside(highlightBox) : [] };
  out.reading = { found: !!readingBox, rows: readingBox ? idsInside(readingBox) : null };
  out.headingsInOrder = out.headings.indexOf('ztts-heading-reading') > -1
    && out.headings.indexOf('ztts-heading-scrolling') > out.headings.indexOf('ztts-heading-reading')
    && out.headings.indexOf('ztts-heading-highlight') > out.headings.indexOf('ztts-heading-scrolling');

  // The auto-scroll style radios and their help icons
  const group = doc.getElementById('ztts-auto-scroll-mode');
  out.radioRows = group ? Array.from(group.children).map(row => {
    const radio = row.querySelector('radio');
    const help = row.querySelector('.ztts-help');
    return {
      radio: radio ? { value: radio.getAttribute('value'), label: radio.getAttribute('label'), selected: !!radio.selected } : null,
      help: help ? { l10nId: help.getAttribute('data-l10n-id'), valueAttr: help.getAttribute('value'), helpChars: (help.getAttribute('help') ?? '').length } : null,
    };
  }) : null;

  // The Default scrolling row (issue #153), same section
  const defaultGroup = doc.getElementById('ztts-default-auto-scroll');
  out.defaultScrollRow = defaultGroup ? {
    value: defaultGroup.value,
    radios: Array.from(defaultGroup.querySelectorAll('radio')).map(r => ({ value: r.getAttribute('value'), label: r.getAttribute('label') })),
    helpPresent: !!defaultGroup.parentElement.querySelector('.ztts-help'),
  } : null;

  // The reading-line row: label, words before, the field, words after, the ?
  const field = doc.getElementById('ztts-reading-line');
  const row = field ? field.closest('hbox') : null;
  out.readingLineRow = row ? {
    label: row.querySelector('label[data-l10n-id="ztts-reading-line"]')?.getAttribute('value')
      ?? row.querySelector('label[data-l10n-id="ztts-reading-line"]')?.textContent ?? null,
    before: row.querySelector('label[data-l10n-id="ztts-reading-line-before"]')?.textContent ?? null,
    fieldValue: field.value, fieldMin: field.min, fieldMax: field.max,
    after: row.querySelector('label[data-l10n-id="ztts-reading-line-after"]')?.textContent ?? null,
    help: (() => { const h = row.querySelector('.ztts-help'); return h ? { valueAttr: h.getAttribute('value'), helpChars: (h.getAttribute('help') ?? '').length, helpStart: (h.getAttribute('help') ?? '').slice(0, 60) } : null; })(),
  } : null;

  // The strings diagnostic, pane loaded as it is now
  try {
    const l10n = JSON.parse(Zotero.ZoteroTTS.diagnostics.l10n());
    out.l10n = { pane: l10n.pane, zoteroLocale: l10n.zoteroLocale, appLocales: l10n.appLocales };
  } catch (e) { out.errors.push('l10n: ' + String(e)); }
  return JSON.stringify(out);
})()
