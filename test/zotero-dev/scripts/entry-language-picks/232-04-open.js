// 232-04 — open the fixture's reader in the selected tab, then the expected
// item 5.4 step-2 state: the plant confirmed INDEPENDENTLY through
// diagnostics.documentVoices().readers[].saved (issue #180), the manager
// inactive, no controller reading anywhere, and the deterministic old native
// entry (the missing voice, no available System memory).
(async () => {
  const Z = Zotero;
  const out = { steps: [] };
  const state = (Z.ZoteroTTSRun.state.ep232 ||= {});
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); return ok ? undefined : detail; };
  try {
    const fixture = state.fixture;
    if (state.schema !== 2 || !state.snapshotComplete || !fixture?.created) throw new Error('Validated run-created fixture required');
    const win = Z.getMainWindow();

    await Z.Reader.open(fixture.itemID);
    let reader = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = (Z.Reader._readers ?? []).find((r) => r.itemID === fixture.itemID) ?? null;
      if (reader?._internalReader?._readAloudManager) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    state.reader = { itemID: fixture.itemID, tabID: reader?.tabID ?? null, index: (Z.Reader._readers ?? []).indexOf(reader) };
    step('reader-ready', !!(reader?._internalReader?._readAloudManager),
      reader ? 'manager missing after 24 s' : 'reader missing after 24 s');
    if (!reader?._internalReader?._readAloudManager) { out.ok = false; return JSON.stringify(out); }

    // The fixture tab selected so the Player can mount in it
    try { win.Zotero_Tabs.select(reader.tabID); } catch (e) { step('select-tab', false, String(e)); }

    // Independent plant confirmation through the sandbox diagnostic
    const dv = JSON.parse(await Z.ZoteroTTS.diagnostics.documentVoices());
    const entry = (dv.readers ?? []).find((r) => r.key === `user/${fixture.key}`) ?? null;
    state.dvReaderIndex = (dv.readers ?? []).indexOf(entry);
    const saved = entry?.saved ?? null;
    out.plant = {
      found: !!entry,
      savedId: saved ? String(saved.voice?.id ?? '') : null,
      savedLang: saved ? String(saved.voice?.lang ?? '') : null,
      manual: saved ? !!saved.manual : null,
      active: entry ? entry.active : null,
      selected: entry ? entry.selected : null,
      paused: entry ? entry.paused : null,
    };
    step('plant-confirmed', out.plant.savedId === 'ztts-232-missing-voice' && out.plant.manual === true,
      `saved=${out.plant.savedId}`);
    step('manager-inactive', out.plant.active === false, `active=${out.plant.active}`);

    // Account for reading intent directly; a missing `session.playing` field
    // must never be mistaken for proof that every reader is quiet.
    try {
      let speaking = 0;
      const readers = Z.Reader._readers ?? [];
      for (let i = 0; i < readers.length; i++) {
        const manager = readers[i]?._internalReader?._readAloudManager;
        if (manager?.active && !manager.paused) speaking++;
      }
      out.enginePlaying = speaking;
      step('no-controller-reading', speaking === 0, `${speaking} playing`);
    } catch (e) { step('engine', false, String(e)); }

    // Isolation removed only en. Native restore may now have staged the missing
    // fixture voice; no available System memory may coincidentally choose W.
    try {
      const name = 'extensions.zotero.reader.readAloudVoices';
      const raw = Services.prefs.getPrefType(name) === 32 ? Services.prefs.getStringPref(name) : '';
      const map = raw ? JSON.parse(raw) : {};
      const en = map['en'] ?? null;
      out.oldEntry = en ? { voice: String(en.voice ?? '').slice(0, 80), region: en.region ?? null, tier: typeof en.tier === 'string' ? en.tier : null, hasTierVoices: !!en.tierVoices } : null;
      out.nativeLanes = Object.keys(map).length;
      state.oldEntry = out.oldEntry;
      state.nativeLanes = out.nativeLanes;
      const deterministic = (!en || en.voice === 'ztts-232-missing-voice')
        && (!en?.tierVoices?.system || en.tierVoices.system === 'ztts-232-missing-voice');
      step('old-entry-deterministic', deterministic, JSON.stringify(out.oldEntry ?? `no entry (${out.nativeLanes} lanes)`));
    } catch (e) { step('native-entry', false, String(e)); }

    // Owner readers untouched: still inactive as at baseline
    try {
      const now = [];
      const readers = Z.Reader._readers ?? [];
      for (let i = 0; i < readers.length; i++) {
        const r = readers[i];
        const item = r?.itemID ? Z.Items.get(r.itemID) : null;
        const title = String((item?.parentItem ?? item)?.getField('title') ?? '');
        if (r.itemID === state.fixture.itemID) continue;
        let m = null;
        try { m = r?._internalReader?._readAloudManager ?? null; } catch (e) { /* gone */ }
        now.push({ title: title.slice(0, 60), active: !!(m && m.active), selected: m ? String(m.selectedVoiceID ?? '') : null });
      }
      out.ownerReaders = now;
      step('owners-quiet', now.every((r) => !r.active), JSON.stringify(now.find((r) => r.active) ?? ''));
    } catch (e) { step('owners', false, String(e)); }

    out.ok = out.steps.every((s) => s.ok);
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, fatal: String(e), steps: out.steps });
  }
})()
