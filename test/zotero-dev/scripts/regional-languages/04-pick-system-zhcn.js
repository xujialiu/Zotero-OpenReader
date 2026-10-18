// 04-pick-system-zhcn.js — case 3.1: through the fixture Player's entry
// dropdown choose the System entry, then Tingting (zh-CN) through the voice
// dropdown, so a Mandarin voice is remembered for zh. Drives the real
// player DOM (picker button, then the option row); a click on a row the
// plugin's state push has re-rendered lands on a detached node, so the
// pick is retried on a fresh query and ok requires the chosen voice to be
// the one selected at the end.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === state.fixtureItemID);
  if (!reader) return JSON.stringify({ ok: false, error: 'fixture reader gone' });
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs.selectedID !== reader.tabID) { main.Zotero_Tabs.select(reader.tabID); await sleep(400); }
  const frame = reader._iframeWindow.document.getElementById('ztts-player-frame');
  if (!frame) return JSON.stringify({ ok: false, error: 'no #ztts-player-frame' });
  const pdoc = frame.contentDocument;
  const ppRow = async () => {
    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    return (pp?.readers ?? []).find(r => r.open) ?? null;
  };
  const readStaged = async () => {
    try {
      const all = String(await Zotero.Debug.get());
      const lines = all.split('\n').filter(l => l.includes('[zotero-tts] staged'));
      return lines;
    } catch { return []; }
  };
  const stagedBefore = (await readStaged()).length;

  const before = await ppRow();
  out.before = before ? { provider: before.state.provider, locale: before.state.locale, voice: before.state.voice } : null;

  // 1. The entry dropdown: the System option (its label from the Player's own providers list).
  const system = (before?.state?.providers ?? []).find(p => p.value === 'system');
  if (!system) return JSON.stringify({ ok: false, error: 'no system entry offered', providers: before?.state?.providers });
  const providerButton = pdoc.querySelector('.picker[data-pick="provider"]');
  providerButton.click();
  await sleep(200);
  let clicked = null;
  const rows = pdoc.querySelectorAll('.popover .option');
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('title') === system.label) { clicked = rows[i]; break; }
  }
  if (!clicked) { providerButton.click(); return JSON.stringify({ ok: false, error: 'no System option row', titles: Array.from({ length: rows.length }, (_, i) => rows[i].getAttribute('title')) }); }
  clicked.click();
  const tProvider = Date.now();
  while (Date.now() - tProvider < 2000) {
    await sleep(100);
    if ((await ppRow())?.state?.provider === 'system') break;
  }
  await sleep(300);

  // 2. The voice dropdown: a zh-CN option from the patched list. The entry
  //    opened on another language, so choose Chinese (China) through the
  //    language dropdown first.
  let mid = await ppRow();
  let zhCN = (mid?.state?.voices ?? []).filter(v => /zh-CN/.test(String(v.value)));
  if (!zhCN.length) {
    const cnOption = (mid?.state?.locales ?? []).find(l => l.value === 'zh-CN');
    if (!cnOption) return JSON.stringify({ ok: false, error: 'no zh-CN language offered after the System entry', locales: mid?.state?.locales?.map(l => l.label + ' [' + l.value + ']') });
    const localeButton = pdoc.querySelector('.picker[data-pick="locale"]');
    localeButton.click();
    await sleep(200);
    const lrows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < lrows.length; i++) {
      if (lrows[i].getAttribute('title') === cnOption.label) { lrows[i].click(); break; }
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      await sleep(100);
      if ((await ppRow())?.state?.locale === 'zh-CN') break;
    }
    // The voice list reloads with the language: wait until it is stable.
    let prev = -1;
    const t1 = Date.now();
    while (Date.now() - t1 < 3000) {
      await sleep(250);
      const n = ((await ppRow())?.state?.voices ?? []).length;
      if (n > 0 && n === prev) break;
      prev = n;
    }
    mid = await ppRow();
    zhCN = (mid?.state?.voices ?? []).filter(v => /zh-CN/.test(String(v.value)));
    out.languageFirst = true;
  }
  out.zhCNOffered = zhCN.map(v => v.label);
  // The brief names Tingting (the compact zh-CN voice) as the pick.
  const target = zhCN.find(v => /Tingting/i.test(v.value))
    ?? zhCN.find(v => v.value !== mid.state.voice) ?? zhCN[0];
  if (!target) return JSON.stringify({ ok: false, error: 'no zh-CN voice offered after the System entry', voices: mid?.state?.voices?.map(v => v.value) });
  out.chosenLabel = target.label;

  // 3. The voice pick, retried on a fresh query when a state push
  //    re-rendered the rows under us.
  const voiceButton = pdoc.querySelector('.picker[data-pick="voice"]');
  let settled = null;
  const attempts = [];
  for (let attempt = 0; attempt < 3 && settled === null; attempt++) {
    if (attempt > 0) await sleep(400);
    // A detached click never ran the row's closePopover: the popover is
    // still open, and this picker click would only close it. Toggle first.
    if (voiceButton.getAttribute('aria-expanded') === 'true') { voiceButton.click(); await sleep(150); }
    voiceButton.click();
    await sleep(250);
    let voiceRow = null;
    const vrows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < vrows.length; i++) {
      if (vrows[i].getAttribute('title') === target.label) { voiceRow = vrows[i]; break; }
    }
    if (!voiceRow) { attempts.push({ attempt, error: 'no option row for ' + target.label }); voiceButton.click(); continue; }
    voiceRow.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 1800) {
      await sleep(100);
      if ((await ppRow())?.state?.voice === target.value) { settled = Date.now() - t0; break; }
    }
    attempts.push({ attempt, settleMs: settled, popoverOpenAfterClick: voiceButton.getAttribute('aria-expanded') });
  }
  out.pickAttempts = attempts;
  // A voice pick on a paused player prepares the Engine's handoff and keeps
  // the current voice selected until Play commits it (issue #108's paused
  // handoff). One muted play-pause cycle commits the pick so zh remembers
  // it; volume is 0 for the run and the voice is a free System one.
  let committed = null;
  if (settled === null) {
    const m = () => Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) { /* best effort */ }
    const t0 = Date.now();
    try {
      m().play();
      while (Date.now() - t0 < 4000) {
        await sleep(150);
        if ((await ppRow())?.state?.voice === target.value) break;
      }
      committed = { playMs: Date.now() - t0, voice: (await ppRow())?.state?.voice ?? null };
    } catch (e) { committed = { error: String(e) }; }
    try { m().pause(); } catch (e) { if (committed) committed.pauseError = String(e); }
    const t1 = Date.now();
    while (Date.now() - t1 < 2000) {
      await sleep(150);
      let mNow = null;
      try { mNow = m(); } catch (e) { break; }
      if (!mNow.active || mNow.paused) break;
    }
    await sleep(300);
  }
  out.commit = committed;
  await sleep(400);
  const after = await ppRow();
  out.after = after ? { provider: after.state.provider, locale: after.state.locale, voice: after.state.voice } : null;
  out.settleMs = settled;

  // 4. A Mandarin voice remembered for zh. Zotero's pref is { <lang>: entry }.
  const map = safe(() => JSON.parse(Zotero.Prefs.get(P + 'reader.readAloudVoices', true)), null);
  out.zhEntry = map?.zh ?? null;
  out.stagedLines = (await readStaged()).slice(stagedBefore);
  out.paused = safe(() => !!Components.utils.waiveXrays(reader._internalReader._readAloudManager).paused);
  out.ok = out.after?.provider === 'system' && out.after?.locale === 'zh-CN'
    && out.after?.voice === target.value
    && !!out.zhEntry && out.zhEntry.voice === out.after.voice && out.paused === true;
  return JSON.stringify(out);
})();
