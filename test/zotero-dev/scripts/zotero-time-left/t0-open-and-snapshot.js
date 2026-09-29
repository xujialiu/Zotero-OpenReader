// Issue #140 opener (once per run): typed snapshot of every
// extensions.zotero.zotero-tts.readAloud.* pref plus
// extensions.zotero.reader.readAloudVoices and the two Zotero tier switches
// (secret-bearing values mapped to lengths in the REPORT only; the full
// values live in this run's state for the byte-identical restore), volume
// muted for the run, Premium verified ON, fixture-a.pdf imported and opened
// in the selected tab, host window restored and recorded, the plugin player
// opened and PAUSED AT ONCE (the session starts on the memory voice — it
// must be a '::'-bearing plugin voice, checked before anything opens), then
// the player driven to Zotero Premium / English (US) / 'Premium Voice 1'
// while paused, so nothing of Zotero's is ever synthesized. Also measures
// Zotero's own Intl.DurationFormat short form in this chrome (issue #140's
// formatter). params: fixtureTitle. state: everything later scripts and the
// cleanup need (Zotero.__zttsTimeLeft140).
(async () => {
  const out = { step: 'open-and-snapshot' };
  if (Zotero.__zttsTimeLeft140 && Zotero.__zttsTimeLeft140.baseline) throw new Error('run state already holds a baseline -- 90-cleanup must run first; never snapshot over a baseline');
  const S = (Zotero.__zttsTimeLeft140 = Zotero.__zttsTimeLeft140 || {});
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, timeout = 24000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = false;
      try { v = await test(); } catch (_) { v = false; }
      if (v) return v;
      await sleep(step);
    }
    return test();
  };
  try {
    // --- Close the settings window the credits kit left open (its own 99 records it closed). ---
    const stalePane = Services.wm.getMostRecentWindow('zotero:pref');
    if (stalePane) {
      stalePane.close();
      const t9 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t9 < 10000) await sleep(200);
    }
    out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

    // --- Zotero's own short form, measured in this chrome (the brief's probe). ---
    const Format = (typeof Intl !== 'undefined' && Intl.DurationFormat) ? Intl.DurationFormat : null;
    out.durationFormatProbe = {
      hasDurationFormat: !!Format,
      'zh-CN': Format ? new Intl.DurationFormat('zh-CN', { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' }).format({ days: 0, hours: 1, minutes: 54 }) : null,
      'en-US': Format ? new Intl.DurationFormat('en-US', { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' }).format({ days: 0, hours: 1, minutes: 54 }) : null,
    };
    const fmtMinutes = (minutes) => {
      const rest = Math.max(0, Math.ceil(minutes));
      const days = Math.floor(rest / 1440);
      const hours = Math.floor((rest % 1440) / 60);
      const mins = rest % 60;
      if (!Format) return days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return new Format(undefined, { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' })
        .format({ days, hours, minutes: mins });
    };
    S.fmtMinutes = fmtMinutes;
    out.fmtCheck = { 114: fmtMinutes(114), '260/10': fmtMinutes(260 / 10), '260/30': fmtMinutes(260 / 30) };

    // --- Typed snapshot: every readAloud.* pref, reader.readAloudVoices, the tier switches. ---
    const readTyped = (key) => {
      const type = p.getPrefType(key);
      let value = null;
      try {
        if (type === p.PREF_BOOL) value = p.getBoolPref(key);
        else if (type === p.PREF_INT) value = p.getIntPref(key);
        else if (type === p.PREF_STRING) value = p.getStringPref(key);
      } catch (_) {}
      return { key, type, user: p.prefHasUserValue(key), value };
    };
    const branch = Services.prefs.getBranch(prefix + 'readAloud.');
    const names = branch.getChildList('') || [];
    const readAloudNames = names.filter((n) => n && n.length).map((n) => n.replace(/\.$/, ''));
    const baseline = {};
    for (const n of readAloudNames) baseline['readAloud.' + n] = readTyped(prefix + 'readAloud.' + n);
    baseline['reader.readAloudVoices'] = readTyped('extensions.zotero.reader.readAloudVoices');
    baseline['zotero-standard.enabled'] = readTyped(prefix + 'zotero-standard.enabled');
    baseline['zotero-premium.enabled'] = readTyped(prefix + 'zotero-premium.enabled');
    // Secret-bearing values are mapped to lengths before anything reaches a
    // tool result (the 00/99 rule; found live 2026-09-29 on the credits run).
    const secret = (suffix) => suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices';
    const safeSnapshot = {};
    for (const [suffix, rec] of Object.entries(baseline)) {
      safeSnapshot[suffix] = secret(suffix)
        ? { type: rec.type, user: rec.user, chars: typeof rec.value === 'string' ? rec.value.length : null }
        : { type: rec.type, user: rec.user, value: rec.value };
    }
    S.baseline = baseline;
    out.snapshotted = { count: Object.keys(baseline).length, names: Object.keys(baseline) };
    out.baselineSafe = safeSnapshot;
    const memRec = baseline['readAloud.memory'];
    const memVal = memRec && memRec.user ? String(memRec.value ?? '') : '';
    out.memory = { hasUserValue: !!(memRec && memRec.user), chars: memVal.length, hasDoubleColon: memVal.includes('::') };
    if (!(memRec && memRec.user && memVal.includes('::'))) throw new Error('readAloud.memory does not name a listed plugin voice (::-bearing); refusing to open a player');

    // --- Mute for the run (volume is inside the snapshot; restored byte-identical). ---
    p.setIntPref(prefix + 'readAloud.volume', 0);
    out.volumeMuted = p.getIntPref(prefix + 'readAloud.volume') === 0;

    // --- Premium must be ON (the credits run's 02 turned it on; self-heal on the pref). ---
    if (Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') !== true) {
      p.setBoolPref(prefix + 'zotero-premium.enabled', true);
      out.premiumSelfHealed = true;
    }
    out.premiumOn = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled') === true;
    if (!out.premiumOn) throw new Error('zotero-premium.enabled did not go on');

    // --- Position rows before the fixture (counted out again at cleanup). ---
    const diagnostics = Zotero.ZoteroTTS.diagnostics;
    const posBefore = JSON.parse(await diagnostics.position());
    S.positionRowsBefore = posBefore.database ? posBefore.database.rows : null;
    out.positionRowsBefore = S.positionRowsBefore;

    // --- Import fixture-a.pdf and open it. ---
    const lib = Zotero.Libraries.userLibraryID;
    const title = Zotero.ZoteroTTSRun.params.fixtureTitle;
    const find = async () => {
      const s = new Zotero.Search();
      s.addCondition('libraryID', 'is', String(lib));
      s.addCondition('title', 'is', title);
      const ids = await s.search();
      for (const id of ids) { const it = Zotero.Items.get(id); if (it && it.isAttachment()) return id; }
      return null;
    };
    let itemID = await find();
    const imported = itemID === null;
    if (imported) {
      const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(Zotero.ZoteroTTSRun.params.root, 'test', 'fixtures', 'fixture-a.pdf'), libraryID: lib, title });
      itemID = item.id;
    }
    S.itemID = itemID;
    out.fixture = { itemID, imported };
    const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
    if (!readerOf(itemID)) await Zotero.Reader.open(itemID);
    const ready = await waitFor(() => { const r = readerOf(itemID); return r && r._internalReader && r._internalReader._readAloudManager && r._iframeWindow && r._iframeWindow.document ? r : null; }, 24000, 300);
    if (!ready) throw new Error('fixture reader never became ready (_internalReader/_readAloudManager/iframe)');
    S.tabID = ready.tabID;
    out.fixtureTab = { itemID, tabID: ready.tabID };

    // --- Host window: record, restore, focus, select the fixture tab. ---
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    if (!host) throw new Error('no main window');
    if (!S.hostBefore) {
      S.hostBefore = { windowState: host.windowState, screenX: host.screenX, screenY: host.screenY, outerWidth: host.outerWidth, outerHeight: host.outerHeight, selectedTab: host.Zotero_Tabs ? host.Zotero_Tabs.selectedID : null };
    }
    out.hostBefore = S.hostBefore;
    if (host.windowState === 2) host.restore();
    host.focus();
    await sleep(400);
    host.Zotero_Tabs.select(ready.tabID);
    await waitFor(() => host.Zotero_Tabs.selectedID === ready.tabID, 8000, 100);
    out.fixtureTabSelected = host.Zotero_Tabs.selectedID === ready.tabID;
    ready._iframeWindow && ready._iframeWindow.focus && ready._iframeWindow.focus();
    await sleep(300);

    // --- Open the plugin player, pause RELIABLY (confirmed, retried). ---
    const doc = ready._iframeWindow.document;
    const button = doc.getElementById('ztts-player-toggle');
    if (!button) throw new Error('plugin player icon not attached to the fixture reader');
    button.click();
    const opened = await waitFor(() => {
      const m = ready._internalReader._readAloudManager;
      const frame = doc.getElementById('ztts-player-frame');
      return m && m.active && frame && !frame.hidden && frame.contentDocument && frame.contentDocument.querySelector('.player') ? m : null;
    }, 24000, 150);
    if (!opened) throw new Error('the player did not open / the session did not start');
    const frame = doc.getElementById('ztts-player-frame');
    const child = Components.utils.waiveXrays(frame.contentWindow);
    if (typeof child.zttsCommand !== 'function') throw new Error('zttsCommand export missing from the player frame');
    const isPaused = () => { const m = ready._internalReader._readAloudManager; return !!(m && m.active && m.paused); };
    let pauseAttempts = [];
    for (let attempt = 0; attempt < 3 && !isPaused(); attempt++) {
      const how = attempt === 0 ? 'play-button' : attempt === 1 ? 'zttsCommand-play' : 'manager-pause';
      try {
        if (how === 'play-button') { const playBtn = frame.contentDocument.querySelector('.play'); if (playBtn) playBtn.click(); }
        else if (how === 'zttsCommand-play') child.zttsCommand('play');
        else { const m = ready._internalReader._readAloudManager; if (m && typeof m.pause === 'function') m.pause(); }
      } catch (e) { pauseAttempts.push(how + ' threw: ' + String(e).slice(0, 80)); continue; }
      const ok = await waitFor(isPaused, 5000, 100);
      pauseAttempts.push(how + (ok ? ':paused' : ':not-paused'));
    }
    out.pauseAttempts = pauseAttempts;
    out.openedAndPaused = isPaused();
    if (!out.openedAndPaused) throw new Error('the fixture session would not pause after 3 attempts');
    const sessionVoice = String(opened.selectedVoiceID || '');
    out.sessionVoiceAfterOpen = { hasDoubleColon: sessionVoice.includes('::'), chars: sessionVoice.length };
    if (!sessionVoice.includes('::')) out.sessionVoiceWarning = 'the session voice has no :: (a Zotero voice); it was paused at once';

    // --- Drive the player to Zotero Premium / en-US / Premium Voice 1, PAUSED before and after each pick. ---
    const snap = async () => JSON.parse(await diagnostics.pluginPlayer());
    const myEntry = async () => {
      const diag = await snap();
      const rows = diag.readers || [];
      const open = [];
      for (let i = 0; i < rows.length; i++) if (rows[i] && rows[i].open) open.push(rows[i]);
      return open;
    };
    const ensurePausedAgain = async () => {
      for (let attempt = 0; attempt < 3 && !isPaused(); attempt++) {
        const m = ready._internalReader._readAloudManager;
        if (m && m.active && !m.paused) child.zttsCommand('play');
        else if (m && !m.active) break;
        await waitFor(isPaused, 4000, 100);
      }
      if (!isPaused()) throw new Error('the session resumed and would not re-pause before a pick');
    };
    const pick = async (action, value, test) => {
      await ensurePausedAgain();
      child.zttsCommand(action, value);
      let ok = await waitFor(async () => {
        const rows = await myEntry();
        return rows.length === 1 && test(rows[0].state) ? rows[0] : null;
      }, 20000, 150);
      if (!ok) {
        await ensurePausedAgain();
        child.zttsCommand(action, value);
        ok = await waitFor(async () => {
          const rows = await myEntry();
          return rows.length === 1 && test(rows[0].state) ? rows[0] : null;
        }, 20000, 150);
      }
      if (!ok) {
        const rows = await myEntry();
        throw new Error('player pick did not settle: ' + action + ' (actionError: ' + (rows[0] ? String(rows[0].actionError) : 'none') + ')');
      }
      await ensurePausedAgain();
      return ok.state;
    };
    // Zotero's own tiers reach the manager's tier list only after the
    // activation voice load finishes (the live voice list's remote load);
    // a pick sent earlier throws unavailable-choice. Wait for the choice to
    // be LISTED before sending it.
    const waitListed = (test, what, timeout = 45000) => waitFor(async () => {
      const rows = await myEntry();
      return rows.length === 1 && test(rows[0].state) ? rows[0].state : null;
    }, timeout, 250).then((st) => { if (!st) throw new Error(what + ' never became available in the player'); return st; });
    await waitListed((st) => (st.providers || []).some((v) => v.value === 'premium'), 'the Zotero Premium provider');
    await pick('provider', 'premium', (st) => st.provider === 'premium');
    await waitListed((st) => (st.locales || []).some((v) => v.value === 'en-US'), 'the en-US locale');
    await pick('locale', 'en-US', (st) => st.locale === 'en-US' || st.locale === 'en');
    let state = await waitListed((st) => (st.voices || []).some((v) => v.label === 'Premium Voice 1'), 'Premium Voice 1');
    out.settledLocale = state.locale;
    const target = (state.voices || []).find((v) => v.label === 'Premium Voice 1');
    if (!target) throw new Error('Premium Voice 1 is not among the player\'s voices: ' + JSON.stringify((state.voices || []).slice(0, 8)));
    await pick('voice', target.value, (st) => st.voice === target.value);
    state = (await myEntry())[0].state;
    S.pickedVoice = { id: target.value, label: target.label };
    out.afterPicks = {
      provider: state.provider, locale: state.locale, voice: state.voice,
      voiceCount: (state.voices || []).length,
      selectedRow: (state.voices || []).find((v) => v.value === state.voice) || null,
      alert: state.alert ?? null, error: state.error ?? null,
    };
    const m = ready._internalReader._readAloudManager;
    out.managerAfterPicks = { active: !!m.active, paused: !!m.paused, tier: m && m._voice ? m._voice.tier : null };
    if (!(m.active && m.paused)) throw new Error('the session is not active+paused after the picks');
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
