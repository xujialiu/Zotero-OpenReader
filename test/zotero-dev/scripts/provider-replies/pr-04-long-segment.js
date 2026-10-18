// pr-04 — item 3 (#201): a Segment over 4,096 characters. The stub answers every speech request
// with one 2 s MP3 (ffmpeg sine 440 Hz, libmp3lame, 24 kHz mono — an Info frame at its start) and
// logs each request's input length. Reading the long-segment fixture must split it: two requests,
// each at most 4,096 characters; the Segment plays (no `Playback failed`), and the clip's duration
// is about 4 s (two pieces), not 2 s. The stub must be in mp3 mode before this runs.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const P = Zotero.ZoteroTTSRun.params;
  const title = 'ztts 2026-10-18 pr4';
  const logPath = P.stubLog;

  const readLog = async () => {
    try { return (await IOUtils.readUTF8(logPath)).trim().split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; }
  };
  const logBefore = (await readLog()).length;

  const s = new Zotero.Search();
  s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
  s.addCondition('title', 'is', title);
  const old = await s.search();
  if (old.length) await Zotero.Items.erase(old);
  S.prItems = S.prItems || {};
  const item = await Zotero.Attachments.importFromFile({ file: P.fixtureLong, libraryID: Zotero.Libraries.userLibraryID, title });
  S.prItems.long = item.id;

  // Seed the memory with the compatible voice: the memory-sync re-applies the memory voice at
  // every activation, so a tier pick raced it three runs in a row; the memory seed cannot race.
  S.prMemoryWas = Zotero.Prefs.get('zotero-tts.readAloud.memory', true);
  Zotero.Prefs.set('zotero-tts.readAloud.memory', JSON.stringify({ voice: { id: 'compatible::stub-echo', lang: 'en' } }));

  await Zotero.Reader.open(item.id);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!reader) { out.error = 'reader not ready'; return JSON.stringify(out); }
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 800));
  const m = reader._internalReader._readAloudManager;
  // the compatible tier's voice (the stub's single listed voice): pause first so the pick is the
  // native immediate one (the running session's activation kept re-applying the memory voice)
  try { m.pause(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 500));
  const listed = () => {
    const vs2 = m.allVoices;
    const n2 = Number(vs2?.length) || 0;
    for (let i = 0; i < n2; i++) { const v = Components.utils.waiveXrays(vs2[i]); if (typeof v?.id === 'string' && v.id.startsWith('compatible::')) return true; }
    return false;
  };
  const tw0 = Date.now();
  while (!listed() && Date.now() - tw0 < 15000) await new Promise((r) => setTimeout(r, 400));
  for (let attempt = 0; attempt < 3 && m.selectedTier !== 'compatible'; attempt++) {
    try { await m.selectTier('compatible'); } catch (e) { out.tierErr = String(e).slice(0, 120); }
    await new Promise((r) => setTimeout(r, 900));
  }
  out.selectedTier = m.selectedTier ?? null;
  out.selected = { tier: m.selectedTier ?? null, voice: m.selectedVoiceID ?? null };
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }

  // the segment count: one long sentence-less paragraph of ~4,523 characters
  const segs = reader._internalReader._readAloudSegments;
  let segCount = null, segLens = [];
  try {
    const list = segs && segs.segments;
    if (list) {
      segCount = Number(list.length);
      for (let i = 0; i < Math.min(segCount, 4); i++) segLens.push(list[i] && list[i].text ? list[i].text.length : null);
    }
  } catch (e) { out.segErr = String(e); }
  out.segments = { count: segCount, firstLens: segLens };

  // wait for the requests and the playing clip
  const t1 = Date.now();
  let clip = null;
  while (Date.now() - t1 < 20000) {
    await new Promise((r) => setTimeout(r, 500));
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === item.id);
    const se = e.readers?.[i]?.session;
    if (se && se.clipDuration && se.clipDuration > 3) { clip = { duration: se.clipDuration, voice: se.voice, playing: se.playing, pt: se.playbackTime }; break; }
    if (se && se.error) { clip = { error: String(se.error).slice(0, 120) }; break; }
  }
  out.clip = clip;
  await new Promise((r) => setTimeout(r, 1500));
  const el = reader._iframeWindow.document.getElementById('ztts-playback-notice');
  out.playbackNotice = el ? String(el.textContent).slice(0, 100) : null;
  try { m.pause(); } catch (e) {}

  const newReqs = (await readLog()).slice(logBefore).filter((e2) => e2.method === 'POST');
  out.stubRequests = newReqs.map((e2) => ({ input_len: e2.input_len, voice: e2.voice }));
  out.requestCount = newReqs.length;
  out.maxLen = newReqs.reduce((a, b) => Math.max(a, b.input_len || 0), 0);
  out.pass = !!(out.requestCount >= 2 && out.maxLen <= 4096 && clip && clip.duration >= 3.5 && clip.duration <= 4.6 && !out.playbackNotice);
  return JSON.stringify(out);
})()
