// 06-pick-zhTW-zhCN.js — case 3.3: Chinese (Taiwan), then Chinese (China).
// Each settles within one second on a voice of its own locale, and the
// Player stays paused throughout.
(async () => {
  const out = { picks: [] };
  const state = Zotero.ZoteroTTSRun.state;
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

  for (const want of ['zh-TW', 'zh-CN']) {
    const before = await ppRow();
    const option = (before?.state?.locales ?? []).find(l => l.value === want);
    if (!option) { out.picks.push({ want, error: 'not offered' }); continue; }
    const button = pdoc.querySelector('.picker[data-pick="locale"]');
    button.click();
    await sleep(200);
    let row = null;
    const rows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('title') === option.label) { row = rows[i]; break; }
    }
    if (!row) { button.click(); out.picks.push({ want, error: 'no row for ' + option.label }); continue; }
    row.click();
    const t0 = Date.now();
    let settled = null;
    while (Date.now() - t0 < 2000) {
      await sleep(100);
      const now = await ppRow();
      if (now?.state?.locale === want) { settled = Date.now() - t0; break; }
    }
    await sleep(400);
    const after = await ppRow();
    const lines = await readStaged();
    out.picks.push({
      want, settleMs: settled,
      locale: after?.state?.locale ?? null, voice: after?.state?.voice ?? null,
      paused: safe(() => !!Components.utils.waiveXrays(reader._internalReader._readAloudManager).paused),
      newStagedLines: lines.slice(stagedCount),
    });
    stagedCount = lines.length;
  }
  out.ok = out.picks.length === 2 && out.picks.every(p =>
    p.locale === p.want && typeof p.settleMs === 'number' && p.settleMs <= 1000 && p.paused === true);
  return JSON.stringify(out);
})();
