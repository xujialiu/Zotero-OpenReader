// Issue #155 run, item 9 completion (2026-09-29, 1.16.2-beta2).
// Typing 10 into the pane's reading-line field — the value+input+change
// path the pane's preference binding listens on (the kit's established
// pattern for `preference=`-bound number fields) — must set
// readAloud.readingLine to 10, and diagnostics.autoScroll() must then
// report line: 10 for the open PDF and EPUB without a reinstall.
return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs;
  const lineName = 'extensions.zotero.zotero-tts.readAloud.readingLine';
  const out = {};
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) return JSON.stringify({ error: 'settings window not open' });
  const end = Date.now() + 5000;
  while (Date.now() < end && !win.document.getElementById('ztts-provider-openai-official')) {
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    await sleep(200);
  }
  const doc = win.document;
  const field = doc.getElementById('ztts-reading-line');
  if (!field) return JSON.stringify({ error: 'reading-line field not found' });
  out.fieldBefore = { value: field.value, pref: p.getIntPref(lineName, -1), user: p.prefHasUserValue(lineName) };
  field.value = '10';
  field.dispatchEvent(new win.Event('input', { bubbles: true }));
  field.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(400);
  out.afterTyping = { fieldValue: field.value, pref: p.getIntPref(lineName, -1), user: p.prefHasUserValue(lineName) };
  const rows = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
  out.rows = rows.map(r => ({ kind: r?.kind ?? null, line: r?.line ?? null, patched: r?.patched ?? null }));
  out.readerCount = (Zotero.Reader._readers ?? []).length;
  return JSON.stringify(out);
})()
