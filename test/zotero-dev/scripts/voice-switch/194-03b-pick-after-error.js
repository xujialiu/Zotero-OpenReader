// 194-03b — item 15, variant (b), the pick: after the tester flipped the stub back to ok, pick the
// provider's other voice on the halted session: `ready` within ~3 s, Play reads in B. pickAt lands
// in state for 194-04's 130 s window.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const itemID = S.vs194Items && S.vs194Items.b;
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === itemID);
  if (!reader) { out.error = '194b reader gone'; return JSON.stringify(out); }
  const m = reader._internalReader._readAloudManager;
  const pickAt = Date.now();
  await m.selectVoice('compatible::stub-fox');
  let ready = null;
  const t3 = Date.now();
  while (Date.now() - t3 < 6000) {
    await new Promise((r) => setTimeout(r, 200));
    const vs = JSON.parse(await d.voiceSwitch());
    const ri = (Zotero.Reader._readers ?? []).findIndex((r) => r.itemID === itemID);
    const h = vs.readers?.[ri]?.handoff ?? null;
    if (h && h.notice === 'ready') { ready = { afterMs: Date.now() - t3, pending: h.pending, stage: h.stage, notice: h.notice }; break; }
    if (h && h.notice === 'failed') { out.failed = h; break; }
  }
  out.ready = ready;
  if (!ready) { out.error = 'notice never turned ready within 6 s'; return JSON.stringify(out); }
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); m.play(); } catch (e) { out.playError = String(e); }
  let played = null;
  const t4 = Date.now();
  while (Date.now() - t4 < 10000) {
    await new Promise((r) => setTimeout(r, 300));
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === itemID);
    const cur = e.readers?.[i]?.session;
    if (cur && cur.voice === 'compatible::stub-fox' && cur.playing) { played = { afterMs: Date.now() - t4, position: cur.position }; break; }
  }
  out.playedInB = played;
  S.vs194bPickAt = pickAt;
  out.pass = !!(ready.afterMs <= 3500 && played);
  return JSON.stringify(out);
})()
