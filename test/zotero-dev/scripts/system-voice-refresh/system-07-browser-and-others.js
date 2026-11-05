// system-voice-refresh 07 (final revision, executed in the resumed run): after the passing
// check the voice browser lists the LOCAL Andrew HD row under System / English, and the
// persisted owner state is unchanged except the expected fixture-setup mutation
// (readAloudVoices gained the fixture's David entry when the popup applied the planted
// document choice — restored byte-identically at cleanup, not a product change).
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, ms, step = 250) => {
    const end = Date.now() + ms;
    let value = test();
    while (!value && Date.now() < end) { await sleep(step); value = test(); }
    return value;
  };
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document.getElementById('ztts-provider-system') ? win.document : null;
    if (!doc) throw new Error('plugin pane not shown');
    const statusText = () => (doc.getElementById('ztts-voices-status')?.textContent || '').trim();
    const rowsInfo = () => [...(doc.getElementById('ztts-voices-list')?.children || [])].map((row, index) => {
      const buttons = [...row.querySelectorAll('button')];
      return { index, label: (buttons[2]?.textContent || '').trim() };
    }).filter((r) => r.label);
    const tierRow = [...(doc.getElementById('ztts-voices-tiers')?.children || [])].find((b) => /^system \(\d+\)$/i.test((b.textContent || '').trim()));
    if (!tierRow) throw new Error('no System tier row');
    tierRow.click();
    await sleep(300);
    // Locale rows are "English (N)" here — one English entry, no "(United States)" suffix
    const localeLabels = () => [...(doc.getElementById('ztts-voices-locales')?.children || [])].map((b) => (b.textContent || '').trim());
    const englishRow = [...(doc.getElementById('ztts-voices-locales')?.children || [])].find((b) => /^english \(\d+\)$/i.test((b.textContent || '').trim()));
    if (!englishRow) throw new Error('no English locale row: ' + JSON.stringify(localeLabels()));
    englishRow.click();
    const listed = await waitFor(() => { const rows = rowsInfo(); return !/listing voices/i.test(statusText()) && rows.length ? rows : null; }, 20000, 300);
    const andrewRows = listed.filter((r) => /andrew/i.test(r.label));
    const davidRow = listed.find((r) => /david desktop/i.test(r.label));
    // Persisted owner state vs the run's snapshot — structural, excluding the fixture entry
    const docVoices = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const recordsNow = docVoices.records || {};
    const recordsBefore = state.docVoicesBefore || {};
    const fixtureKey = state.fixtureDocVoiceKey.replace(prefix, '');
    const beforeEntries = Object.entries(recordsBefore).filter(([k]) => k !== fixtureKey).sort(([a], [b]) => (a < b ? -1 : 1));
    const nowEntries = Object.entries(recordsNow).filter(([k]) => k !== fixtureKey).sort(([a], [b]) => (a < b ? -1 : 1));
    const persistedDocVoicesUnchanged = JSON.stringify(beforeEntries) === JSON.stringify(nowEntries);
    const readAloudVoicesBefore = (() => { try { return JSON.parse(state.prefs['extensions.zotero.reader.readAloudVoices'].value || 'null'); } catch (e) { return null; } })();
    const readAloudVoicesNow = (() => { const v = Services.prefs.getStringPref('extensions.zotero.reader.readAloudVoices', ''); try { return v ? JSON.parse(v) : null; } catch (e) { return { unparsable: v.slice(0, 60) }; } })();
    // Diff by language entry
    const diff = [];
    const langs = new Set([...Object.keys(readAloudVoicesBefore || {}), ...Object.keys(readAloudVoicesNow || {})]);
    for (const lang of langs) {
      const b = JSON.stringify((readAloudVoicesBefore || {})[lang] ?? null);
      const n = JSON.stringify((readAloudVoicesNow || {})[lang] ?? null);
      if (b !== n) diff.push({ lang, before: b.slice(0, 160), now: n.slice(0, 160) });
    }
    const memorySame = (state.prefs[prefix + 'readAloud.memory'].value ?? '') === Services.prefs.getStringPref(prefix + 'readAloud.memory', '');
    const defaultVoiceSame = (state.prefs[prefix + 'readAloud.defaultVoice'].value ?? '') === Services.prefs.getStringPref(prefix + 'readAloud.defaultVoice', '');
    const fixtureEntryRaw = Services.prefs.getStringPref(state.fixtureDocVoiceKey, '');
    return JSON.stringify({
      localeRows: localeLabels(),
      englishRowsListed: listed.length,
      andrewRows: andrewRows.map((r) => r.label),
      andrewIsLocal: andrewRows.length > 0 && andrewRows.every((r) => !/online/i.test(r.label)),
      davidLabel: davidRow ? davidRow.label : null,
      statusLine: statusText().slice(0, 140),
      persistedDocVoicesUnchangedExcludingFixture: persistedDocVoicesUnchanged,
      fixtureEntryStillPresent: !!fixtureEntryRaw,
      fixtureEntry: fixtureEntryRaw,
      readAloudVoicesDiff: diff,
      readAloudVoicesDiffIsExpectedFixtureWrite: diff.length === 1 && /david/i.test(diff[0].now) && /system::sapi5\//.test(diff[0].now),
      memoryUnchanged: memorySame, defaultVoiceUnchanged: defaultVoiceSame,
    });
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: String(e && e.stack).slice(0, 400) });
  }
})()
