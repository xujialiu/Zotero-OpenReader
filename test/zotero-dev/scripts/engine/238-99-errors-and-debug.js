// Issue #238, the end-of-run error read, then the debug store back to how the run
// found it. Read it BEFORE it is restored: the store is the complete record of
// the run's `[zotero-tts]` lines (the console is a ring of ~250 messages, so its
// coverage since the run began is reported, not assumed).
//   1. The detection is proved first: a marker line shaped like beta6's TypeError
//      is logged, and the scan must find exactly that one (a scan that cannot see
//      it proves nothing about "no clearFailures is not a function").
//   2. Services.console since runStartMs: every message naming clearFailures (the
//      marker excepted -- expected none), and the script errors grouped by their
//      text with counts and the first/last time (seconds from the run's start).
//   3. The debug store since the run began: lines of ours (`[zotero-tts]`) that
//      mention an error or a failure, grouped (digits folded), the count of
//      "can't access dead object", and the known noise counted apart.
//   4. Zotero.Debug.setStore(<what the first snapshot found>).
// Nothing secret is printed: error texts are cut at 140 characters and a
// 32-hex id is shortened.
// params: none. state: reads runStartMs, debugWasStoring, debugMark; writes errors238.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const out = { step: '238-99-errors-and-debug', at: new Date().toISOString() };
  const t0 = S.runStartMs;
  const cut = (v, n = 140) => String(v ?? '').replace(/[0-9a-f]{32}/gi, (h) => h.slice(0, 4) + '…' + h.slice(-4)).replace(/\s+/g, ' ').slice(0, n);
  const isNoise = (t) => /compatible: listing voices failed|Couldn't decrypt string|selectionRanges|\.ftl|uncaught exception: undefined|NS_ERROR_FILE_UNRECOGNIZED_PATH/i.test(t);

  // --- 1. the detection, proved on a marker
  const marker = '238-selftest: this._controller.clearFailures is not a function';
  const tMark = Date.now();
  Services.console.logStringMessage(marker);

  // --- 2. the console
  const all = Services.console.getMessageArray();
  out.console = { held: all.length, oldestSecFromRunStart: all.length ? Math.round((Number(all[0].timeStamp) - t0) / 1000) : null };
  out.console.coversWholeRun = all.length > 0 && Number(all[0].timeStamp) <= t0;
  const hits = []; const groups = new Map(); let markerSeen = 0;
  for (const msg of all) {
    const ts = Number(msg.timeStamp);
    let text = '', isError = false, src = '';
    try { const se = msg.QueryInterface(Components.interfaces.nsIScriptError); text = String(se.errorMessage); isError = (se.flags & 1) === 0; src = se.sourceName ? String(se.sourceName).split('/').pop() + ':' + se.lineNumber : ''; } catch (e) { text = String(msg.message); }
    const full = String(msg.message || '') + ' ' + text;
    if (/clearFailures/.test(full)) {
      if (full.includes('238-selftest') && ts >= tMark - 50) { markerSeen++; continue; }
      if (ts >= t0) hits.push({ secFromStart: Math.round((ts - t0) / 1000), text: cut(text, 160), src });
    }
    if (!isError || ts < t0) continue;
    const key = cut(text, 100).replace(/\d+/g, '#');
    const g = groups.get(key) || { n: 0, first: ts, last: ts, src, noise: isNoise(text) };
    g.n++; g.last = ts; groups.set(key, g);
  }
  out.console.selfTestMarkerFound = markerSeen;
  out.console.clearFailuresHitsSinceRun = hits;
  out.console.errorGroupsSinceRun = [...groups.entries()].slice(0, 30).map(([k, g]) => ({ text: k, n: g.n, firstSec: Math.round((g.first - t0) / 1000), lastSec: Math.round((g.last - t0) / 1000), src: g.src, knownNoise: g.noise }));

  // --- 3. the debug store
  let lines = [];
  try { lines = String(await Zotero.Debug.get()).split('\n'); } catch (e) { out.debugErr = String(e); }
  const ours = lines.filter((l) => l.includes('[zotero-tts]'));
  const bad = ours.filter((l) => /error|exception|fail|dead object|unable|cannot|could not/i.test(l));
  const dg = new Map();
  for (const l of bad) {
    const k = cut(l.replace(/^[^\]]*\]\s*/, ''), 110).replace(/\d+/g, '#');
    dg.set(k, (dg.get(k) || 0) + 1);
  }
  out.debug = {
    storing: Zotero.Debug.storing, lines: lines.length, oursLines: ours.length,
    deadObject: lines.filter((l) => /can't access dead object/i.test(l)).length,
    compatibleNoise: lines.filter((l) => /compatible: listing voices failed/.test(l)).length,
    oursWithErrorOrFailure: bad.length,
    groups: [...dg.entries()].slice(0, 25).map(([k, n]) => ({ text: k, n })),
  };

  // --- 4. the store as the first snapshot found it
  try { if (!!Zotero.Debug.storing !== !!S.debugWasStoring) Zotero.Debug.setStore(!!S.debugWasStoring); } catch (e) { out.debugRestoreErr = String(e); }
  out.debugStoringNow = Zotero.Debug.storing;
  out.debugWasStoring = S.debugWasStoring;
  S.errors238 = out;
  return JSON.stringify(out, null, 1);
})();
