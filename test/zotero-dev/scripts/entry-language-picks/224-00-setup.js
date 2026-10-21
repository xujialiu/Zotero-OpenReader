// Issue #224 setup: private baseline, mute, fixture-a.pdf in, player open and
// PLAYING on the System English (United States) voice the memory names
// (system::osx/com.apple.voice.compact.en-US.Samantha — free), audio device probe.
// WebDAV folder must already be off (baseline.md); this script only re-checks it.
(async () => {
  const P = Zotero.ZoteroTTSRun.params || {};
  const S = Zotero.ZoteroTTSRun.state;
  S.ep224 = S.ep224 || {};
  const st = S.ep224;
  const out = { status: 'FAIL', steps: {}, errors: [] };
  const wu = (v) => Components.utils.waiveXrays(v);
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, timeout = 24000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = test();
      if (v) return v;
      await sleep(step);
    }
    return test();
  };
  try {
    // ---- private pref snapshot (named prefs only) ----
    const snapPref = (name, get) => {
      const full = prefix + name;
      try { return { value: get(full), hasUserValue: p.prefHasUserValue(full) }; }
      catch (e) { return { absent: true }; }
    };
    st.prefSnapshot = {
      'readAloud.volume': snapPref('readAloud.volume', (f) => p.getIntPref(f)),
      'readAloud.memory': snapPref('readAloud.memory', (f) => p.getStringPref(f)),
      'readAloud.speed': snapPref('readAloud.speed', (f) => { const t = p.getPrefType(f); return t === 0 ? null : t === 32 ? p.getStringPref(f) : p.getIntPref(f); }),
      'readAloud.globalSpeed': snapPref('readAloud.globalSpeed', (f) => p.getBoolPref(f)),
      'readAloud.openExpanded': snapPref('readAloud.openExpanded', (f) => p.getBoolPref(f)),
      'extensions.zotero.reader.readAloudVoices': (() => { const f = 'extensions.zotero.reader.readAloudVoices'; try { return { value: p.getStringPref(f), hasUserValue: p.prefHasUserValue(f) }; } catch (e) { return { absent: true }; } })(),
      documentVoiceChangedPulse: snapPref('documentVoiceChanged', (f) => p.getStringPref(f)),
    };
    st.debugStoringBefore = Zotero.Debug.storing;
    if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

    // WebDAV folder off (rule): only checked here; the baseline did the switching.
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.steps.webdavFolder = pos.folder;
    if (pos.folder !== false) throw new Error('WebDAV folder is on — run the baseline isolation first');

    // Mute before anything can play.
    p.setIntPref(prefix + 'readAloud.volume', 0);

    // Window/tab bookkeeping: the player mounts in the selected tab.
    const main = Zotero.getMainWindow();
    st.host = { windowState: main.windowState, ownerTabID: main.Zotero_Tabs.selectedID, innerWidth: main.innerWidth, innerHeight: main.innerHeight };

    // The memory must name a free System voice before the popup opens (it does:
    // system::osx/com.apple.voice.compact.en-US.Samantha). Assert, never guess.
    const memory = JSON.parse(st.prefSnapshot['readAloud.memory'].value ?? '{}');
    const memVoice = memory?.voice?.id ?? null;
    out.steps.memoryVoice = memVoice;
    if (!memVoice || !String(memVoice).startsWith('system::')) throw new Error('memory does not name a System voice: ' + memVoice);

    // Import fixture-a.pdf as a standalone attachment.
    if (!P.fixtureA) throw new Error('params.fixtureA is missing');
    const imported = await Zotero.Attachments.importFromFile({ file: P.fixtureA, libraryID: Zotero.Libraries.userLibraryID, title: P.fixtureTitle || 'ztts 2026-10-22 A' });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    st.itemID = item.id;
    st.itemKey = item.key;
    st.documentVoiceKeyBefore = 'documentVoices.user/' + item.key;
    st.documentVoiceBefore = (() => { try { return p.getStringPref(prefix + st.documentVoiceKeyBefore) || null; } catch (e) { return null; } })(); // expected null (new item)

    // Open the reader; wait for the manager and segments.
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    const findReader = () => {
      const list = Zotero.Reader._readers ?? [];
      for (let i = 0; i < list.length; i++) if (list[i]?.itemID === item.id) return { reader: list[i], index: i };
      return null;
    };
    const found = await waitFor(() => { const f = findReader(); return f?.reader?._internalReader?._readAloudManager ? f : null; });
    if (!found) throw new Error('reader did not initialize');
    st.readerIndex = found.index;
    const reader = found.reader;
    if (reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    await sleep(400);
    const internal = reader._internalReader;
    const manager = internal._readAloudManager;
    const segs = await waitFor(() => (manager._segments || internal._readAloudSegments?.segments)?.length ? true : null, 24000);
    out.steps.segments = segs ? (manager._segments || internal._readAloudSegments.segments).length : 0;

    // Open the player: starts playback at once on the memory voice; probe the audio.
    internal.toggleReadAloudPopup(true);
    const playing = await waitFor(() => !!manager.active && !manager.paused, 12000, 120);
    // Zotero 11 (Firefox 153) gates the AudioContext behind the reader page's
    // user activation: without it the context stays suspended at 0 and nothing
    // advances. The documented activation (zotero-tester-driving §3) plus a
    // fresh Play through the Player page unblocks it.
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
    if (playing) {
      const fdocSeed = wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentDocument);
      fdocSeed.querySelector('.play').click();
      await waitFor(() => !!manager.paused, 3000, 80);
      fdocSeed.querySelector('.play').click();
      await waitFor(() => !!manager.active && !manager.paused, 3000, 80);
    }
    out.steps.seededPlaying = !!playing;
    out.steps.selectedVoice = manager.selectedVoiceID ?? null;
    // Audio device probe (baseline.md): audio.state + playbackTime twice ~500 ms apart.
    // Revised 2026-10-22 (beta4 run): three overlapping samples — a probe that
    // lands on a clip boundary can hold playbackTime still for one 500 ms pair
    // (measured: 2.9928 twice, state running, next scripts show real audio);
    // any moving pair proves the device.
    const eng = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers[st.readerIndex];
    const samples = [];
    for (let i = 0; i < 4; i++) {
      if (i) await sleep(500);
      const e = await eng();
      samples.push({ t: i * 500, state: e?.audio?.state ?? null, playbackTime: e?.session?.playbackTime ?? null, position: e?.session?.position ?? null });
    }
    let advancing = false;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i].playbackTime ?? 0) > (samples[i - 1].playbackTime ?? 0)) { advancing = true; break; }
    }
    out.steps.audio = {
      state: samples[samples.length - 1].state,
      playbackTime1: samples[0].playbackTime,
      playbackTime2: samples[samples.length - 1].playbackTime,
      samples,
      advancing,
      position: samples[samples.length - 1].position,
    };
    out.steps.playerLayout = p.getStringPref(prefix + 'readAloud.playerLayout') || 'top';
    out.status = out.steps.seededPlaying && out.steps.audio.advancing && out.steps.selectedVoice === memVoice ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
