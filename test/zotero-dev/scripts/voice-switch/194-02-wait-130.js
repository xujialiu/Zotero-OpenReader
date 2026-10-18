// 194-02 — item 15, variant (a), the 130 s window: after the pick (state.vs194aPickAt) no
// `Could not switch` notice appears and no `no prepared handoff boundary was reached` is logged.
// Runs ~2 minutes under the runner; reads the console ring, Zotero.getErrors and the debug store.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const pickAt = S.vs194aPickAt;
  if (!pickAt) { out.error = 'no pick timestamp in state'; return JSON.stringify(out); }
  const need = 130000 - (Date.now() - pickAt);
  out.sleptMs = Math.max(0, need);
  if (need > 0) await new Promise((r) => setTimeout(r, need));

  const since = (ms) => (e) => { try { return (e.timeStamp || 0) >= ms; } catch (x) { return false; } };
  const boundary = /no prepared handoff boundary was reached/i;
  const couldNot = /Could not switch/i;

  // console messages since the pick
  const msgs = Services.console.getMessageArray().filter(since(pickAt));
  out.consoleHits = msgs.filter((m) => boundary.test(m.message) || couldNot.test(m.message)).map((m) => ({ t: m.timeStamp, msg: String(m.message).slice(0, 160) }));
  out.consoleCount = msgs.length;

  // the errors ring (contents, not length)
  let errs = [];
  try { errs = (Zotero.getErrors() || []).map(String); } catch (e) { out.errErr = String(e); }
  out.ringHits = errs.filter((s) => boundary.test(s) || couldNot.test(s));

  // the reader's voice notice element
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === (S.vs194Items && S.vs194Items.a));
  out.notice = null;
  if (reader) {
    const el = reader._iframeWindow.document.getElementById('ztts-voice-notice');
    out.notice = el ? String(el.textContent).slice(0, 120) : null;
  }
  // the switch's report: taken (pending null), last committed, notice not failed
  const vs = JSON.parse(await d.voiceSwitch());
  const ri = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === (S.vs194Items && S.vs194Items.a));
  const hand = vs.readers?.[ri]?.handoff ?? null;
  out.handoff = hand ? { pending: hand.pending ?? null, stage: hand.stage ?? null, notice: hand.notice ?? null, last: hand.last ? { kind: hand.last.kind, from: hand.last.from, to: hand.last.to } : null } : null;
  const eng = JSON.parse(await d.engine());
  const i = (eng.readers ?? []).findIndex((r) => r.itemID === (S.vs194Items && S.vs194Items.a));
  const s2 = eng.readers?.[i]?.session;
  out.session = s2 ? { voice: s2.voice, position: s2.position, playing: s2.playing, paused: s2.paused, error: s2.error ?? null } : null;
  // The case's oracle: no `Could not switch` notice, no boundary error. A lingering
  // "Preparing voice" element is reported separately (observed residue after a commit).
  out.noticeIsFailure = !!out.notice && /Could not switch/i.test(out.notice);
  out.pass = out.consoleHits.length === 0 && out.ringHits.length === 0 && !out.noticeIsFailure
    && hand && hand.notice !== 'failed';
  return JSON.stringify(out);
})()
