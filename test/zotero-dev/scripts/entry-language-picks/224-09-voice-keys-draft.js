// Issue #224 case item 5.3: the voice keys under a draft choose the first / the
// last voice of the draft's list, still paused. A draft is made while playing
// (as in item 2.1), then the next-voice key (diagnostics.voiceSwitch(1, index))
// selects the FIRST voice of the draft's list; a fresh draft then takes the
// previous-voice key (voiceSwitch(-1, index)) which selects the LAST.
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
    const idx = S.readerIndex;
    const vsOf = (idx2) => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(idx2, idx)).readers[idx];
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
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
    const listFor = (tier, locale) => {
      const rows = [];
      const all = manager.allVoices ?? [];
      for (let i = 0; i < all.length; i++) {
        const v = all[i];
        if (v?.tier === tier && v.language === locale) rows.push({ id: String(v.id), label: String(v.label ?? v.id) });
      }
      return rows;
    };
    const playAndWait = async () => {
      try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
      fdoc.querySelector('.play').click();
      for (let t = 0; t < 8000; t += 120) { await sleep(120); if (manager.active && !manager.paused) return true; }
      return false;
    };
    const makeDraft = async (localeTag) => {
      const name = localeNameOf(localeTag);
      if (!(await openMenu('locale'))) throw new Error('the language menu did not open');
      if (!clickRow(name)) throw new Error('no "' + name + '" row');
      for (let t = 0; t < 1500; t += 50) {
        await sleep(50);
        const v = vs();
        if (v.handoff?.draft?.locale === localeTag) return v;
      }
      return null;
    };

    // Resume the reading from item 5.2 (paused there) so the draft is made from a playing manager.
    if (!manager.active || manager.paused) {
      if (!(await playAndWait())) throw new Error('the reading did not resume');
      await sleep(600);
    }
    const entryListUs = listFor('system', 'en-US');
    if (!entryListUs.length) throw new Error('no system en-US list');

    // Draft 1 while playing: language English (United States); the next-voice key.
    const d1 = await makeDraft('en-US');
    if (!d1) throw new Error('the en-US draft did not stand');
    const firstExpected = entryListUs[0];
    const stepped = vsOf(1);
    await sleep(400);
    const after1 = vs();
    out.checks.nextKey = { expectedFirst: firstExpected, steppedSelected: stepped.selected, paused: after1.paused, draft: after1.handoff?.draft ?? null, player: after1.player };

    // Draft 2 while playing: language English (United Kingdom); the previous-voice key.
    if (!(await playAndWait())) throw new Error('the reading did not resume for the second draft');
    await sleep(600);
    const entryListGb = listFor('system', 'en-GB');
    if (!entryListGb.length) throw new Error('no system en-GB list');
    const d2 = await makeDraft('en-GB');
    if (!d2) throw new Error('the en-GB draft did not stand');
    const lastExpected = entryListGb[entryListGb.length - 1];
    const stepped2 = vsOf(-1);
    await sleep(400);
    const after2 = vs();
    out.checks.prevKey = { expectedLast: lastExpected, steppedSelected: stepped2.selected, paused: after2.paused, draft: after2.handoff?.draft ?? null, player: after2.player };
    out.status = out.checks.nextKey.steppedSelected === firstExpected.id && out.checks.nextKey.paused === true
      && out.checks.prevKey.steppedSelected === lastExpected.id && out.checks.prevKey.paused === true
      ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
