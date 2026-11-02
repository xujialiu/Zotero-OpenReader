// Item 5, regex revision (issue #237; the owner is removing the Wildcard
// mode, so this build's rows are regular expressions): the rows are written
// straight to the prefs (the run's snapshot authorizes it; the pulse is NOT
// bumped — the pulse's own check was item 4's, now out of scope), then the
// five case texts go through diagnostics.replacementsPreview(text, reader
// Index) and the runner is read. Isolation: the owner's reader (index 0)
// must show no changed held sentences from these rows. params: none.
// state: reads fixture; writes rows5r (the merged rows for item 7's index).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  if (!fx) throw new Error('no fixture: run the baseline import first');
  const prefix = 'extensions.zotero.zotero-tts.';
  const row = (text, readAs, mode, matchCase) => ({ text, readAs, mode, matchCase });
  const documentRows = [
    row('IL-6', 'interleukin six', 'exact', true),
    row('anti IL-(\\d+)', 'anti-interleukin $1', 'regex', false),
  ];
  const globalRows = [
    row('IL-(\\d+)', 'interleukin $1', 'regex', true),
    row('(\\d+) ?mg\\b', '$1 milligrams', 'regex', true),
  ];
  const out = {};
  // reset both prefs (the baseline held no value for either), then write
  Services.prefs.clearUserPref(prefix + 'readAloud.replacements');
  Services.prefs.clearUserPref(prefix + 'documentReplacements.user/' + fx.key);
  const pulseBefore = Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0);
  await new Promise((r) => setTimeout(r, 700)); // the clear's refresh settles
  Services.prefs.setStringPref(prefix + 'documentReplacements.user/' + fx.key, JSON.stringify({ rows: documentRows, ts: Date.now() }));
  Services.prefs.setStringPref(prefix + 'readAloud.replacements', JSON.stringify(globalRows));
  out.pulseUnchangedByDirectWrite = Number(Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true) ?? 0) === pulseBefore;
  await new Promise((r) => setTimeout(r, 700)); // the observers' refresh settles
  const rep0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.readers = (rep0.readers ?? []).map((r) => ({
    document: r.document, rows: r.rows, documentRows: r.documentRows,
    lastEdit: r.lastEdit ? { outcome: r.lastEdit.outcome, changed: r.lastEdit.changed } : null,
  }));
  const owner = (rep0.readers ?? [])[0];
  out.ownerChangedEmpty = !owner?.lastEdit || (Array.isArray(owner.lastEdit.changed) && owner.lastEdit.changed.length === 0);
  const texts = [
    'IL-6 levels rose after the second dose.',
    'IL-2 and IL-10 were measured as well.',
    'Anti IL-6 therapy was not given.',
    'The patients took 5mg of the drug [12].',
    '抑制IL-6表达的药物。',
  ];
  out.previews = [];
  for (const text of texts) {
    const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacementsPreview(text, fx.readerIndex));
    out.previews.push({ text, speech: p.speech, spans: p.spans, timedOut: p.timedOut ?? [], ms: p.ms });
  }
  const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.runner = rep.runner;
  state.rows5r = { documentRows, globalRows, merged: [...documentRows, ...globalRows] };
  return JSON.stringify(out, null, 1);
})()
