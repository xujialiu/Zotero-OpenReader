// Issue #224 case item 5.1 + 5.2: choosing a voice of the draft. The draft's
// language is set first (the draft from item 4 has none), then a voice W of the
// draft is picked through the Player page: selected W, paused, draft null,
// player.voice W, chooseVoice false; the document voice record names W with
// manual true; the engine asks for nothing until Play; Play reads the paused
// sentence from offset 0 in W.
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (S.readerIndex === undefined) throw new Error('run 224-00 first');
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const manager = wu(reader._internalReader._readAloudManager);
    const p = Services.prefs;
    const prefix = 'extensions.zotero.zotero-tts.';
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const eng = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers[idx];
    const doc = wu(reader._iframeWindow.document);
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const pop = () => fdoc.querySelector('.popover');
    const openMenu = async (key) => {
      const btn = fdoc.querySelector(`[data-pick="${key}"]`);
      if (!btn) throw new Error('no ' + key + ' button');
      btn.click();
      let q = null;
      for (let t = 0; t < 1500 && !q; t += 40) { await sleep(40); q = fdoc.querySelector('.popover'); }
      return q;
    };
    const clickRow = (title) => {
      const rows = fdoc.querySelectorAll('.popover .option');
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].getAttribute('title') ?? '') === title) { rows[i].click(); return true; }
      }
      return false;
    };
    const localeNameOf = (tag) => new Intl.DisplayNames([Zotero.locale], { type: 'language', languageDisplay: 'standard' }).of(tag);
    const before = vs();
    out.checks.before = { draft: before.handoff?.draft ?? null, selected: before.selected, paused: before.paused };
    if (!before.handoff?.draft) throw new Error('no draft standing');

    // Give the draft a language: pick English (United Kingdom) in the language menu.
    const gbName = localeNameOf('en-GB');
    if (!(await openMenu('locale'))) throw new Error('the language menu did not open');
    if (!clickRow(gbName)) throw new Error('no "' + gbName + '" row');
    await sleep(700);
    const d1 = vs();
    if (d1.handoff?.draft?.locale !== 'en-GB') throw new Error('draft did not move to en-GB');
    // The followUp auto-opens the voice list right after a language pick that
    // changed it; when it is already open, use it — a click on the voice button
    // would toggle that very menu closed (revised 2026-10-22 continuation run).
    let voiceMenu = null;
    for (let t = 0; t < 2500 && !voiceMenu; t += 60) { await sleep(60); voiceMenu = pop(); }
    if (!voiceMenu) voiceMenu = await openMenu('voice');
    if (!voiceMenu) throw new Error('the voice menu did not open');
    // Pick W = Daniel (a System en-GB voice) through the open menu.
    const rows = [...fdoc.querySelectorAll('.popover .option')];
    const titles = rows.map((r) => r.getAttribute('title'));
    out.checks.voiceMenuTitles = titles;
    const wTitle = titles.find((t) => t.startsWith('Daniel')); // the row title is the voice's label, "Daniel (English (UK))"
    if (!wTitle) throw new Error('no Daniel row in the draft voice list');
    if (!clickRow(wTitle)) throw new Error('clicking the Daniel row failed');
    let picked = null;
    for (let t = 0; t < 2000; t += 40) {
      await sleep(40);
      const v = vs();
      if (!v.handoff?.draft && v.player?.voice && v.player?.voice !== '') { picked = { atMs: t, selected: v.selected, paused: v.paused, player: v.player, draft: v.handoff?.draft ?? null }; break; }
    }
    out.checks.voicePicked = picked;
    if (!picked) throw new Error('the draft voice pick did not land');
    const dv = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const key = 'documentVoices.user/' + S.itemKey;
    out.checks.record = dv.records[key] ?? null;
    const rec = out.checks.record ? JSON.parse(out.checks.record) : null;
    // No request for W until Play.
    const e1 = await eng();
    await sleep(1200);
    const e2 = await eng();
    out.checks.beforePlay = {
      voice1: e1?.session?.voice ?? null, voice2: e2?.session?.voice ?? null,
      requests1: e1?.session?.store?.requests ?? null, requests2: e2?.session?.store?.requests ?? null,
      paused: e2?.session?.paused ?? null, position: e2?.session?.position ?? null, bound: e2?.controller?.ours ?? null,
    };
    const noRequestYet = e1?.session?.store?.requests === e2?.session?.store?.requests;

    // 5.2: Play reads the paused sentence from offset 0 in W.
    const positionP = e2?.session?.position ?? null;
    try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
    fdoc.querySelector('.play').click();
    let playing = null;
    for (let t = 0; t < 8000; t += 60) {
      await sleep(60);
      const v = vs();
      if (v.paused === false) { playing = { atMs: t, selected: v.selected }; break; }
    }
    out.checks.playing = playing;
    let firstClip = null;
    for (let t = 0; t < 4000; t += 80) {
      await sleep(80);
      const e = await eng();
      const pt = e?.session?.playbackTime ?? null;
      if (e?.session?.playing && pt !== null && pt < 1.0) { firstClip = { atMs: t, voice: e.session.voice, position: e.session.position, playbackTime: pt, requests: e.session.store?.requests ?? null }; break; }
    }
    out.checks.firstClip = firstClip;
    await sleep(1800);
    const e3 = await eng();
    out.checks.afterPlay = { voice: e3?.session?.voice ?? null, position: e3?.session?.position ?? null, playbackTime: e3?.session?.playbackTime ?? null, playing: e3?.session?.playing ?? null, requests: e3?.session?.store?.requests ?? null };
    // Keep the run bounded: pause through the Player.
    fdoc.querySelector('.play').click();
    for (let t = 0; t < 4000; t += 100) { await sleep(100); if (manager.paused) break; }
    out.checks.pausedAtEnd = manager.paused;
    const wId = picked.selected;
    out.status = picked.selected && picked.paused === true && picked.draft === null
      && picked.player?.chooseVoice === false && rec?.voice?.id === wId && rec?.manual === true
      && noRequestYet && firstClip && firstClip.voice === wId && firstClip.position === positionP
      && (out.checks.afterPlay.requests ?? 0) > (out.checks.beforePlay.requests2 ?? 0)
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
