// 07-voice-keys-zhTW.js — case 3.4: back on Chinese (Taiwan), the
// previous/next voice keys (Shift+, / Shift+., trusted nsITextInputProcessor
// presses into the reader iframe) cycle inside the zh-TW voices only, and
// wrap in both directions. On a paused player the plugin's switch prepares
// the Engine's handoff and leaves the current voice selected until Play
// (issue #108's paused handoff), so the cycling is read from
// diagnostics.voiceSwitch(): each press walks the handoff's pending target
// to the adjacent voice of the patched list; a press that lands on the
// currently selected voice commits at once (report.last.to). The key event
// carries its own shiftKey — matchesShortcut compares the event's
// modifiers, which a prior Shift keydown does not set on a synthesized
// event.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === state.fixtureItemID);
  if (!reader) return JSON.stringify({ ok: false, error: 'fixture reader gone' });
  const main = Zotero.getMainWindow();
  if (main.Zotero_Tabs.selectedID !== reader.tabID) { main.Zotero_Tabs.select(reader.tabID); await sleep(400); }
  const frame = reader._iframeWindow.document.getElementById('ztts-player-frame');
  const pdoc = frame ? frame.contentDocument : null;
  const manager = () => Components.utils.waiveXrays(reader._internalReader._readAloudManager);
  const fixtureRow = async () => {
    const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const idx = (Zotero.Reader._readers ?? []).findIndex(r => r.itemID === state.fixtureItemID);
    return (parsed?.readers ?? [])[idx] ?? null;
  };
  // Where the walk stands: a preparing/waiting handoff's pending target; a
  // commit's landed voice (report.last.to); or, when the press cancelled the
  // handoff (the adjacent voice was the selected one — step() calls the
  // switch off), the selected voice itself.
  const positionOf = async () => {
    const row = await fixtureRow();
    const h = row?.handoff ?? null;
    const selected = String(row?.selected ?? '');
    if (!h) return { pending: null, stage: null, lastTo: null, at: selected };
    if (h.pending) return { pending: String(h.pending), stage: String(h.stage ?? ''), lastTo: null, at: String(h.pending) };
    if (h.stage === 'committed' && h.last) return { pending: null, stage: 'committed', lastTo: String(h.last.to ?? ''), at: String(h.last.to ?? '') };
    return { pending: null, stage: String(h.stage ?? ''), lastTo: h.last ? String(h.last.to ?? '') : null, at: selected };
  };

  // Back to Chinese (Taiwan) first.
  const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const beforeRow = (before?.readers ?? []).find(r => r.open);
  if (beforeRow?.state?.locale !== 'zh-TW' && pdoc) {
    const option = (beforeRow?.state?.locales ?? []).find(l => l.value === 'zh-TW');
    const button = pdoc.querySelector('.picker[data-pick="locale"]');
    button.click();
    await sleep(200);
    const rows = pdoc.querySelectorAll('.popover .option');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('title') === option.label) { rows[i].click(); break; }
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      await sleep(100);
      if ((JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).readers ?? []).find(r => r.open)?.state?.locale === 'zh-TW') break;
    }
  }
  const list = safe(() => {
    const l = manager().voicesForLanguage;
    const ids = [];
    for (let i = 0; i < (l?.length ?? 0); i++) ids.push(String(l[i]?.id ?? ''));
    return ids;
  }, []);
  out.offeredList = list;
  out.offeredLanguages = safe(() => {
    const all = manager().voices;
    const byId = {};
    for (let i = 0; i < (all?.length ?? 0); i++) byId[String(all[i]?.id)] = String(all[i]?.language ?? '');
    return [...new Set(list.map(id => byId[id] ?? '?'))];
  }, []);
  if (list.length < 2) return JSON.stringify({ ok: false, error: 'fewer than two zh-TW voices offered', list });

  out.focusedWindowIsFrame = safe(() => Services.focus.focusedWindow === reader._iframeWindow, null);
  try { main.focus(); } catch (e) { out.mainFocus = String(e); }
  try { reader._iframeWindow.focus(); } catch (e) { out.frameFocus = String(e); }
  out.focusedAfterFocus = safe(() => Services.focus.focusedWindow === reader._iframeWindow, null);

  // A stale pending handoff from an interrupted earlier step would skew the
  // walk: call it off with a cancelling no-op (setSpeed to its own value).
  const stale = await positionOf();
  if (stale.pending) {
    const m = manager();
    safe(() => m.setSpeed(typeof m.speed === 'number' ? m.speed : 1, false));
    await sleep(300);
    out.stalePendingCancelled = (await positionOf()).pending === null;
  }
  const startID = String(manager().selectedVoiceID ?? '');
  out.start = { id: startID, index: list.indexOf(startID) };
  out.selectedAtStart = String((await fixtureRow())?.selected ?? '');
  out.positionAtStart = (await positionOf()).at;
  const press = async (key, code, keyCode, shift) => {
    const win = reader._iframeWindow;
    const from = await positionOf();
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    if (!tip.beginInputTransactionForTests(win)) return { consumed: 0, error: 'beginInputTransactionForTests refused' };
    const kev = (k, c, kc, shiftKey = false) => new win.KeyboardEvent('', { key: k, code: c, keyCode: kc, bubbles: true, cancelable: true, shiftKey });
    let consumed = 0;
    if (shift) { tip.keydown(kev('Shift', 'ShiftLeft', 16)); }
    consumed = tip.keydown(kev(key, code, keyCode, shift));
    tip.keyup(kev(key, code, keyCode, shift));
    if (shift) { tip.keyup(kev('Shift', 'ShiftLeft', 16)); }
    try { tip.endInputTransaction(); } catch (e) { /* optional */ }
    const t0 = Date.now();
    let to = from;
    while (Date.now() - t0 < 1500) {
      await sleep(100);
      to = await positionOf();
      if (to.at !== null && to.at !== from.at) break;
    }
    await sleep(150);
    to = await positionOf();
    return { consumed, from: from.at, to: to.at, stage: to.stage, moved: to.at !== null && to.at !== from.at };
  };
  const nextKey = safe(() => Zotero.Prefs.get('extensions.zotero.zotero-tts.shortcuts.nextVoice', true), 'Shift+.');
  const prevKey = safe(() => Zotero.Prefs.get('extensions.zotero.zotero-tts.shortcuts.previousVoice', true), 'Shift+,');
  out.bindings = { nextKey, prevKey };

  const steps = [];
  const atNow = async () => (await positionOf()).at;
  // Walk to the end of the list with next presses (at most n, stop when stuck).
  for (let i = 0; i < list.length && (await atNow()) !== list[list.length - 1]; i++) {
    const step = { press: 'next', ...(await press('.', 'Period', 190, true)) };
    steps.push(step);
    if (step.moved === false) break;
  }
  out.atEnd = await atNow();
  // next from the last: wraps to the first.
  steps.push({ press: 'next (wrap up)', ...(await press('.', 'Period', 190, true)) });
  out.afterWrapUp = await atNow();
  // previous from the first: wraps to the last.
  steps.push({ press: 'previous (wrap down)', ...(await press(',', 'Comma', 188, true)) });
  out.afterWrapDown = await atNow();
  // walk back to the start voice.
  for (let i = 0; i < list.length && (await atNow()) !== startID; i++) {
    const step = { press: 'next (return)', ...(await press('.', 'Period', 190, true)) };
    steps.push(step);
    if (step.moved === false) break;
  }
  out.steps = steps;
  const allInList = steps.every(s => !s.to || list.includes(s.to));
  out.selectedAtEnd = String((await fixtureRow())?.selected ?? '');
  out.backOnStart = (await atNow()) === startID;
  out.paused = safe(() => !!manager().paused);
  out.ok = allInList
    && out.atEnd === list[list.length - 1]
    && out.afterWrapUp === list[0]
    && out.afterWrapDown === list[list.length - 1]
    && out.backOnStart
    && out.paused === true
    && out.selectedAtEnd === out.selectedAtStart;
  return JSON.stringify(out);
})();
