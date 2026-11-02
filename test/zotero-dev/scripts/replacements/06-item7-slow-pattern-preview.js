// Item 7 (issue #237, ADR 0024): a slow pattern is cut off at the time limit
// and Zotero stays responsive. Appends the global regex row (a+)+$ → x onto
// the regex-row list (its index in the merged list is 2 document rows + 2
// global rows = 4), previews sentence 7 (42 a's then '!'), and reads the
// runner, verbatim. The Player's ! and the window's red row are item 17's
// script (they need the reading). The rows stay for that check; cleanup
// restores the prefs whole. params: none.
// state: reads rows5r, fixture; writes slowRow (the appended row).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const rows5 = state.rows5r;
  if (!rows5) throw new Error('run 05-item5-previews-regex first');
  const prefix = 'extensions.zotero.zotero-tts.';
  const slowRow = { text: '(a+)+$', readAs: 'x', mode: 'regex', matchCase: true };
  const globalRows = [...rows5.globalRows, slowRow];
  Services.prefs.setStringPref(prefix + 'readAloud.replacements', JSON.stringify(globalRows));
  state.slowRow = { row: slowRow, index: rows5.merged.length };
  await new Promise((r) => setTimeout(r, 700)); // the observers' refresh settles
  const out = {};
  const sentence7 = 'a'.repeat(42) + '!';
  const t0 = Date.now();
  const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacementsPreview(sentence7, fx.readerIndex));
  out.sentence7Length = sentence7.length;
  out.totalMs = Date.now() - t0;
  out.preview = p;
  const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.runner = rep.runner;
  out.expectedIndex = state.slowRow.index;
  // Zotero responsiveness: a second diagnostics call must answer at once
  const t1 = Date.now();
  const pong = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.bridgeMsAfter = Date.now() - t1;
  out.bridgeAnswered = !!pong.runner;
  return JSON.stringify(out, null, 1);
})()
