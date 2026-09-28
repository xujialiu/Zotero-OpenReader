(async () => {
  // Issue #156 item 7, bounded estimate agreement on the PDF copy: play muted on the
  // System voice from Lesson 3's first segment until the estimate is ready (<= 60 s),
  // then check sectionTitle/sectionSeconds against readingSection; then reposition to
  // Lesson 1's first segment and expect no section fields while ready again.
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
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
  const readerOf = id => { const rs = Zotero.Reader?._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === id) return rs[i]; return null; };
  const engineRowFor = id => {
    try {
      const readers = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()).readers || [];
      for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === id) return readers[i];
    } catch (_) {}
    return null;
  };
  const managerOf = reader => W(reader._internalReader._readAloudManager);
  const out = { step: 'part-anchored-pdf-estimate' };

  const pdf = state.pdfSections || {};
  if (!Number.isInteger(pdf.lesson3Index) || !Number.isInteger(pdf.lesson1Index)) throw new Error('section indexes missing; run the PDF sections script first');
  const reader = readerOf(state.fixtures?.pdf?.id);
  if (!reader) throw new Error('PDF copy reader is not open');

  // Reposition to Lesson 3's first segment, paused, then play muted.
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  let m = managerOf(reader);
  m.repositionTo(pdf.lesson3Index);
  const at = async index => waitFor(() => { const row = engineRowFor(reader.itemID); return row?.session && row.session.position === index ? row : null; }, 5000, 80);
  await at(pdf.lesson3Index);
  if (!engineRowFor(reader.itemID)?.session?.paused) { try { m.pause(); } catch (_) {} await sleep(200); }
  const before = engineRowFor(reader.itemID);
  out.atLesson3 = { position: before?.session?.position ?? null, readingSection: before?.session?.readingSection ?? null, remainingAtStart: before?.session?.remainingTime ?? null, volume: before?.volume ?? null, voice: before?.session?.voice ?? null, requestsAtStart: before?.session?.store?.requests ?? null };
  if (before?.session?.readingSection === null || !before?.session?.readingSection) throw new Error('readingSection is null at Lesson 3 before playing');
  if (!/^Lesson 3/.test(String(before.session.readingSection.title || ''))) throw new Error('unexpected readingSection at Lesson 3: ' + JSON.stringify(before.session.readingSection));
  m = managerOf(reader);
  if (m.paused) m.play();

  // Wait for readiness within 60 s of playback; prove the audio advanced.
  const deadline = Date.now() + 60000;
  let readyRow = null, played = false;
  let lastPlayback = before?.session?.playbackTime ?? null;
  while (Date.now() < deadline) {
    await sleep(500);
    const row = engineRowFor(reader.itemID);
    const time = row?.session?.playbackTime ?? null;
    if (time !== null && lastPlayback !== null && time !== lastPlayback) played = true;
    lastPlayback = time;
    if (row?.session?.remainingTime?.status === 'ready') { readyRow = row; break; }
    if (row?.session?.ended) break;
  }
  const ready = readyRow?.session ?? null;
  out.playbackAdvanced = played;
  if (!ready) {
    const after = engineRowFor(reader.itemID);
    try { managerOf(reader).pause(); } catch (_) {}
    out.notReady = {
      elapsedMs: 60000,
      remainingAtTimeout: after?.session?.remainingTime ?? null,
      calibration: after?.session?.remainingCalibration ?? null,
      playbackAdvanced: played,
      store: after?.session?.store ?? null,
    };
    out.verdict = 'NOT TESTABLE';
    return JSON.stringify(out, null, 1);
  }
  out.readyAfterMs = 60000 - (deadline - Date.now());
  const rs = ready.readingSection ?? null;
  const rt = ready.remainingTime ?? null;
  out.ready = {
    status: rt?.status ?? null,
    seconds: rt?.seconds ?? null,
    sectionTitle: rt?.sectionTitle ?? null,
    sectionSeconds: rt?.sectionSeconds ?? null,
    readingSection: rs,
    calibration: ready.remainingCalibration ?? null,
    requests: ready.store?.requests ?? null,
  };
  out.agreement = {
    sectionTitleMatchesReadingSection: rt?.sectionTitle != null && rs != null && rt.sectionTitle === rs.title,
    sectionTitleIsLesson3: /^Lesson 3/.test(String(rt?.sectionTitle ?? '')),
    sectionSecondsLeSeconds: rt?.sectionSeconds != null && rt?.seconds != null && rt.sectionSeconds <= rt.seconds,
  };
  try { managerOf(reader).pause(); } catch (_) {}
  await waitFor(() => engineRowFor(reader.itemID)?.session?.paused === true, 5000, 100);

  // Lesson 1's first segment: readingSection null and no section fields while ready.
  m = managerOf(reader);
  m.repositionTo(pdf.lesson1Index);
  await at(pdf.lesson1Index);
  const deadline2 = Date.now() + 20000;
  let lesson1Row = null;
  while (Date.now() < deadline2) {
    const row = engineRowFor(reader.itemID);
    if (row?.session?.remainingTime?.status === 'ready') { lesson1Row = row; break; }
    await sleep(400);
  }
  const l1 = lesson1Row?.session ?? engineRowFor(reader.itemID)?.session ?? null;
  out.atLesson1 = {
    position: l1?.position ?? null,
    statusAfterReposition: l1?.remainingTime?.status ?? null,
    remainingTime: l1?.remainingTime ?? null,
    readingSection: l1 ? (l1.readingSection ?? null) : 'no-session',
    requests: l1?.store?.requests ?? null,
  };
  out.lesson1Checks = {
    readingSectionNull: l1?.readingSection === null || l1?.readingSection === undefined,
    readyObserved: !!lesson1Row,
    noSectionFieldsWhileReady: lesson1Row ? l1.remainingTime.sectionTitle === undefined && l1.remainingTime.sectionSeconds === undefined : null,
  };
  if (!engineRowFor(reader.itemID)?.session?.paused) { try { managerOf(reader).pause(); } catch (_) {} }
  await sleep(300);
  out.pausedAtEnd = engineRowFor(reader.itemID)?.session?.paused ?? null;
  state.pdfEstimate = out;
  return JSON.stringify(out, null, 1);
})()
