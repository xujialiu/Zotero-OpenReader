// Issue #155 run, items 1 and 9: the three ? help icons and the radio binding
// (2026-09-29, 1.16.2-beta2). Hovers the sentence, outside and reading-line
// help icons with trusted mouse moves, reads each tip's state and label,
// checks Zotero's default tooltip stays closed, then clicks both auto-scroll
// radios and restores the mode. Needs the settings window OS-active.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const d = win?.document;
  if (!win || !d.getElementById('ztts-provider-openai-official')) return JSON.stringify({ error: 'settings window with plugin pane not open' });
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const out = { errors: [], tips: [] };
  win.focus();
  await sleep(200);

  const defaultTip = () => {
    const anon = Array.from(win.InspectorUtils.getChildrenForNode(d.documentElement, true, false)).find(c => c.localName === 'tooltip');
    return { state: anon?.state ?? null, label: anon?.label ?? null };
  };
  const hover = async help => {
    help.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(120);
    const r = help.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const move = (a, b) => win.windowUtils.sendMouseEvent('mousemove', a, b, 0, 0, 0, false, 0, 0, false, false);
    move(Math.max(1, x - 30), y);
    move(x, y);
    move(x + 1, y);
    const end = Date.now() + 2200;
    const states = [];
    while (Date.now() < end) {
      const tip = d.getElementById('ztts-help-tip');
      const state = tip?.state ?? 'missing';
      states.push(state);
      if (state === 'open') break;
      await sleep(100);
    }
    const tip = d.getElementById('ztts-help-tip');
    const result = {
      id: help.getAttribute('data-l10n-id'),
      tipState: tip?.state ?? null,
      tipLabel: tip?.label ?? null,
      statesFirst: states[0] ?? null, statesLast: states[states.length - 1] ?? null, statesCount: states.length,
      defaultTooltip: defaultTip(),
    };
    // Leave the element: park on a blank spot of the pane
    move(Math.min(d.documentElement.clientWidth - 20, Math.max(20, x + 180)), Math.min(d.documentElement.clientHeight - 20, Math.max(20, y + 120)));
    await sleep(250);
    return result;
  };

  for (const id of ['ztts-help-auto-scroll-sentence', 'ztts-help-auto-scroll-outside', 'ztts-help-reading-line']) {
    const help = d.getElementById(id) || Array.from(d.querySelectorAll('.ztts-help')).find(x => x.getAttribute('data-l10n-id') === id);
    if (!help) { out.tips.push({ id, error: 'icon not found' }); continue; }
    out.tips.push(await hover(help));
  }

  // The reading-line row's texts, read from the XUL value attribute this time
  const field = d.getElementById('ztts-reading-line');
  const row = field ? field.closest('hbox') : null;
  out.readingLineTexts = row ? {
    label: row.querySelector('label[data-l10n-id="ztts-reading-line"]')?.getAttribute('value') ?? null,
    before: row.querySelector('label[data-l10n-id="ztts-reading-line-before"]')?.getAttribute('value')
      ?? row.querySelector('label[data-l10n-id="ztts-reading-line-before"]')?.textContent ?? null,
    after: row.querySelector('label[data-l10n-id="ztts-reading-line-after"]')?.getAttribute('value')
      ?? row.querySelector('label[data-l10n-id="ztts-reading-line-after"]')?.textContent ?? null,
  } : null;

  // Item 1: clicking each radio moves pref and group value together
  const group = d.getElementById('ztts-auto-scroll-mode');
  const before = { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), group: group.value };
  const click = async value => {
    const radio = Array.from(group.querySelectorAll('radio')).find(r => r.getAttribute('value') === value);
    radio.click();
    await sleep(200);
    return { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), group: group.value };
  };
  out.binding = { before };
  try {
    out.binding.afterSentence = await click('sentence');
    out.binding.afterOutside = await click('outside');
  } catch (e) { out.errors.push('click: ' + String(e)); }
  // Restore: the baseline (155-00) held outside with a user value
  p.setStringPref(modeName, 'outside');
  await sleep(150);
  out.binding.restored = { value: p.getStringPref(modeName), user: p.prefHasUserValue(modeName), group: group.value };
  return JSON.stringify(out);
})()
