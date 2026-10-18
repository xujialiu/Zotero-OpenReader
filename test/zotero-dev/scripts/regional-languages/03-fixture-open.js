// 03-fixture-open.js — import fixture-a.pdf as a standalone attachment,
// open its reader (poll ≤7 s intervals under a ~24 s ceiling), make sure the
// memory does not name a metered voice, open the fixture's Player and pause
// it in the same script, wait for the voice listing to land. Volume is
// already 0 (00): a paused pick later plays a muted sample.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = 'extensions.zotero.';
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const title = (Zotero.ZoteroTTSRun.params || {}).fixtureTitle || 'ztts fixture';

  // 1. Import.
  const dir = Zotero.ZoteroTTSRun.params.fixturesDir;
  const file = dir + '/fixture-a.pdf';
  const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  state.fixtureItemID = item.id;
  state.fixtureKey = item.key;
  out.imported = { id: item.id, key: item.key, title: item.getField('title') };

  // 2. Open and poll for the internals.
  await Zotero.Reader.open(item.id);
  let reader = null;
  const deadline = Date.now() + 24000;
  while (Date.now() < deadline) {
    await sleep(4000);
    reader = (Zotero.Reader._readers ?? []).find(r => r.itemID === item.id) ?? null;
    if (reader && safe(() => !!reader._internalReader && !!reader._internalReader._readAloudManager)) break;
    reader = null;
  }
  if (!reader) { out.ok = false; out.error = 'reader internals never appeared within 24 s'; return JSON.stringify(out); }
  out.readerReady = true;

  // 3. Select the fixture tab (the Player mounts only in the selected tab).
  if (reader.tabID && state.window?.selectedTabID !== reader.tabID) {
    safe(() => Zotero.getMainWindow().Zotero_Tabs.select(reader.tabID));
    await sleep(500);
  }
  state.fixtureTabID = safe(() => reader.tabID);

  // 4. The memory names the session's first voice: a metered id (no ::)
  //    must never be what opens. A free defaultVoice can stand in for it.
  const memRaw = safe(() => Zotero.Prefs.get(P + 'zotero-tts.readAloud.memory', true));
  let currentVoice = null;
  try { currentVoice = memRaw ? (JSON.parse(memRaw).voice ?? null) : null; } catch { currentVoice = null; }
  state.memoryWasMetered = !!currentVoice && typeof currentVoice.id === 'string' && !currentVoice.id.includes('::');
  out.memoryBefore = currentVoice ? { id: currentVoice.id, lang: currentVoice.lang } : null;
  if (state.memoryWasMetered) {
    let freeChoice = null;
    try { freeChoice = JSON.parse(safe(() => Zotero.Prefs.get(P + 'zotero-tts.readAloud.defaultVoice', true)))?.voice ?? null; } catch { freeChoice = null; }
    if (freeChoice && typeof freeChoice.id === 'string' && freeChoice.id.includes('::')) {
      safe(() => Zotero.Prefs.set(P + 'zotero-tts.readAloud.memory', JSON.stringify({ voice: freeChoice }), true));
      out.memoryPlanted = freeChoice;
    } else {
      return JSON.stringify({ ok: false, error: 'memory names a metered voice and no free defaultVoice to plant' });
    }
  }

  // 5. Open the Player, then pause in the same script. The listing lands on
  //    the popup open; poll the manager's voices (reader-realm: by index).
  //    One pause only — a fallback toggle would undo the first.
  safe(() => reader._internalReader.toggleReadAloudPopup(true));
  await sleep(1000);
  try { reader._internalReader.toggleReadAloudPaused(); }
  catch (e) { try { Components.utils.waiveXrays(reader._internalReader._readAloudManager).pause(); } catch (e2) { out.pauseError = String(e2); } }
  const voiceDeadline = Date.now() + 10000;
  let count = 0;
  while (Date.now() < voiceDeadline) {
    await sleep(500);
    count = Components.utils.waiveXrays(reader._internalReader._readAloudManager).voices?.length ?? 0;
    if (count > 0) break;
  }
  out.managerVoiceCount = count;
  await sleep(500);
  const m2 = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
  const voices = [];
  for (let i = 0; i < (m2.voices?.length ?? 0); i++) {
    const v = m2.voices[i];
    if (typeof v?.id === 'string') voices.push({ id: v.id, language: String(v.language ?? ''), label: String(v.label ?? v.name ?? '') });
  }
  out.systemEnabled = safe(() => Zotero.Prefs.get(P + 'zotero-tts.system.enabled', true), 'unset');
  out.zhCNVoices = voices.filter(v => v.language === 'zh-CN').map(v => v.label + ' :: ' + v.id);
  out.zhHKVoices = voices.filter(v => v.language === 'zh-HK').map(v => v.label + ' :: ' + v.id);
  out.zhTWVoices = voices.filter(v => v.language === 'zh-TW').map(v => v.label + ' :: ' + v.id);
  out.tiersOffered = [...new Set(voices.map(v => v.id.split('::')[0]))];

  out.manager = { active: !!m2.active, paused: !!m2.paused, selectedVoiceID: m2.selectedVoiceID ?? null, selectedTier: m2.selectedTier ?? null };
  if (typeof out.manager.selectedVoiceID === 'string' && !out.manager.selectedVoiceID.includes('::')) {
    // A Zotero-tier voice: paused at once above, reported here.
    out.meteredSession = true;
  }

  // 6. The fixture's document voice record, as it stands before any pick.
  const dv = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()));
  state.documentVoicesAtOpen = dv?.records ?? {};
  const row = (dv?.readers ?? []).find(r => String(r.key || '').includes(String(state.fixtureKey)));
  out.fixtureDocVoice = row ? { key: row.key, saved: row.saved } : null;

  // 7. The plugin Player's state for the fixture.
  const pp = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()));
  const fr = (pp?.readers ?? []).find(r => r.state && String(r.state.voice) === String(m2.selectedVoiceID ?? ''))
    ?? (pp?.readers ?? []).find(r => r.open);
  out.pluginPlayer = fr ? { open: fr.open, ready: fr.ready, provider: fr.state.provider, locale: fr.state.locale, voice: fr.state.voice, playing: fr.state.playing } : null;
  out.ok = !!out.manager && out.pluginPlayer?.open === true && out.manager.paused === true;
  return JSON.stringify(out);
})();
