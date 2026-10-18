// Case item 3: closing the fixture's tab is a sync; the file ends up holding
// both entries — this computer's copy (lib 1) with the ts the reading moved it
// to, and the crafted lib 7 entry as written. Then another tab open+close
// twice: each sync uploads nothing and the file stays byte for byte the same.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  const K = f.key;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const getFile = async () => {
    const g = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    if (g.status !== 200) throw new Error('native GET ' + g.status);
    return await g.text();
  };
  const digest = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');

  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID);
  if (!reader) throw new Error('fixture reader gone');

  // The close, then the close sync.
  out.closedTabID = String(reader.tabID);
  win.Zotero_Tabs.close(String(reader.tabID));
  const closeAt = Date.now();
  while (Date.now() - closeAt < 30000) {
    await sleep(600);
    const st = JSON.parse(await d.positionSync());
    if (st.transport?.running === false && st.transport?.lastTrigger === 'reader-close' && st.transport?.lastOutcome !== 'skipped' && (st.transport?.lastAt ?? 0) > closeAt - 2500) break;
  }
  const st1 = JSON.parse(await d.positionSync());
  out.closeSync = { outcome: st1.transport?.lastOutcome, trigger: st1.transport?.lastTrigger, uploaded: st1.transport?.uploaded, adopted: st1.transport?.adopted, localEntries: st1.localEntries, lastAt: st1.transport?.lastAt };
  const debug = String(await Zotero.Debug.get());
  out.closeLines = debug.split('\n').filter((l) => l.includes('position sync (')).slice(-2).map((l) => l.slice(l.indexOf('[zotero-tts]')));

  // The file: both entries for K, lib 1 newer than the crafted ts.
  const fileText = await getFile();
  out.fileAfterCloseSha = await digest(fileText);
  const file = JSON.parse(fileText);
  const entries = file.items.filter((i) => i.key === K).map((i) => ({ lib: i.lib, ts: i.ts, pageIndex: i.pos?.pageIndex }));
  out.fileEntriesForFixture = entries;
  out.bothEntriesPresent = entries.some((e) => e.lib === 1) && entries.some((e) => e.lib === 7);
  const lib7 = entries.find((e) => e.lib === 7);
  const lib1 = entries.find((e) => e.lib === 1);
  out.lib7AsWritten = !!lib7 && lib7.ts === s.craftedTs;
  out.lib1NewerThanCraft = !!lib1 && lib1.ts > s.craftedTs;

  // Another tab open+close twice: nothing new either time.
  out.pokes = [];
  for (let round = 0; round < 2; round++) {
    const r = await Zotero.Reader.open(f.itemID);
    const started = Date.now();
    while (Date.now() - started < 24000 && !(r?._internalReader && r?._internalReader?._readAloudManager)) await sleep(700);
    f.tabID = r.tabID;
    await sleep(1500);
    win.Zotero_Tabs.close(String(r.tabID));
    const pokeAt = Date.now();
    while (Date.now() - pokeAt < 30000) {
      await sleep(600);
      const st = JSON.parse(await d.positionSync());
      if (st.transport?.running === false && st.transport?.lastTrigger === 'reader-close' && st.transport?.lastOutcome !== 'skipped' && (st.transport?.lastAt ?? 0) > pokeAt - 2500) break;
    }
    const stp = JSON.parse(await d.positionSync());
    const text = await getFile();
    out.pokes.push({ round: round + 1, outcome: stp.transport?.lastOutcome, trigger: stp.transport?.lastTrigger, uploaded: stp.transport?.uploaded, fileSha: await digest(text), fileBytes: text.length });
  }
  out.fileUnchangedAcrossPokes = out.pokes.every((p) => p.fileSha === out.fileAfterCloseSha);
  return JSON.stringify(out);
})()
