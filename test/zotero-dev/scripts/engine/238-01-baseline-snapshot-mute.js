// Issue #238 (Play after a pause on Zotero 10.0.7): the baseline of
// baseline.md section 0, run BEFORE the install. It snapshots what the run
// may touch (named prefs by value and user-value state, the document-voice
// branch, the window and the selected tab, every open reader's manager), mutes
// the plugin's volume, turns the debug store on and confirms the WebDAV
// folder is off. Nothing here plays, picks, pauses or scrolls: the owner's tab
// is only read. Prefs are read by name; none on the list is a secret, and
// the voice ids are shortened in the answer (the full values stay in state and
// in .tmp/zotero-dev/<runId>/baseline-private.json, which is gitignored).
// A second run of this script keeps the FIRST snapshot (the volume is already
// 0 then; the temporary zero must never replace the original).
// params: none. state: writes baseline238, owner238, window238, runStartMs,
// debugWasStoring, docVoices238, baseline (the shape 133-31 reads),
// readAloudMemoryFullValue, posBeforeRows.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const wu = Components.utils.waiveXrays;
  const ZT = 'extensions.zotero.zotero-tts.';
  // A Fish voice id carries a 32-hex model id: shown as head…tail only
  const short = (v) => String(v ?? '').replace(/[0-9a-f]{32}/gi, (h) => h.slice(0, 4) + '…' + h.slice(-4));
  const out = { step: '238-01-baseline', at: new Date().toISOString() };

  const snapPref = (full) => {
    const type = Services.prefs.getPrefType(full);
    const user = Services.prefs.prefHasUserValue(full);
    let value = null;
    if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(full);
    else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(full);
    else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(full);
    return { full, type, user, value };
  };

  const firstRun = !S.baseline238;
  if (firstRun) {
    S.runStartMs = Date.now();
    out.zotero = Zotero.version;
    try { const s = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); out.pluginBefore = { version: s.version, failed: s.failed }; } catch (e) { out.pluginBeforeErr = String(e); }

    // The prefs this run can touch, by name. local.baseURL / local.enabled are the
    // owner's Local provider (item 13 points them at a fake server and puts them back).
    const names = {
      volume: ZT + 'readAloud.volume',
      webdav: ZT + 'webdav.enabled',
      memory: ZT + 'readAloud.memory',
      defaultVoice: ZT + 'readAloud.defaultVoice',
      docVoicePulse: ZT + 'documentVoiceChanged',
      localEnabled: ZT + 'local.enabled',
      localBaseURL: ZT + 'local.baseURL',
      nativeVoices: 'extensions.zotero.reader.readAloudVoices',
    };
    const base = {};
    for (const [k, full] of Object.entries(names)) base[k] = snapPref(full);
    S.baseline238 = base;
    // The shape 133-31 restores (zotero-tts.* names relative to the branch), memory in full
    S.baseline = {};
    for (const [k, full] of Object.entries(names)) if (full.startsWith(ZT)) S.baseline[full.slice(ZT.length)] = { value: base[k].value, hasUser: base[k].user };
    S.baseline['readAloud.memory'] = { len: String(base.memory.value ?? '').length, hasUser: base.memory.user };
    S.readAloudMemoryFullValue = base.memory.value;

    // The document-voice branch (one pref per document the owner has read): the set must come back as it was
    const dvNames = Services.prefs.getChildList(ZT + 'documentVoices.');
    S.docVoices238 = {};
    for (const n of dvNames) S.docVoices238[n] = Services.prefs.getStringPref(n);

    // The window and the selected tab, before anything changes them
    const win = Zotero.getMainWindow();
    S.window238 = { windowState: win.windowState, screenX: win.screenX, screenY: win.screenY, outerWidth: win.outerWidth, outerHeight: win.outerHeight, selectedTab: win.Zotero_Tabs.selectedID, hidden: win.document.hidden };

    // Every open reader's manager (the owner's tab is read, never driven)
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    S.owner238 = [];
    for (const r of Zotero.Reader._readers || []) {
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      const it = Zotero.Items.get(r.itemID);
      const entry = { tabID: r.tabID, itemID: r.itemID, title: String((it.parentItem || it).getField('title')).slice(0, 80) };
      if (m) {
        entry.active = m.active; entry.paused = m.paused; entry.voice = String(m.selectedVoiceID || ''); entry.tier = m.selectedTier;
        entry.popupOpen = !!(ir._state && ir._state.readAloudState && ir._state.readAloudState.popupOpen);
        entry.error = m.error || null;
        const e = eng.readers.find((x) => x.itemID === r.itemID);
        if (e) entry.engine = { controller: e.controller, session: e.session && { voice: e.session.voice, position: e.session.position, currentIndex: e.session.currentIndex, paused: e.session.paused, playing: e.session.playing, playbackTime: e.session.playbackTime }, stats: e.stats, audio: e.audio && { state: e.audio.state } };
      }
      S.owner238.push(entry);
    }

    S.debugWasStoring = Zotero.Debug.storing;
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
    S.debugMark = (await Zotero.Debug.get()).length;

    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    S.posBeforeRows = pos && pos.database ? pos.database.rows : null;
    out.posBefore = { rows: S.posBeforeRows, legacyPref: pos.legacyPref };

    // The private copy (gitignored), in case the Zotero process dies mid-run
    try {
      const priv = { runId: P.runId, at: out.at, baseline238: S.baseline238, docVoices238: S.docVoices238, window238: S.window238, owner238: S.owner238, debugWasStoring: S.debugWasStoring };
      const path = PathUtils.join(P.tmpDir, P.runId, 'baseline-private.json');
      await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true, ignoreExisting: true });
      await IOUtils.writeUTF8(path, JSON.stringify(priv, null, 1));
      out.privateCopy = true;
    } catch (e) { out.privateCopy = String(e); }
  } else {
    out.note = 'baseline238 already in state; the first snapshot is kept, nothing re-read';
  }

  // Mute (workflow default). The first snapshot above holds the original level and its user-value state.
  Zotero.Prefs.set('zotero-tts.readAloud.volume', 0);
  const b = S.baseline238;
  out.volume = { original: b.volume.value, originalHasUser: b.volume.user, now: Zotero.Prefs.get('zotero-tts.readAloud.volume') };
  out.webdav = { enabled: b.webdav.value, hasUser: b.webdav.user, nowEnabled: Zotero.Prefs.get('zotero-tts.webdav.enabled') };
  try { out.webdav.positionSyncFolder = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder; } catch (e) { out.webdav.positionSyncErr = String(e); }
  const memId = (() => { try { return JSON.parse(b.memory.value).voice.id; } catch (e) { return null; } })();
  const defId = (() => { try { return JSON.parse(b.defaultVoice.value).id || JSON.parse(b.defaultVoice.value).voice.id; } catch (e) { return null; } })();
  out.memory = { len: String(b.memory.value ?? '').length, hasUser: b.memory.user, voiceId: memId, isPluginVoice: typeof memId === 'string' && memId.includes('::') };
  out.defaultVoice = { len: String(b.defaultVoice.value ?? '').length, hasUser: b.defaultVoice.user, voiceId: defId, isPluginVoice: typeof defId === 'string' && defId.includes('::') };
  out.local = { enabled: b.localEnabled.value, enabledHasUser: b.localEnabled.user, baseURLHasUser: b.localBaseURL.user, baseURLHost: (() => { try { return new URL(b.localBaseURL.value).host; } catch (e) { return null; } })() };
  out.docVoiceKeys = Object.keys(S.docVoices238).length;
  out.window = S.window238;
  out.prefWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  out.debugStoringNow = Zotero.Debug.storing;
  out.debugWasStoring = S.debugWasStoring;
  out.runStartMs = S.runStartMs;
  out.owner = S.owner238.map((o) => ({ tabID: o.tabID, title: o.title, active: o.active, paused: o.paused, voice: short(o.voice), tier: o.tier, popupOpen: o.popupOpen, error: o.error, engine: o.engine && { controller: o.engine.controller, position: o.engine.session && o.engine.session.position, currentIndex: o.engine.session && o.engine.session.currentIndex, paused: o.engine.session && o.engine.session.paused, playing: o.engine.session && o.engine.session.playing, adopted: o.engine.stats && o.engine.stats.adopted, audio: o.engine.audio } }));
  return JSON.stringify(out, null, 1);
})();
