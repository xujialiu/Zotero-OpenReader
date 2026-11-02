// Item 11, part 1 (issue #237): close the fixture session, restore the run's
// preferences in the baseline's order, and verify the owner-reader revert.
// The fixture erase and the reading-position check are part 2 (99). The
// readAloud.memory raw string is restored last, after the tab is closed.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const base = state.baseline;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = safe(() => reader?._internalReader);
  // 1. close the test session (never reopened)
  if (ir) { await Promise.resolve(ir.toggleReadAloudPopup(false)); await new Promise((r) => setTimeout(r, 500)); }
  out.sessionClosed = safe(() => !ir?._readAloudManager?.active);
  // 2. replacements prefs back to the baseline: no user value for either
  Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.replacements');
  Services.prefs.clearUserPref('extensions.zotero.zotero-tts.documentReplacements.user/' + fx.key);
  await new Promise((r) => setTimeout(r, 900)); // the observers' refresh settles
  const rep = JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  out.ownerAfterRestore = safe(() => ({ document: rep.readers?.[0]?.document, lastEdit: rep.readers?.[0]?.lastEdit ? { outcome: rep.readers?.[0]?.lastEdit.outcome, changed: rep.readers?.[0]?.lastEdit.changed } : null }));
  out.fixtureRowsAfterRestore = safe(() => rep.readers?.[1]?.rows);
  out.globalPrefNow = safe(() => Zotero.Prefs.get('zotero-tts.readAloud.replacements', true));
  out.docPrefNow = safe(() => Zotero.Prefs.get('zotero-tts.documentReplacements.user/' + fx.key, true));
  // 3. the fixture's planted documentVoices record
  const dvPref = 'extensions.zotero.zotero-tts.documentVoices.user/' + fx.key;
  out.docVoiceBefore = safe(() => Zotero.Prefs.get('zotero-tts.documentVoices.user/' + fx.key, true));
  Services.prefs.clearUserPref(dvPref);
  // 4. local.enabled back to no user value (the baseline default)
  Services.prefs.clearUserPref('extensions.zotero.zotero-tts.local.enabled');
  out.localEnabledNow = safe(() => Services.prefs.getBoolPref('extensions.zotero.zotero-tts.local.enabled'));
  out.localEnabledUser = safe(() => Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.local.enabled'));
  // 5. volume back to the snapshot (19, user value)
  Services.prefs.setIntPref('extensions.zotero.zotero-tts.readAloud.volume', base.volume.value);
  out.volumeNow = safe(() => Services.prefs.getIntPref('extensions.zotero.zotero-tts.readAloud.volume'));
  // 6. the Player layout: back to the default (no user value)
  Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.playerLayout');
  out.playerLayoutNow = safe(() => Zotero.Prefs.get('zotero-tts.readAloud.playerLayout', true));
  // 7. documentReplacementsChanged: the baseline held no value
  out.docChangedNow = safe(() => Zotero.Prefs.get('zotero-tts.documentReplacementsChanged', true));
  out.docChangedUser = safe(() => Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.documentReplacementsChanged'));
  return JSON.stringify(out, null, 1);
})()
