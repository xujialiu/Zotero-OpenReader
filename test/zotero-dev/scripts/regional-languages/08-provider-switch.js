// 08-provider-switch.js — case 4. (a) Only where Azure is on: on Chinese
// (Hong Kong), pick the Azure entry, then the System entry — Hong Kong must
// hold each time, with the `staged a zh-HK voice for the provider pick`
// line. (b) On English (United Kingdom), switch entries between two that
// both have en-GB: the region holds and no staging line appears.
(async () => {
  const out = { azure: null, english: null };
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === state.fixtureItemID);
  if (!reader) return JSON.stringify({ ok: false, error: 'fixture reader gone' });
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs.selectedID !== reader.tabID) { main.Zotero_Tabs.select(reader.tabID); await sleep(400); }
  const frame = reader._iframeWindow.document.getElementById('ztts-player-frame');
  const pdoc = frame.contentDocument;
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

  // Pick a language through the dropdown, by locale value.
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
  // Pick an entry through the provider dropdown, by tier value.
  const pickProvider = async (want) => {
    const row = await ppRow();
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

  // (a) Azure on Chinese (Hong Kong) — only where Azure is already on.
  const azureOn = safe(() => Zotero.Prefs.get(P + 'zotero-tts.azure.enabled', true)) === true;
  if (!azureOn) {
    out.azure = { testable: false, reason: 'zotero-tts.azure.enabled is not true', coveredBy: 'test/read-aloud/memory-sync.test.ts — "keeps Hong Kong across a provider switch where the new entry has it, and nothing else"' };
  } else {
    const onHK = await pickLocale('zh-HK');
    const before = await ppRow();
    const sysHK = before?.state?.voice ?? null;
    const lines0 = (await readStaged()).length; stagedCount = lines0;
    const toAzure = await pickProvider('azure');
    await sleep(400);
    const atAzure = await ppRow();
    const linesAzure = await readStaged();
    const stagedAzure = linesAzure.slice(stagedCount);
    stagedCount = linesAzure.length;
    const backSystem = await pickProvider('system');
    await sleep(400);
    const atSystem = await ppRow();
    const linesSystem = await readStaged();
    const stagedSystem = linesSystem.slice(stagedCount);
    stagedCount = linesSystem.length;
    out.azure = {
      testable: true, onHK, toAzure, backSystem,
      before: { provider: before?.state?.provider, locale: before?.state?.locale, voice: sysHK },
      atAzure: { locale: atAzure?.state?.locale, voice: atAzure?.state?.voice },
      atSystem: { locale: atSystem?.state?.locale, voice: atSystem?.state?.voice },
      stagedAzure, stagedSystem,
      paused: safe(() => !!Components.utils.waiveXrays(reader._internalReader._readAloudManager).paused),
    };
    out.azure.ok = onHK && toAzure && backSystem
      && atAzure?.state?.locale === 'zh-HK' && String(atAzure?.state?.voice ?? '').startsWith('azure::')
      && atSystem?.state?.locale === 'zh-HK' && atSystem?.state?.voice === sysHK
      && stagedAzure.some(l => l.includes('staged a zh-HK voice for the provider pick'))
      && stagedSystem.some(l => l.includes('staged a zh-HK voice for the provider pick'));
  }

  // (b) English (United Kingdom), switch between two entries that both have en-GB.
  //     The brief names System and Fish (both list en-GB; Azure is off).
  const row0 = await ppRow();
  const entries = (row0?.state?.providers ?? []).map(p => p.value);
  const second = 'fish';
  if (!entries.includes('system') || !entries.includes(second)) {
    out.english = { testable: false, reason: 'System or Fish entry not offered on the Player', entries, coveredBy: 'test/read-aloud/memory-sync.test.ts — "stages nothing for a provider switch from a locale Zotero tells apart"' };
  } else {
    const onGB = await pickLocale('en-GB');
    const before = await ppRow();
    const gbVoice = before?.state?.voice ?? null;
    const lines0 = (await readStaged()).length;
    const toSecond = await pickProvider(second);
    await sleep(400);
    const atSecond = await ppRow();
    const toSystem = await pickProvider('system');
    await sleep(400);
    const atSystem = await ppRow();
    const lines1 = await readStaged();
    out.english = {
      testable: true, second, onGB, toSecond, toSystem,
      before: { provider: before?.state?.provider, locale: before?.state?.locale, voice: gbVoice },
      atSecond: { locale: atSecond?.state?.locale, voice: atSecond?.state?.voice },
      atSystem: { locale: atSystem?.state?.locale, voice: atSystem?.state?.voice },
      newStagedLines: lines1.slice(lines0),
    };
    out.english.ok = onGB && toSecond && toSystem
      && atSecond?.state?.locale === 'en-GB' && atSystem?.state?.locale === 'en-GB'
      && atSystem?.state?.voice === gbVoice
      && lines1.slice(lines0).length === 0;
  }
  out.ok = (out.azure?.ok !== false) && (out.english?.ok !== false)
    && (out.azure === null || out.azure.ok === true || out.azure.testable === false)
    && (out.english.ok === true || out.english.testable === false);
  return JSON.stringify(out);
})();
