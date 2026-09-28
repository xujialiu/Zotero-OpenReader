(async () => {
  // Issue #156 item 7, EPUB copy: all outline entries carry refs, so Lesson 1,
  // Lesson 2, Ii and Jj each have their own readingSection at their first segment.
  // Also records the owner PDF tab's player state after all copy driving.
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const params = run.params || {};
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const systemVoice = params.voice || 'system::osx/com.apple.voice.enhanced.en-US.Ava';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 120) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const W = x => { try { return Components.utils.waiveXrays(x); } catch (_) { return x; } };
  const arr = a => { const out = []; if (!a) return out; const n = Number(a.length) || 0; for (let i = 0; i < n; i++) out.push(a[i]); return out; };
  const readerOf = id => { const rs = Zotero.Reader?._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === id) return rs[i]; return null; };
  const engineRowFor = id => {
    try {
      const readers = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers || [];
      for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === id) return readers[i];
    } catch (_) {}
    return null;
  };
  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const out = { step: 'part-anchored-epub-sections' };

  const reader = readerOf(state.fixtures?.epub?.id);
  if (!reader) throw new Error('EPUB copy reader is not open');
  const ir = reader._internalReader;
  const sdt = W(await ir._loadSDT());
  if (!sdt) throw new Error('SDT did not load');
  const outline = W(sdt.structure?.catalog?.outline);
  if (!outline?.length) throw new Error('outline missing');
  const manager = () => W(ir._readAloudManager);

  // Activate muted on the System voice, then pause once segments exist.
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  if (!manager().active) ir.toggleReadAloudPopup(true);
  const voiceNow = () => { const m = manager(); return String(m?.selectedVoiceID ?? m?.voice?.id ?? m?._voice?.id ?? ''); };
  await waitFor(() => voiceNow() !== '' || Number(manager()?.allVoices?.length) > 0, 8000, 120);
  out.voiceAtOpen = voiceNow();
  out.fishAtOpen = /^fish/i.test(out.voiceAtOpen);
  if (out.voiceAtOpen !== systemVoice) {
    const findVoice = () => {
      const m0 = manager();
      const voices = m0.allVoices || [];
      for (let i = 0; i < Number(voices.length || 0); i++) { const v = W(voices[i]); if (String(v?.id) === systemVoice) return v; }
      return null;
    };
    const target = await waitFor(findVoice, 15000, 200);
    if (!target) throw new Error('System voice not offered: ' + systemVoice);
    await manager().selectTier(String(target.tier));
    await manager().selectVoice(systemVoice);
    out.voiceSwitchedTo = systemVoice;
  }
  const segments = await waitFor(() => { const m = manager(); return m?.segments?.length ? W(m.segments) : null; }, 30000, 200);
  if (!segments) throw new Error('manager.segments did not arrive');
  const segs = arr(segments).map(W);
  out.segmentCount = segs.length;
  let m = manager();
  if (m.active && !m.paused) m.pause();
  await waitFor(() => engineRowFor(reader.itemID)?.session?.paused === true, 5000, 100);
  out.paused = engineRowFor(reader.itemID)?.session?.paused ?? null;

  const flat = [];
  const walk = (entries, depth) => {
    const list = arr(entries);
    for (let i = 0; i < list.length; i++) {
      const e = W(list[i]);
      flat.push({ depth, title: typeof e?.title === 'string' ? e.title : null, ref: e?.ref ? arr(W(e.ref)) : null });
      if (e?.children?.length) walk(W(e.children), depth + 1);
    }
  };
  walk(outline, 1);
  out.outlineEntries = flat.length;
  const validRef = ref => { if (!ref?.length) return false; for (let i = 0; i < ref.length; i++) if (!Number.isInteger(ref[i]) || ref[i] < 0) return false; return true; };
  const compare = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
  const startOf = i => (i >= 0 && i < segs.length && segs[i]?.position?.start) ? arr(W(segs[i].position.start)) : null;
  out.noRefEntries = flat.filter(e => !validRef(e.ref)).map(e => e.title);

  const findEntry = pattern => {
    for (let k = 0; k < flat.length; k++) {
      const e = flat[k];
      if (!validRef(e.ref)) continue;
      if (typeof pattern === 'string' ? norm(e.title) === pattern : pattern.test(norm(e.title))) return e;
    }
    return null;
  };
  const targets = [
    ['Lesson 1', /^Lesson 1(?!\d)/],
    ['Lesson 2', /^Lesson 2(?!\d)/],
    ['Ii', 'Ii'],
    ['Jj', 'Jj'],
  ];
  const rows = [];
  for (const [label, pattern] of targets) {
    const entry = findEntry(pattern);
    if (!entry) { rows.push({ label, found: false }); continue; }
    let low = 0, high = segs.length;
    while (low < high) { const mid = (low + high) >>> 1; if (compare(startOf(mid) || [], entry.ref) < 0) low = mid + 1; else high = mid; }
    m = manager();
    m.repositionTo(low);
    await waitFor(() => { const row = engineRowFor(reader.itemID); return row?.session && row.session.position === low ? row : null; }, 4000, 80);
    const row = engineRowFor(reader.itemID);
    if (row?.session && row.session.paused === false) { try { manager().pause(); } catch (_) {} await sleep(120); }
    const rs = row?.session ? (row.session.readingSection ?? null) : 'no-session';
    rows.push({
      label,
      title: entry.title,
      low,
      rs: rs && rs !== 'no-session' ? { title: rs.title, start: rs.start, end: rs.end } : rs,
      ownTitle: !!(rs && rs !== 'no-session' && norm(rs.title) === norm(entry.title) && rs.start === low),
    });
  }
  out.rows = rows;
  out.allOwnTitles = rows.every(r => r.found === false ? false : r.ownTitle === true);

  // The owner PDF tab, after all copy driving, must match the setup snapshot.
  const owner = readerOf(state.sources?.pdf);
  if (owner) {
    const manager2 = owner._internalReader?._readAloudManager;
    out.ownerAfter = {
      open: true,
      active: !!manager2?.active,
      paused: manager2 ? !!manager2.paused : null,
      popupOpen: !!owner._internalReader?._state?.readAloudState?.popupOpen,
    };
  } else out.ownerAfter = { open: false };
  out.ownerUnchanged = JSON.stringify(out.ownerAfter) === JSON.stringify(state.ownerBefore || {});
  state.epubSections = { segmentCount: segs.length, rows };
  return JSON.stringify(out, null, 1);
})()
