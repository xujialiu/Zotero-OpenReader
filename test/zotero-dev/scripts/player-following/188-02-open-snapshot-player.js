// 188-02 — item 1a: the snapshot's row reads kind "snapshot", patched true, following = the Player's A.
// Opens the reader (polled), opens its Player in the selected tab, pauses at once (muted output).
// Needs defaultAutoScroll true for the A row; sets it (original is in the state snapshot).
// diagnostics.autoScroll() rows are zipped with Zotero.Reader._readers by index (no itemID on a row).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();

  Zotero.Prefs.set('zotero-tts.readAloud.defaultAutoScroll', true);

  // Open + poll the reader (rulebook ceiling ~24 s)
  await Zotero.Reader.open(S.fix4Items.snapshot);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === S.fix4Items.snapshot);
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!reader || !reader._internalReader || !reader._internalReader._readAloudManager) {
    out.error = 'reader not ready within 24 s';
    return JSON.stringify(out);
  }
  out.readerReadyInMs = Date.now() - t0;
  S.fix4SnapshotTab = reader.tabID;

  // Select the fixture tab so the player mounts here, open the Player (memory names a listed voice; muted)
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 400));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 600));
  // Pause at once — the popup open with a remembered voice starts playback (muted, but keep still)
  try { reader._internalReader._readAloudManager.pause(); } catch (e) { out.pauseError = String(e); }
  await new Promise((r) => setTimeout(r, 900));

  const rows = JSON.parse(await d.autoScroll());
  const pp = JSON.parse(await d.pluginPlayer());
  const readers = Zotero.Reader._readers ?? [];
  const idx = readers.findIndex((r) => r.itemID === reader.itemID);
  out.row = rows[idx] ?? null;
  out.playerAutomatic = pp.readers?.[idx]?.state?.automatic ?? null;
  out.playerOpen = pp.readers?.[idx]?.open ?? null;
  out.manager = { active: !!reader._internalReader._readAloudManager.active, paused: !!reader._internalReader._readAloudManager.paused };
  out.pass = !!(out.row && out.row.patched === true && out.row.kind === 'snapshot'
    && out.row.following === true && out.playerAutomatic === true && out.playerOpen === true);

  // Audio device probe (baseline §0): a session is open; the output must be running and advancing
  try {
    const eng = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
    let e1 = eng();
    const i1 = (e1.readers ?? []).findIndex((r) => r.itemID === reader.itemID);
    const s1 = e1.readers?.[i1]?.session;
    await new Promise((r) => setTimeout(r, 600));
    const e2 = eng();
    const s2 = e2.readers?.[i1]?.session;
    out.audioProbe = {
      state: e2.readers?.[i1]?.audio?.state ?? null,
      playbackTime: [s1 ? s1.playbackTime : null, s2 ? s2.playbackTime : null],
      advancing: !!(s1 && s2 && typeof s1.playbackTime === 'number' && s2.playbackTime > s1.playbackTime),
    };
  } catch (e) { out.audioProbe = 'error: ' + String(e); }
  return JSON.stringify(out);
})()
