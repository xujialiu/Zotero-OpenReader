// Baseline (issue #209): a verbatim snapshot, with each pref's user-value flag,
// of every pref this case may touch, so cleanup puts them back byte for byte;
// the owner's reader and saved position; window, tab and debug-store state;
// position rows. Then mute through the plugin volume (the original value and
// flag stay in the snapshot) and turn the debug store on for the run.
// No credential is read: provider keys are never in the list. The first
// snapshot is never replaced on a resumed run.
// params: ownerItemID (optional). state: writes baseline.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'baseline' };
  const P = 'extensions.zotero.zotero-tts.';
  if (state.baseline) { out.alreadyCaptured = true; return JSON.stringify(out); }

  const typeName = (t) => ({ 0: 'none', 32: 'str', 64: 'int', 128: 'bool' })[t];
  const readPref = (full) => {
    const t = Services.prefs.getPrefType(full);
    if (t === 0) return { type: 'none', value: null, user: false };
    const value = t === 32 ? Services.prefs.getStringPref(full) : t === 64 ? Services.prefs.getIntPref(full) : Services.prefs.getBoolPref(full);
    return { type: typeName(t), value, user: Services.prefs.prefHasUserValue(full) };
  };
  const names = [
    ...['readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed', 'readAloud.speedPercent',
      'readAloud.favoritesOnly', 'readAloud.favoriteVoices', 'readAloud.playerLayout', 'readAloud.autoScrollMode', 'readAloud.defaultAutoScroll',
      'highlight.sentence', 'highlight.word', 'highlight.wordColor', 'highlight.wordAlpha', 'highlight.sentenceColor', 'highlight.sentenceAlpha',
      'webdav.enabled', 'webdav.syncPositions', 'webdav.syncSettings', 'webdav.autoUploadSettings',
      'azure.enabled', 'local.enabled', 'fish.enabled', 'speechify.enabled', 'system.enabled', 'fishspeech.enabled', 'mimo.enabled',
      'compatible.enabled', 'openai-official.enabled', 'cloudflare.enabled', 'zotero-standard.enabled', 'zotero-premium.enabled'].map((n) => P + n),
    'extensions.zotero.reader.readAloudVoices', 'extensions.zotero.reader.readAloud.highlightGranularity',
  ];
  const prefs = {};
  for (const full of names) prefs[full] = readPref(full);

  // documentVoices.*: the whole branch with values (voice ids and flags, no secrets), to put back verbatim.
  const dvPrefix = P + 'documentVoices.';
  const documentVoices = {};
  for (const n of Services.prefs.getChildList(dvPrefix)) if (n !== dvPrefix) documentVoices[n] = readPref(n);

  state.baseline = { prefs, documentVoices };

  // What the output shows of each pref: bool/int values, string lengths (never a long value).
  out.prefs = Object.fromEntries(Object.entries(prefs).map(([full, s]) => [
    full.replace('extensions.zotero.zotero-tts.', 'tts:').replace('extensions.zotero.', 'z:'),
    s.type === 'none' ? 'unset' : (s.type === 'str' ? `str(${String(s.value).length})` : String(s.value)) + (s.user ? ' *user' : ''),
  ]));
  const idOf = (raw) => { try { const j = JSON.parse(raw); return j?.voice?.id ?? j?.id ?? null; } catch (e) { return null; } };
  out.memoryVoiceId = idOf(prefs[P + 'readAloud.memory'].value);
  out.defaultVoice = (() => { try { return JSON.parse(prefs[P + 'readAloud.defaultVoice'].value || 'null'); } catch (e) { return 'unparsable'; } })();
  out.readAloudVoicesLangs = (() => { try { return Object.keys(JSON.parse(prefs['extensions.zotero.reader.readAloudVoices'].value || '{}')); } catch (e) { return 'unparsable'; } })();
  out.documentVoiceKeys = Object.keys(documentVoices).map((n) => n.slice(dvPrefix.length));

  // Debug store: on for the run (so [zotero-tts] lines can be read), restored at the end.
  state.baseline.debugStoring = !!Zotero.Debug?.storing;
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  out.debugStoring = { was: state.baseline.debugStoring, now: !!Zotero.Debug.storing };

  // Window, tabs and settings window.
  const win = Zotero.getMainWindow();
  state.baseline.window = {
    outerWidth: win.outerWidth, outerHeight: win.outerHeight, screenX: win.screenX, screenY: win.screenY,
    windowState: win.windowState, selectedTab: win.Zotero_Tabs?.selectedID ?? null,
  };
  state.baseline.settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  out.window = state.baseline.window;
  out.settingsWindowOpen = state.baseline.settingsWindowOpen;
  out.tabs = (win.Zotero_Tabs?._tabs ?? []).map((t) => ({ id: t.id, type: t.type, title: String(t.title ?? '').slice(0, 50) }));
  out.zoteroVersion = Zotero.version;

  // Readers: the owner's tabs are left alone; the owner's own is recorded for the saved-position proof.
  const titleOf = (id) => { const it = id ? Zotero.Items.get(id) : null; return (it?.parentItem ?? it)?.getField?.('title') ?? null; };
  out.readers = (Zotero.Reader?._readers || []).map((r) => {
    let m = null; try { m = r._internalReader?._readAloudManager; } catch (e) { /* none */ }
    return { itemID: r.itemID ?? null, tabID: r.tabID ?? null, title: String(titleOf(r.itemID) ?? '').slice(0, 60), active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID ?? null };
  });
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { position = { error: String(e) }; }
  state.baseline.positionRows = position?.database?.rows ?? null;
  state.baseline.legacyPref = position?.legacyPref ?? null;
  out.position = { rows: state.baseline.positionRows, legacyPref: state.baseline.legacyPref };
  if (p.ownerItemID) {
    const row = (position?.readers || []).find((r) => r.itemID === p.ownerItemID) ?? null;
    state.baseline.owner = { itemID: p.ownerItemID, key: Zotero.Items.get(p.ownerItemID)?.key ?? null, position: row };
    out.owner = { key: state.baseline.owner.key, row, documentVoice: Object.entries(documentVoices).filter(([n]) => n.endsWith('/' + state.baseline.owner.key)).map(([n, s]) => [n.slice(dvPrefix.length), s.value]) };
  }

  // Mute: the plugin's volume, never the system master volume.
  const vol = P + 'readAloud.volume';
  Services.prefs.setIntPref(vol, 0);
  out.muted = { value: Services.prefs.getIntPref(vol, -1), user: Services.prefs.prefHasUserValue(vol), was: prefs[vol] };

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.installedStartup = { version: startup.version, steps: (startup.steps || []).length, failed: startup.failed };
  return JSON.stringify(out, null, 1);
})()
