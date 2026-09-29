// Item 3: low. Keeps the selected voice's provider figure
// (premiumCreditsRemaining on voicesForLanguage[i].provider), sets it to 25,
// and within ~1 s (the player's 250 ms snapshot) 'Premium Voice 1' reads 3m
// (2.5 rounded up) with .low and the computed red rgb(216, 68, 68) on the
// voice button's .time-left, while a 30-credit voice reads 1m, low too.
// Assigns the kept figure back: the times and the gray color return. The
// gray color compared is the one item 1 measured. params: none. state: reads
// itemID/pickedVoice/item1; writes item3 (keptProvider restore included).
(async () => {
  const out = { step: 'low-time' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.item1) throw new Error('run state missing -- t0/01 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtMinutes = S.fmtMinutes;
  try {
    const diagnostics = Zotero.ZoteroTTS.diagnostics;
    const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
    const reader = readerOf(S.itemID);
    if (!reader) throw new Error('fixture reader gone');
    const doc = reader._iframeWindow.document;
    const frame = doc.getElementById('ztts-player-frame');
    if (!frame || frame.hidden) throw new Error('the player frame is hidden');
    const fdoc = frame.contentDocument;
    const m = reader._internalReader._readAloudManager;

    // --- Find the selected voice's provider; keep the figure. ---
    const list = m.voicesForLanguage;
    let provider = null, price = null;
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const v = list[i];
      const w = Components.utils.waiveXrays(v);
      if (String(w.id) === S.item1.voice) {
        provider = Components.utils.waiveXrays(w.provider);
        price = typeof w.creditsPerMinute === 'number' ? w.creditsPerMinute : null;
        break;
      }
    }
    if (!provider) throw new Error('the selected voice provider was not found');
    const keptPremium = typeof provider.premiumCreditsRemaining === 'number' ? provider.premiumCreditsRemaining : null;
    if (keptPremium === null) throw new Error('premiumCreditsRemaining is not a number on the provider');
    out.kept = { premiumCreditsRemaining: keptPremium, creditsPerMinute: price };
    S.item3 = { keptPremium, price };

    // --- The frame reads used by both halves. ---
    const reads = () => {
      const btn = fdoc.querySelector('[data-pick="voice"]');
      const time = btn ? btn.querySelector('.time-left') : null;
      return { timeText: time ? time.textContent : null, low: time ? time.classList.contains('low') : null, color: time ? fdoc.defaultView.getComputedStyle(time).color : null };
    };
    const snapTimes = async () => {
      const diag = JSON.parse(await diagnostics.pluginPlayer());
      const rows = diag.readers || [];
      const openRows = rows.filter((r) => r && r.open);
      const entry = openRows.find((r) => r.state && r.state.voice === S.item1.voice) || openRows[0] || null;
      if (!entry) return null;
      const voices = entry.state.voices || [];
      const one = voices.find((v) => v.label === 'Premium Voice 1') || null;
      const five = voices.find((v) => v.label === 'Premium Voice 5') || null;
      return { pv1: one ? { time: one.time ?? null, low: one.low ?? null } : null, pv5: five ? { time: five.time ?? null, low: five.low ?? null } : null, alert: entry.state.alert ?? null };
    };

    // --- Set 25 and watch the 250 ms snapshot repaint. ---
    provider.premiumCreditsRemaining = 25;
    let lowState = null, lowAtMs = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      const s = await snapTimes();
      const f = reads();
      if (s && s.pv1 && s.pv1.time === fmtMinutes(25 / 10) && s.pv1.low === true && f.timeText === fmtMinutes(25 / 10) && f.low === true) {
        lowAtMs = Date.now() - t0; lowState = { snapshot: s, frame: f }; break;
      }
      await sleep(100);
    }
    out.lowSettledAtMs = lowAtMs;
    out.lowState = lowState;
    out.lowExpected = {
      pv1: { time: fmtMinutes(2.5), low: true },
      pv5: { time: fmtMinutes(25 / 30), low: true },
      redComputed: 'rgb(216, 68, 68)',
    };
    out.lowChecks = lowState ? {
      pv1TimeIs3m: lowState.snapshot.pv1.time === fmtMinutes(2.5),
      pv1Low: lowState.snapshot.pv1.low === true,
      pv5Time: lowState.snapshot.pv5.time,
      pv5Expected: fmtMinutes(25 / 30),
      pv5Low: lowState.snapshot.pv5 ? lowState.snapshot.pv5.low === true : null,
      frameText: lowState.frame.timeText,
      frameColor: lowState.frame.color,
      frameColorIsRed: lowState.frame.color === 'rgb(216, 68, 68)',
    } : null;

    // --- Assign the kept figure back: times and gray return. ---
    provider.premiumCreditsRemaining = keptPremium;
    let backState = null, backAtMs = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 2000) {
      const s = await snapTimes();
      const f = reads();
      if (s && s.pv1 && s.pv1.time === S.item1.time && s.pv1.low === false && f.timeText === S.item1.time && f.low === false) {
        backAtMs = Date.now() - t1; backState = { snapshot: s, frame: f }; break;
      }
      await sleep(100);
    }
    out.backSettledAtMs = backAtMs;
    out.backState = backState;
    out.backChecks = backState ? {
      pv1TimeBack: backState.snapshot.pv1.time === S.item1.time,
      pv1NotLow: backState.snapshot.pv1.low === false,
      pv5Time: backState.snapshot.pv5 ? backState.snapshot.pv5.time : null,
      pv5Expected: fmtMinutes(S.item3.keptPremium / 30),
      pv5NotLow: backState.snapshot.pv5 ? backState.snapshot.pv5.low === false : null,
      frameColor: backState.frame.color,
      frameColorIsGrayAgain: backState.frame.color === S.item1.grayColor,
    } : null;
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
