(async () => {
  // Issue #156 item 7, PDF copy: activate the copy's player muted on a free System
  // voice, walk the outline depth first (entry/ref counts), then reposition the
  // session to each located entry's first segment and read the Engine's
  // session.readingSection — the same lookup the estimate uses.
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
  const out = { step: 'part-anchored-pdf-sections' };

  const reader = readerOf(state.fixtures?.pdf?.id);
  if (!reader) throw new Error('PDF copy reader is not open');
  const ir = reader._internalReader;
  const sdt = W(await ir._loadSDT());
  if (!sdt) throw new Error('SDT did not load');
  const outline = W(sdt.structure?.catalog?.outline);
  if (!outline?.length) throw new Error('outline missing');
  const manager = () => W(ir._readAloudManager);

  // Activate muted on the System voice, then pause as soon as segments exist.
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  if (!manager().active) ir.toggleReadAloudPopup(true);
  const voiceNow = () => { const m = manager(); return String(m?.selectedVoiceID ?? m?.voice?.id ?? m?._voice?.id ?? ''); };
  // The manager's voice list and session voice settle asynchronously after activation.
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
  await waitFor(() => { const row = engineRowFor(reader.itemID); return row?.session?.paused === true; }, 5000, 100);
  out.paused = engineRowFor(reader.itemID)?.session?.paused ?? null;
  out.storeRequestsAfterOpen = engineRowFor(reader.itemID)?.session?.store?.requests ?? null;

  // Depth-first outline walk, by index.
  const flat = [];
  const walk = (entries, depth) => {
    const list = arr(entries);
    for (let i = 0; i < list.length; i++) {
      const e = W(list[i]);
      flat.push({ depth, title: typeof e?.title === 'string' ? e.title : null, ref: e?.ref ? arr(W(e.ref)) : null, obj: e });
      if (e?.children?.length) walk(W(e.children), depth + 1);
    }
  };
  walk(outline, 1);
  out.outlineEntries = flat.length;
  const validRef = ref => { if (!ref?.length) return false; for (let i = 0; i < ref.length; i++) if (!Number.isInteger(ref[i]) || ref[i] < 0) return false; return true; };
  const compare = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
  const contains = (ref, point) => { if (point.length < ref.length) return false; for (let i = 0; i < ref.length; i++) if (ref[i] !== point[i]) return false; return true; };
  const startOf = i => (i >= 0 && i < segs.length && segs[i]?.position?.start) ? arr(W(segs[i].position.start)) : null;
  const noRef = [];
  const located = [];
  for (let k = 0; k < flat.length; k++) {
    const e = flat[k];
    if (!validRef(e.ref)) { noRef.push({ k, depth: e.depth, title: e.title }); continue; }
    let low = 0, high = segs.length;
    while (low < high) { const mid = (low + high) >>> 1; if (compare(startOf(mid) || [], e.ref) < 0) low = mid + 1; else high = mid; }
    located.push({ k, depth: e.depth, title: e.title, ref: e.ref, low });
  }
  out.noRefCount = noRef.length;
  out.noRefTitles = noRef.map(e => e.title);
  out.locatedCount = located.length;
  // Segment starts must strictly increase, or the whole lookup is refused by design.
  let increasing = true, previous = null;
  for (let i = 0; i < segs.length; i++) {
    const start = startOf(i);
    if (!start || (previous && compare(previous, start) >= 0)) { increasing = false; out.segmentOrderBreak = i; break; }
    previous = start;
  }
  out.segmentStartsIncreasing = increasing;

  // Shared first-segment indexes would make the deepest entry win the title.
  const starts = {};
  for (const e of located) starts[e.low] = (starts[e.low] || []).concat([e.title]);
  out.sharedStarts = Object.entries(starts).filter(([, titles]) => titles.length > 1).map(([low, titles]) => ({ low: Number(low), titles }));

  // Per located entry: reposition to its first segment, then read readingSection.
  const rows = [];
  for (const e of located) {
    m = manager();
    m.repositionTo(e.low);
    await waitFor(() => { const row = engineRowFor(reader.itemID); return row?.session && row.session.position === e.low ? row : null; }, 4000, 80);
    const row = engineRowFor(reader.itemID);
    if (row?.session && row.session.paused === false) { try { manager().pause(); } catch (_) {} await sleep(120); }
    const rs = row?.session ? (row.session.readingSection ?? null) : 'no-session';
    rows.push({ t: e.title, low: e.low, depth: e.depth, rs: rs && rs !== 'no-session' ? { title: rs.title, start: rs.start } : rs });
  }
  // Segment 0 and the segment just before Lesson 3's first segment (Lesson 2's text).
  const lesson3 = located.find(e => /^Lesson 3(?!\d)/.test(String(e.title || '').replace(/\s+/g, ' ').trim()));
  if (!lesson3) throw new Error('Lesson 3 entry not found');
  const edgeChecks = [];
  for (const index of [0, lesson3.low - 1]) {
    m = manager();
    m.repositionTo(index);
    await waitFor(() => { const row = engineRowFor(reader.itemID); return row?.session && row.session.position === index ? row : null; }, 4000, 80);
    const row = engineRowFor(reader.itemID);
    if (row?.session && row.session.paused === false) { try { manager().pause(); } catch (_) {} await sleep(120); }
    edgeChecks.push({ index, rs: row?.session ? (row.session.readingSection ?? null) : 'no-session' });
  }

  // Classify against the expected output: a section with this title and start for
  // every located entry except the six unanchored ones, which expect null there.
  // The brief names the lessons by their leading title word; outline titles carry authors.
  const unanchored = ['Lesson 1', 'Lesson 7', 'Lesson 12', 'Ii', 'Qq', 'About the Author'];
  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const expectNull = title => unanchored.some(u => norm(title) === u || (u.startsWith('Lesson') && norm(title).startsWith(u + ':')));
  let nonNullOk = 0, nullOk = 0;
  const unexpected = [];
  for (const row of rows) {
    if (expectNull(row.t)) {
      if (row.rs === null) nullOk++;
      else unexpected.push({ t: row.t, low: row.low, rs: row.rs });
    } else if (row.rs && norm(row.rs.title) === norm(row.t) && row.rs.start === row.low) nonNullOk++;
    else unexpected.push({ t: row.t, low: row.low, rs: row.rs });
  }
  out.expected = { nonNull: located.length - unanchored.length, nullAt: unanchored };
  out.observed = { nonNullOk, nullOk, unexpectedCount: unexpected.length, unexpected };
  out.edgeChecks = edgeChecks;
  out.repositionedTo = rows.map(r => r.low);
  out.rows = rows;

  state.pdfSections = {
    segmentCount: segs.length,
    lesson3Index: lesson3.low,
    lesson1Index: (located.find(e => /^Lesson 1(?!\d)/.test(norm(e.title))) || {}).low ?? null,
    rows,
    edgeChecks,
    voiceAtOpen: out.voiceAtOpen,
    fishAtOpen: out.fishAtOpen,
  };
  return JSON.stringify(out, null, 1);
})()
