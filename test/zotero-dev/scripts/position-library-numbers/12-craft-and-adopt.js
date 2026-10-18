// Case item 1: the crafted entry under a number no library has here (L), taken
// at the fixture tab's reader-open sync under this computer's library number.
// Idempotent: any fixture tab is closed and the file's craft removed while the
// switch is still off, the switch is set through Services.prefs (the pref is
// relative to extensions.zotero.; a Zotero.Prefs.set with 'zotero-tts.…' and a
// full-name flag writes a stray root pref instead — this run's first attempt
// failed exactly that way), the switch-on sync settles against the pre-craft
// file, then the craft is PUT and the tab freshly opened.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const f = s.fixture;
  if (!f?.key || !s.craftPos) throw new Error('run 10 and 11 first');
  const d = Zotero.ZoteroTTS.diagnostics;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const p = Services.prefs;
  const realKey = 'extensions.zotero.zotero-tts.webdav.syncPositions';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // L: a number with Zotero.Libraries.exists(L) false.
  const libs = [];
  const all = Zotero.Libraries.getAll();
  for (let i = 0; i < all.length; i++) libs.push({ id: all[i].id, type: all[i].libraryType });
  out.libraries = libs;
  let L = null;
  for (const cand of [7, 8, 9, 10]) { if (!Zotero.Libraries.exists(cand)) { L = cand; break; } }
  if (L === null) throw new Error('no free library number found');
  out.L = L;
  out.fixtureKeyHeldOnlyInUser = Zotero.Items.getIDFromLibraryAndKey(1, f.key) > 0
    && libs.every((l) => l.id === 1 || !Zotero.Items.getIDFromLibraryAndKey(l.id, f.key));

  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const getFile = async () => {
    const g = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    if (g.status !== 200) throw new Error('native file GET ' + g.status);
    return JSON.parse(await g.text());
  };

  // With the switch still off: drop any earlier craft from the file and close
  // the fixture's tab, so the later open is a fresh reader-open poke.
  if (p.getBoolPref(realKey) !== false) p.setBoolPref(realKey, false);
  await sleep(500);
  const pre = await getFile();
  const K = f.key;
  const hadCraft = pre.items.some((i) => i.key === K);
  if (hadCraft) {
    const body = JSON.stringify({ format: 'zotero-tts-positions', version: 1, items: pre.items.filter((i) => i.key !== K) });
    const put = await fetch(url + 'zotero-tts-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
    out.preCraftRestore = { removed: hadCraft, putStatus: put.status };
  }
  const win = Zotero.getMainWindow();
  const existing = (Zotero.Reader._readers || []).find((x) => x.itemID === f.itemID) || null;
  if (existing?.tabID) {
    win.Zotero_Tabs.close(String(existing.tabID));
    await sleep(2500);
    out.closedStaleTab = true;
  }
  out.stalePrefRemoved = (() => { const stray = 'zotero-tts.webdav.syncPositions'; const had = p.prefHasUserValue(stray); if (had) p.clearUserPref(stray); return { had, gone: !p.prefHasUserValue(stray) }; })();

  // Switch on (the real pref); the switch-on poke syncs against the pre-craft file.
  p.setBoolPref(realKey, true);
  const switchOnStarted = Date.now();
  let st0 = null;
  while (Date.now() - switchOnStarted < 30000) {
    await sleep(700);
    st0 = JSON.parse(await d.positionSync());
    if (st0.transport?.running === false && st0.shared?.transport?.running === false && st0.transport?.lastTrigger === 'switch-on' && st0.transport?.lastOutcome !== 'skipped') break;
  }
  out.switchOn = {
    outcome: st0?.transport?.lastOutcome, trigger: st0?.transport?.lastTrigger,
    adopted: st0?.transport?.adopted, uploaded: st0?.transport?.uploaded,
    remoteEntries: st0?.transport?.remoteEntries, localEntries: st0?.localEntries,
    sharedOutcome: st0?.shared?.transport?.lastOutcome, sharedUploaded: st0?.shared?.transport?.uploaded,
  };
  if (out.switchOn.outcome !== 'ok') throw new Error('switch-on sync did not run ok: ' + JSON.stringify(out.switchOn));

  // The craft: the file as it stands now, plus one item, canonical order.
  const base = await getFile();
  out.craftPrefixAbsent = !base.items.some((i) => i.key === K);
  const craftedTs = Date.now() + 60000;
  s.craftedTs = craftedTs;
  const items = base.items
    .filter((i) => !(i.key === K))
    .concat([{ lib: L, key: K, pos: s.craftPos, ts: craftedTs }])
    .sort((a, b) => (a.lib - b.lib) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = JSON.stringify({ format: 'zotero-tts-positions', version: 1, items });
  const put = await fetch(url + 'zotero-tts-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  const verify = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.putVerified = (await verify.text()) === body;
  out.fileBytes = body.length;

  // Fresh open: the reader-open sync adopts the crafted entry.
  let reader = await Zotero.Reader.open(f.itemID);
  if (reader.tabID) { try { win.Zotero_Tabs.select(reader.tabID); } catch {} }
  const opened = Date.now();
  while (Date.now() - opened < 24000 && !(reader?._internalReader && reader?._internalReader?._readAloudManager)) {
    await new Promise((r) => setTimeout(r, 700));
  }
  f.tabID = reader.tabID;
  out.readyMs = Date.now() - opened;
  const openAt = Date.now();
  let trig = null;
  while (Date.now() - openAt < 30000) {
    await sleep(600);
    const st = JSON.parse(await d.positionSync());
    trig = st.transport;
    if (st.transport?.running === false && st.transport?.lastTrigger === 'reader-open' && st.transport?.lastOutcome === 'ok' && (st.transport?.lastAt ?? 0) > openAt - 2500) break;
  }
  out.readerOpen = {
    outcome: trig?.lastOutcome, trigger: trig?.lastTrigger, adopted: trig?.adopted, remapped: trig?.remapped,
    uploaded: trig?.uploaded, remoteEntries: trig?.remoteEntries,
    localEntries: JSON.parse(await d.positionSync()).localEntries, lastAt: trig?.lastAt,
  };

  // The debug line for the reader-open sync.
  const debug = String(await Zotero.Debug.get());
  out.lines = debug.split('\n').filter((l) => l.indexOf('position sync (') !== -1).slice(-4).map((l) => l.slice(l.indexOf('[zotero-tts]')));

  // The store's entry for the fixture, via the open reader.
  const position = JSON.parse(await d.position());
  const mine = (position.readers || []).find((r) => r.itemID === f.itemID) || null;
  out.stored = mine?.stored ?? null;
  out.storedMatchesCraft = !!mine?.stored && mine.stored.key === K && mine.stored.lib === 1
    && mine.stored.ts === craftedTs && JSON.stringify(mine.stored.pos) === JSON.stringify(s.craftPos);

  // The file after the sync: the crafted entry as written, and this
  // computer's mirror beside it with the same ts.
  const afterFile = await getFile();
  out.fileEntriesForFixture = afterFile.items.filter((i) => i.key === K).map((i) => ({ lib: i.lib, ts: i.ts, pos: i.pos }));
  return JSON.stringify(out);
})()
