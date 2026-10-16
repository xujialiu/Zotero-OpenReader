// Item 1a.1 (updated for the Model dropdown) on the settings window 05-pane-entries.js left open: the
// Fish Audio groupbox and the Fish Speech server block field by field (ids, bindings, placeholders,
// the three and the two ?), no checkbox on fish.freeOnly any more, the order of the sections, the
// ? icons' left edges (one column?), a crop of the Fish groupbox at 2x to look at, and
// diagnostics.l10n()'s pane report (blank, questionless). Reads values by length only.
// params: tmpDir. state: writes section1a1.
(async () => {
  const state = Zotero.ZoteroTTSRun.state, params = Zotero.ZoteroTTSRun.params || {};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const doc = win?.document;
  const g = doc?.getElementById('ztts-provider-fish'), fs = doc?.getElementById('ztts-provider-fishspeech');
  if (!g || !fs) throw new Error('the plugin pane is not open: run 05-pane-entries.js first');
  const checks = [];
  const check = (name, observed, ok, note) => checks.push({ name, ok: !!ok, observed, ...(note ? { note } : {}) });
  const attr = (el, a) => el?.getAttribute?.(a) ?? null;
  const secret = el => win.getComputedStyle(el).webkitTextSecurity;

  // --- The Fish Audio groupbox ---
  check('h2', g.querySelector('h2')?.textContent, g.querySelector('h2')?.textContent === 'Fish Audio (fish.audio)');
  const link = g.querySelector('h2 label[is="zotero-text-link"]');
  check('host link', { text: link?.textContent, href: attr(link, 'href') }, attr(link, 'href') === 'https://fish.audio');
  const key = g.querySelector('input[preference="extensions.zotero.zotero-tts.fish.apiKey"]');
  check('API key input on fish.apiKey (masked text box)', { type: attr(key, 'type'), class: key?.className, textSecurity: key ? secret(key) : null, valueLength: String(key?.value || '').length }, key && secret(key) === 'disc');
  const menu = g.querySelector('menulist#ztts-fish-model');
  const modelRow = menu?.closest('hbox');
  const modelLabel = modelRow?.querySelector('.ztts-field-label');
  check('Model dropdown row', { label: attr(modelLabel, 'value'), l10n: attr(modelLabel, 'data-l10n-id'), shown: menu?.label, value: menu?.value, preferenceAttribute: attr(menu, 'preference') }, menu && attr(modelLabel, 'value') === 'Model' && menu.value === 's2.1-pro-free' && menu.label === 's2.1-pro-free — free', 'unbound by design: the pane code writes fish.model itself');
  const ids = g.querySelector('input#ztts-fish-model-ids');
  check('voices input on fish.voices', { preference: attr(ids, 'preference'), placeholder: attr(ids, 'placeholder'), valueLength: String(ids?.value || '').length }, attr(ids, 'preference') === 'extensions.zotero.zotero-tts.fish.voices');
  check('placeholder wording', attr(ids, 'placeholder'), attr(ids, 'placeholder') === 'IDs from Fish Audio', "the case still says 'ids or links from fish.audio' (stale since #91); the source string ztts-fish-model-ids-input is 'IDs from Fish Audio'");
  const help = Array.from(g.querySelectorAll('.ztts-help')).map(h => ({ l10n: attr(h, 'data-l10n-id'), value: attr(h, 'value') }));
  check('three ? in the Fish groupbox', help, help.length === 3 && help.every(h => h.value === '?') && help[0].l10n === 'ztts-help-fish' && help[1].l10n === 'ztts-help-fish-model', "the case names the third 'ztts-help-fish-voices'; the markup (since #91) is 'ztts-help-fish-model-ids'");
  check('no checkbox on fish.freeOnly, no old strings', { checkbox: !!g.querySelector('checkbox[preference$="fish.freeOnly"]'), oldL10n: !!g.querySelector('[data-l10n-id="ztts-fish-free-only"], [data-l10n-id="ztts-help-fish-free-only"]'), checkboxes: Array.from(g.querySelectorAll('checkbox')).map(c => c.id) }, !g.querySelector('checkbox[preference$="fish.freeOnly"]') && !g.querySelector('[data-l10n-id="ztts-fish-free-only"], [data-l10n-id="ztts-help-fish-free-only"]'));
  const enable = doc.getElementById('ztts-enable-fish'), test = doc.getElementById('ztts-test-fish'), line = doc.getElementById('ztts-test-result-fish');
  check('ztts-enable-fish / ztts-test-fish / ztts-test-result-fish', { enable: enable?.localName, enableLabel: attr(enable, 'label'), test: test?.localName, testLabel: attr(test, 'label'), line: line?.localName }, enable && test && line);
  const h3 = Array.from(doc.querySelectorAll('.ztts-pane h3')).map(h => h.textContent.trim());
  check('h3 sub-blocks Cloud / Local', { h3InPane: h3, h3InFishGroupbox: g.querySelectorAll('h3').length }, true, "informational: the case text still mentions 'two h3 sub-blocks'; the pane has one groupbox per provider, each with an h2");

  // --- The Fish Speech server block ---
  check('server block h2 and link', { h2: fs.querySelector('h2')?.textContent, href: attr(fs.querySelector('h2 label[is="zotero-text-link"]'), 'href') }, fs.querySelector('h2')?.textContent === 'Fish Speech (github.com/fishaudio/fish-speech)');
  const addr = fs.querySelector('input[preference="extensions.zotero.zotero-tts.fishspeech.baseURL"]');
  check('address input on fishspeech.baseURL', { present: !!addr, textSecurity: addr ? secret(addr) : null, isTheDefaultAddress: addr?.value === 'http://localhost:8080', valueLength: String(addr?.value || '').length }, !!addr && secret(addr) === 'none', "the owner's profile holds its own address, so 'showing http://localhost:8080' cannot be read here");
  const hdr = fs.querySelector('input[preference="extensions.zotero.zotero-tts.fishspeech.headers"]');
  check('Extra headers input on fishspeech.headers', { class: hdr?.className, textSecurity: hdr ? secret(hdr) : null, placeholder: attr(hdr, 'placeholder'), valueLength: String(hdr?.value || '').length }, hdr && secret(hdr) === 'disc' && attr(hdr, 'placeholder') === 'Name: value; Name: value');
  const fsHelp = Array.from(fs.querySelectorAll('.ztts-help')).map(h => ({ l10n: attr(h, 'data-l10n-id'), value: attr(h, 'value') }));
  check('two ? in the server block', fsHelp, fsHelp.length === 2 && fsHelp[0].l10n === 'ztts-help-fish-speech' && fsHelp[1].l10n === 'ztts-help-extra-headers');
  check('server block buttons', ['ztts-enable-fishspeech', 'ztts-test-fishspeech', 'ztts-test-result-fishspeech'].map(id => !!doc.getElementById(id)), ['ztts-enable-fishspeech', 'ztts-test-fishspeech', 'ztts-test-result-fishspeech'].every(id => doc.getElementById(id)));
  const order = Array.from(doc.querySelectorAll('.ztts-pane > groupbox')).map(x => x.id).filter(Boolean);
  check('section order: Cloudflare, Fish Audio, Fish Speech', order.slice(order.indexOf('ztts-provider-cloudflare'), order.indexOf('ztts-provider-fishspeech') + 1), order.indexOf('ztts-provider-fish') === order.indexOf('ztts-provider-cloudflare') + 1 && order.indexOf('ztts-provider-fishspeech') === order.indexOf('ztts-provider-fish') + 1);

  // --- The ? icons: one column? (left edges of the three Fish rows, then the server block's two) ---
  g.scrollIntoView({ block: 'center' });
  await sleep(250);
  const left = el => Math.round(el.getBoundingClientRect().left * 10) / 10;
  const column = {
    fish: Array.from(g.querySelectorAll('.ztts-help')).map(h => ({ l10n: attr(h, 'data-l10n-id'), left: left(h) })),
    server: Array.from(fs.querySelectorAll('.ztts-help')).map(h => ({ l10n: attr(h, 'data-l10n-id'), left: left(h) })),
    controlLeft: { apiKey: key ? left(key) : null, model: menu ? left(menu) : null, voices: ids ? left(ids) : null },
    controlWidth: { apiKey: key ? Math.round(key.getBoundingClientRect().width) : null, model: menu ? Math.round(menu.getBoundingClientRect().width) : null, voices: ids ? Math.round(ids.getBoundingClientRect().width) : null },
  };
  const lefts = column.fish.map(h => h.left);
  column.fishAligned = Math.max(...lefts) - Math.min(...lefts) <= 1;
  check('? icons of the Fish rows in one column', column, column.fishAligned);

  // --- A crop of the groupbox at 2x, for the eye ---
  let shot = null;
  try {
    const r = g.getBoundingClientRect();
    const bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(new win.DOMRect(Math.max(0, r.left), Math.max(0, r.top), r.width, r.height), 2, 'rgb(255,255,255)');
    const canvas = new win.OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const dir = PathUtils.join(params.tmpDir, 'fish-model');
    await IOUtils.makeDirectory(dir, { createAncestors: true });
    const path = PathUtils.join(dir, 'fish-section.png');
    await IOUtils.write(path, bytes);
    shot = { path, width: bitmap.width, height: bitmap.height, bytes: bytes.length };
  } catch (e) { shot = { error: String(e) }; }

  const l10n = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
  check('diagnostics.l10n() pane report', { elements: l10n.pane?.elements, blank: l10n.pane?.blank, questionless: l10n.pane?.questionless }, l10n.pane && l10n.pane.blank.length === 0 && l10n.pane.questionless.length === 0);
  const out = { status: checks.every(c => c.ok) ? 'PASS' : 'DEVIATIONS', checks, shot };
  state.section1a1 = out;
  return JSON.stringify(out, null, 1);
})()
