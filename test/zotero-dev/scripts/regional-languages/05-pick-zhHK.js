// 05-pick-zhHK.js — case 3.2: through the language dropdown choose
// Chinese (Hong Kong). Expected: state.locale zh-HK on a zh-HK voice, the
// debug line `staged an exact zh-HK voice for the language pick: <id>`, and
// playerVoiceList patched with offered (zh-HK) < compatible (all Chinese).
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };
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
  const before = await ppRow();
  out.before = before ? { locale: before.state.locale, voice: before.state.voice } : null;
  const hk = (before?.state?.locales ?? []).find(l => l.value === 'zh-HK');
  if (!hk) return JSON.stringify({ ok: false, error: 'no zh-HK language offered', locales: before?.state?.locales?.map(l => l.label + ' [' + l.value + ']') });
  out.offeredAs = hk.label;
  const stagedBefore = (await readStaged()).length;

  // The language dropdown: click the picker, then the Chinese (Hong Kong) row.
  const localeButton = pdoc.querySelector('.picker[data-pick="locale"]');
  localeButton.click();
  await sleep(200);
  let row = null;
  const rows = pdoc.querySelectorAll('.popover .option');
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('title') === hk.label) { row = rows[i]; break; }
  }
  if (!row) { localeButton.click(); return JSON.stringify({ ok: false, error: 'no Chinese (Hong Kong) row', titles: Array.from({ length: rows.length }, (_, i) => rows[i].getAttribute('title')) }); }
  row.click();
  const t0 = Date.now();
  let settled = null;
  while (Date.now() - t0 < 2000) {
    await sleep(100);
    const now = await ppRow();
    if (now?.state?.locale === 'zh-HK') { settled = Date.now() - t0; break; }
  }
  await sleep(500);
  const after = await ppRow();
  out.after = after ? { locale: after.state.locale, voice: after.state.voice } : null;
  out.settleMs = settled;

  const staged = await readStaged();
  out.stagedLines = staged.slice(stagedBefore);

  // The player voice list: patched, offered (zh-HK) < compatible (Chinese).
  // Rows follow Zotero.Reader._readers' order and carry no title: take the
  // fixture's own index.
  const pvl = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerVoiceList()), null);
  const idx = (Zotero.Reader._readers ?? []).findIndex(r => r.itemID === state.fixtureItemID);
  const rowPVL = idx >= 0 ? ((pvl ?? [])[idx] ?? null) : null;
  out.playerVoiceList = rowPVL;
  out.managerVoices = safe(() => {
    const m = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    const list = m.voicesForLanguage;
    const ids = [];
    for (let i = 0; i < (list?.length ?? 0); i++) ids.push(String(list[i]?.id ?? ''));
    return ids;
  });
  out.paused = safe(() => !!Components.utils.waiveXrays(reader._internalReader._readAloudManager).paused);
  out.ok = out.after?.locale === 'zh-HK' && rowPVL?.patched === true
    && rowPVL?.offered < rowPVL?.compatible
    && out.stagedLines.some(l => l.includes('staged an exact zh-HK voice for the language pick'))
    && out.paused === true;
  return JSON.stringify(out);
})();
