// Issue #225 prep on the live #224 fixture: commit any standing draft, resume
// playing on a System voice (A), confirm the audio advances, step back one
// sentence so a full sentence lies ahead of the picks, and record the baseline
// (A's id and label, the session speed) in Zotero.ZoteroTTSRun.state.pv225.
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (S.readerIndex === undefined) throw new Error('run the entry-language-picks setup first (state.ep224 missing)');
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const manager = wu(reader._internalReader._readAloudManager);
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const eng = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers[idx];
    const frame = wu(reader._iframeWindow.document.getElementById('ztts-player-frame'));
    const fdoc = wu(wu(frame.contentWindow).document);
    const labelOf = (id) => {
      const all = manager.allVoices ?? [];
      for (let i = 0; i < all.length; i++) if (String(all[i]?.id) === id) return String(all[i].label ?? all[i].id);
      return id;
    };

    // A draft left by an earlier item is committed by the next-voice key
    // (the first of its list, paused) — Play is refused under a draft.
    const draftBefore = vs().handoff?.draft ?? null;
    if (draftBefore) {
      JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, idx));
      for (let t = 0; t < 2000 && vs().handoff?.draft; t += 50) await sleep(50);
      await sleep(600); // the controller rebuild settles before a resume click
    }
    out.checks.draftCommitted = !vs().handoff?.draft;

    // Resume playing on the System voice (activation first: the Zotero 11 gate).
    if (!manager.active || manager.paused) {
      let playing = false;
      for (let attempt = 0; attempt < 3 && !playing; attempt++) {
        try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
        fdoc.querySelector('.play').click();
        for (let t = 0; t < 6000; t += 120) { await sleep(120); if (manager.active && !manager.paused) { playing = true; break; } }
      }
      if (!playing) throw new Error('the reading did not resume');
    }
    await sleep(400);
    const e1 = await eng();
    await sleep(600);
    const e2 = await eng();
    out.checks.audio = { state: e2?.audio?.state ?? null, t1: e1?.session?.playbackTime ?? null, t2: e2?.session?.playbackTime ?? null, advancing: (e2?.session?.playbackTime ?? 0) > (e1?.session?.playbackTime ?? 0) };
    if (!out.checks.audio.advancing) throw new Error('playback is not advancing');

    // One sentence back: the picks below need a full sentence ahead of them.
    manager.skipBack('sentence');
    await sleep(700);
    const A = vs().selected;
    if (!A || A.indexOf('::') < 0) throw new Error('the reading is not on a plugin-provider voice: ' + A);
    const rec = { A: { id: A, label: labelOf(A) }, speed: (await eng())?.session?.speed ?? 1, position: (await eng())?.session?.position ?? null };
    Zotero.ZoteroTTSRun.state.pv225 = rec;
    out.checks.baseline = { ...rec, paused: vs().paused };
    out.status = out.checks.draftCommitted && out.checks.audio.advancing && !!rec.A.id ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
