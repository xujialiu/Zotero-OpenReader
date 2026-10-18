// 09-english-regions.js — case 5. (5.2) Under a generic language, the voice
// menu holds only generic voices (player-voice-list item 2), read on the
// Fish entry: a paused pick spends a Fish request, so when the Player is
// already on Fish's generic English the menu is only read, otherwise the
// entry and language are picked first. (5.1) On System's English: US, GB
// stay en-US, en-GB and are re-picked (regional-picks items 2-3); macOS
// sends no generic English, so generic 'en' is expected absent from the
// Player's language list (negative check) — the generic menu is 5.2's.
(async () => {
  const out = { regions: [], genericMenu: null };
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === state.fixtureItemID);
  if (!reader) return JSON.stringify({ ok: false, error: 'fixture reader gone' });
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs.selectedID !== reader.tabID) { main.Zotero_Tabs.select(reader.tabID); await sleep(400); }
  const frame = reader._iframeWindow.document.getElementById('ztts-player-frame');
  const pdoc = frame.contentDocument;
  const manager = () => Components.utils.waiveXrays(reader._internalReader._readAloudManager);
  const ppRow = async () => {
    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    return (pp?.readers ?? []).find(r => r.open) ?? null;
  };
  const readStaged = async () => {
    try {
      const all = String(await Zotero.Debug.get());
      return all.split('\n').filter(l => l.includes('[zotero-tts] staged'));
    } catch { return []; }
  };
  let stagedCount = (await readStaged()).length;
  const pickLocale = async (want) => {
    const row = await ppRow();
    if (row?.state?.locale === want) return true;
    const option = (row?.state?.locales ?? []).find(l => l.value === want);
    if (!option) return false;
    const button = pdoc.querySelector('.picker[data-pick="locale"]');
    button.click();
    await sleep(200);
    const rows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('title') === option.label) { rows[i].click(); break; }
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) { await sleep(100); if ((await ppRow())?.state?.locale === want) return true; }
    return false;
  };
  const pickProvider = async (want) => {
    const row = await ppRow();
    if (row?.state?.provider === want) return true;
    const option = (row?.state?.providers ?? []).find(p => p.value === want);
    if (!option) return false;
    const button = pdoc.querySelector('.picker[data-pick="provider"]');
    button.click();
    await sleep(200);
    const rows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('title') === option.label) { rows[i].click(); break; }
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) { await sleep(100); if ((await ppRow())?.state?.provider === want) return true; }
    return false;
  };

  // 5.2 first, while the Player may still sit on Fish's generic English.
  const fishOn = safe(() => Zotero.Prefs.get(P + 'zotero-tts.fish.enabled', true)) === true;
  if (!fishOn) {
    out.genericMenu = { testable: false, reason: 'zotero-tts.fish.enabled is not true', coveredBy: 'test/read-aloud/player-voice-list.test.ts — "offers a generic selection only the generic voices, and applies it with a stale US region"' };
  } else {
    let row = await ppRow();
    const already = row?.state?.provider === 'fish' && row?.state?.locale === 'en';
    let toFish = null, languagePick = null;
    if (!already) {
      toFish = await pickProvider('fish');
      await sleep(400);
      row = await ppRow();
      let lang = row?.state?.locale ?? '';
      if (lang !== 'en') {
        languagePick = await pickLocale('en');
        await sleep(300);
        row = await ppRow();
        lang = row?.state?.locale ?? '';
      }
    }
    const lang = row?.state?.locale ?? '';
    // The patched list the menu would open: ids and languages.
    const menu = safe(() => {
      const list = manager().voicesForLanguage;
      const all = manager().voices;
      const byId = {};
      for (let i = 0; i < (all?.length ?? 0); i++) byId[String(all[i]?.id)] = String(all[i]?.language ?? '');
      const ids = [];
      for (let i = 0; i < (list?.length ?? 0); i++) ids.push({ id: String(list[i]?.id ?? ''), language: byId[String(list[i]?.id)] ?? '?' });
      return ids;
    }, []);
    out.genericMenu = {
      testable: true, already, toFish, languagePick,
      locale: lang, voice: row?.state?.voice ?? null,
      menuCount: menu.length,
      languages: [...new Set(menu.map(m => m.language))],
      menuHasEnUS: menu.some(m => m.language === 'en-US'),
      menuShowsAdrian: (row?.state?.voices ?? []).some(v => /adrian/i.test(v.label)),
      playerVoiceLabels: (row?.state?.voices ?? []).map(v => v.label).slice(0, 6),
    };
    // The same list as the diagnostic sees it (rows follow the readers' order).
    const pvlIdx = (Zotero.Reader._readers ?? []).findIndex(r => r.itemID === state.fixtureItemID);
    const pvl = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerVoiceList()), null);
    out.genericMenu.playerVoiceList = pvlIdx >= 0 ? ((pvl ?? [])[pvlIdx] ?? null) : null;
    out.genericMenu.ok = lang === 'en'
      && out.genericMenu.menuCount > 0 && out.genericMenu.languages.length === 1 && out.genericMenu.languages[0] === 'en'
      && out.genericMenu.menuHasEnUS === false
      && out.genericMenu.playerVoiceList?.offered === out.genericMenu.menuCount
      && (toFish === null || toFish === true) && (languagePick === null || languagePick === true);
  }

  // 5.1 on the System entry.
  const onSystem = await pickProvider('system');
  await sleep(300);
  out.genericEnOffered = ((await ppRow())?.state?.locales ?? []).some(l => l.value === 'en');
  const steps = ['en-US', 'en-GB', 'en-US'];
  for (const want of steps) {
    const okPick = await pickLocale(want);
    await sleep(300);
    const now = await ppRow();
    const lines = await readStaged();
    out.regions.push({
      want, okPick, locale: now?.state?.locale ?? null, voice: now?.state?.voice ?? null,
      provider: now?.state?.provider ?? null,
      newStagedLines: lines.slice(stagedCount),
    });
    stagedCount = lines.length;
  }
  const r = out.regions;
  out.regionsOk = onSystem && r.length === 3
    && r[0].locale === 'en-US' && r[1].locale === 'en-GB'
    && r[2].locale === 'en-US' && r[2].voice === r[0].voice
    && out.genericEnOffered === false
    && r.every(x => x.provider === 'system');

  out.ok = out.regionsOk && (out.genericMenu?.ok === true || out.genericMenu?.testable === false);
  return JSON.stringify(out);
})();
