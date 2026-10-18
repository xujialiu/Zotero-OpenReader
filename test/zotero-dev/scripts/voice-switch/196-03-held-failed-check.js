// 196-03 — item 16, variant (b), the check: the held request failed while in flight (the tester
// flipped the stub between 196-02 and this script). The failing answer belongs to a store the
// session no longer holds: no `Playback failed` notice, the Player stays playing, error null.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const deadline = S.vs196bHoldDeadlineFallback || null;
  const itemID = S.vs196Items && S.vs196Items.b;
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === itemID);
  if (!reader) { out.error = '196b reader gone'; return JSON.stringify(out); }
  const sessionOf = async () => {
    const e = JSON.parse(await d.engine());
    const i = (e.readers ?? []).findIndex((r) => r.itemID === itemID);
    return { session: e.readers?.[i]?.session ?? null, stats: e.readers?.[i]?.stats ?? null };
  };
  // wait until ~26 s after the arm (the held request fired ~1 s after the arm's play)
  const armAt = S.vs196bArmAt || (Date.now() - 20000);
  const wait = (armAt + 26000) - Date.now();
  out.waitedMs = Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    await new Promise((r) => setTimeout(r, 500));
    const el = reader._iframeWindow.document.getElementById('ztts-playback-notice');
    const cur = (await sessionOf()).session;
    seen.push({ notice: el ? String(el.textContent).slice(0, 60) : null, voice: cur ? cur.voice : null, playing: cur ? cur.playing : null, error: cur && cur.error ? String(cur.error).slice(0, 80) : null });
  }
  out.watch = seen;
  const late = await sessionOf();
  out.after = {
    lateAnswers: late.stats ? late.stats.lateAnswers : null,
    lateAtArm: S.vs196bLateAtArm,
    voice: late.session ? late.session.voice : null,
    playing: late.session ? late.session.playing : null,
    error: late.session && late.session.error ? String(late.session.error).slice(0, 100) : null,
  };
  const anyNotice = seen.some((x) => x.notice);
  out.pass = !!(out.after.voice === 'compatible::stub-fox' && out.after.playing === true && !out.after.error && !anyNotice);
  return JSON.stringify(out);
})()
