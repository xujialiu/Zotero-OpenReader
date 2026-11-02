// Item 11, part 1 (issue #237): close the fixture session, close the
// fixture's tab (a live reader re-persists the voice prefs), reselect the
// owner's tab (the baseline's selected reader), restore the run's
// preferences in the baseline's order (the rows first — their observers'
// refresh reverts the owner's reading; memory LAST), and record the
// owner-reader revert evidence. The fixture item's erase and the final
// checks are part 2. Volume's original (19, user) from the recovered
// snapshot. params: none. state: reads baseline, fixture.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fixture;
  const base = state.baseline;
  const P = 'extensions.zotero.zotero-tts.';
  const ZP = 'extensions.zotero.reader.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const win = Services.wm.getMostRecentWindow('navigator:browser');
  const engine = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const rep = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements());
  // the owner's revert evidence, before
  const rep0 = await rep();
  out.ownerBefore = {
    held832: safe(() => (rep0.readers ?? [])[0]?.held?.['832'] ?? null),
    lastEdit: safe(() => { const le = (rep0.readers ?? [])[0]?.lastEdit; return le ? { outcome: le.outcome, changed: le.changed } : null; }),
  };
  // 1. close the fixture session
  const reader = (Zotero.Reader._readers ?? [])[fx.readerIndex];
  const ir = reader?._internalReader;
  if (ir) { await Promise.resolve(ir.toggleReadAloudPopup(false)); await sleep(600); }
  out.sessionClosed = safe(() => !ir._readAloudManager?.active);
  // 2. the owner's reader state as found (active paused session left alone)
  const eng0 = await engine();
  out.ownerSession = safe(() => ({ active: eng0.readers?.[0]?.session ? true : false, paused: eng0.readers?.[0]?.session?.paused, position: eng0.readers?.[0]?.session?.position }));
  // 3. close the fixture tab, reselect the owner's (the baseline's selected reader: itemID 2276)
  const fixtureTabID = safe(() => reader.tabID);
  const ownerReader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === 2276);
  const ownerTabID = safe(() => ownerReader?.tabID);
  out.tabIDs = { fixtureTabID, ownerTabID };
  if (fixtureTabID) { try { win.Zotero_Tabs.close(fixtureTabID); } catch (e) { out.tabCloseError = String(e); } }
  await sleep(900);
  if (ownerTabID) { try { win.Zotero_Tabs.select(ownerTabID); } catch (e) { out.selectError = String(e); } }
  await sleep(600);
  out.selectedIDNow = safe(() => win.Zotero_Tabs.selectedID);
  out.readersNow = (Zotero.Reader._readers ?? []).map((r) => r.itemID);
  // 4. the replacements prefs back to the baseline (rows first: the refresh reverts the owner's reading)
  if (base.replacements.user) Services.prefs.setStringPref(P + 'readAloud.replacements', base.replacements.value);
  else Services.prefs.clearUserPref(P + 'readAloud.replacements');
  Services.prefs.clearUserPref(P + 'documentReplacements.user/' + fx.key);
  Services.prefs.clearUserPref(P + 'documentReplacementsChanged');
  await sleep(1500); // the observers' refresh settles
  const rep1 = await rep();
  out.ownerAfterRestore = {
    held832: safe(() => (rep1.readers ?? [])[0]?.held?.['832'] ?? null),
    lastEdit: safe(() => { const le = (rep1.readers ?? [])[0]?.lastEdit; return le ? { outcome: le.outcome, changed: le.changed } : null; }),
    fixtureRows: safe(() => (rep1.readers ?? [])[3]?.rows ?? 'no fixture reader'),
  };
  out.globalPrefNow = safe(() => Services.prefs.getStringPref(P + 'readAloud.replacements', null));
  out.docPrefNow = safe(() => Services.prefs.getStringPref(P + 'documentReplacements.user/' + fx.key, null));
  out.pulseNow = safe(() => Services.prefs.getStringPref(P + 'documentReplacementsChanged', null));
  // 5. the fixture's planted documentVoices record
  Services.prefs.clearUserPref(P + 'documentVoices.user/' + fx.key);
  out.docVoicesNow = safe(() => Services.prefs.getStringPref(P + 'documentVoices.user/' + fx.key, null));
  // 6. local.* back (enabled had no user value; baseURL the owner's value + user flag)
  if (base.localEnabled.user) Services.prefs.setBoolPref(P + 'local.enabled', base.localEnabled.value);
  else Services.prefs.clearUserPref(P + 'local.enabled');
  if (base.localBaseURL.user) Services.prefs.setStringPref(P + 'local.baseURL', base.localBaseURL.value);
  else Services.prefs.clearUserPref(P + 'local.baseURL');
  if (base.localVoice.user) Services.prefs.setStringPref(P + 'local.voice', base.localVoice.value);
  else Services.prefs.clearUserPref(P + 'local.voice');
  out.localNow = {
    enabled: safe(() => Services.prefs.getBoolPref(P + 'local.enabled', null)),
    enabledUser: safe(() => Services.prefs.prefHasUserValue(P + 'local.enabled')),
    baseURL: safe(() => Services.prefs.getStringPref(P + 'local.baseURL', null)),
    voice: safe(() => Services.prefs.getStringPref(P + 'local.voice', null)),
  };
  // 7. the tier switch 17 restored (verify)
  out.standardEnabledNow = safe(() => Services.prefs.getBoolPref(P + 'zotero-standard.enabled', null));
  // 8. defaultVoice verbatim
  if (base.defaultVoice.user) Services.prefs.setStringPref(P + 'readAloud.defaultVoice', base.defaultVoice.value);
  else Services.prefs.clearUserPref(P + 'readAloud.defaultVoice');
  out.defaultVoiceNow = safe(() => Services.prefs.getStringPref(P + 'readAloud.defaultVoice', null));
  // 9. Zotero's readAloudVoices verbatim (the fixture tab is closed)
  if (base.readAloudVoices.user) Services.prefs.setStringPref(ZP + 'readAloudVoices', base.readAloudVoices.value);
  else Services.prefs.clearUserPref(ZP + 'readAloudVoices');
  out.readAloudVoicesNow = safe(() => Services.prefs.getStringPref(ZP + 'readAloudVoices', null))?.length ?? null;
  // 10. volume, layout, speed
  Services.prefs.setIntPref(P + 'readAloud.volume', base.volume.value);
  out.volumeNow = safe(() => Services.prefs.getIntPref(P + 'readAloud.volume'));
  if (base.playerLayout.user) Services.prefs.setStringPref(P + 'readAloud.playerLayout', base.playerLayout.value);
  else Services.prefs.clearUserPref(P + 'readAloud.playerLayout');
  out.playerLayoutNow = safe(() => Services.prefs.getStringPref(P + 'readAloud.playerLayout', null));
  out.speedPercentNow = safe(() => Services.prefs.getIntPref(P + 'readAloud.speedPercent', null));
  // 11. readAloud.memory raw, LAST
  if (base.memory.user) Services.prefs.setStringPref(P + 'readAloud.memory', base.memory.value);
  else Services.prefs.clearUserPref(P + 'readAloud.memory');
  out.memoryRestoredUser = safe(() => Services.prefs.prefHasUserValue(P + 'readAloud.memory'));
  out.memoryLength = safe(() => (Services.prefs.getStringPref(P + 'readAloud.memory', null) ?? '').length);
  return JSON.stringify(out, null, 1);
})()
