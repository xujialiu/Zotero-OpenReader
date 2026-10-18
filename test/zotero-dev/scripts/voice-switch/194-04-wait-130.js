// 194-04 — item 15, variant (b), the 130 s window (state.vs194bPickAt): same oracle as 194-02.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const pickAt = S.vs194bPickAt;
  if (!pickAt) { out.error = 'no pick timestamp in state'; return JSON.stringify(out); }
  const need = 130000 - (Date.now() - pickAt);
  out.sleptMs = Math.max(0, need);
  if (need > 0) await new Promise((r) => setTimeout(r, need));
  const boundary = /no prepared handoff boundary was reached/i;
  const couldNot = /Could not switch/i;
  const since = (ms) => (e) => { try { return (e.timeStamp || 0) >= ms; } catch (x) { return false; } };
  const msgs = Services.console.getMessageArray().filter(since(pickAt));
  out.consoleHits = msgs.filter((m) => boundary.test(m.message) || couldNot.test(m.message)).map((m) => ({ t: m.timeStamp, msg: String(m.message).slice(0, 160) }));
  let errs = [];
  try { errs = (Zotero.getErrors() || []).map(String); } catch (e) { out.errErr = String(e); }
  out.ringHits = errs.filter((s) => boundary.test(s) || couldNot.test(s));
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === (S.vs194Items && S.vs194Items.b));
  out.notice = null;
  if (reader) {
    const el = reader._iframeWindow.document.getElementById('ztts-voice-notice');
    out.notice = el ? String(el.textContent).slice(0, 120) : null;
  }
  const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
  const ri = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === (S.vs194Items && S.vs194Items.b));
  const hand = vs.readers?.[ri]?.handoff ?? null;
  out.handoff = hand ? { pending: hand.pending ?? null, stage: hand.stage ?? null, notice: hand.notice ?? null } : null;
  out.noticeIsFailure = !!out.notice && /Could not switch/i.test(out.notice);
  out.pass = out.consoleHits.length === 0 && out.ringHits.length === 0 && !out.noticeIsFailure && hand && hand.notice !== 'failed';
  return JSON.stringify(out);
})()
