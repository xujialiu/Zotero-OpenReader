// pr-01 — item 1a (#198): the voice list answers 502 (a server down behind a gateway). A fixture
// whose Document voice is a compatible voice opens with the toast `Cannot reach OpenAI Compatible.
// This document keeps its voice: …` (not "unavailable"), and the Player's OpenAI Compatible entry
// lists none of OpenAI's eleven voices. The stub must be in voices-502 mode before this runs.
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const win = Zotero.getMainWindow();
  const P = Zotero.ZoteroTTSRun.params;
  const title = 'ztts 2026-10-18 pr1';

  const s = new Zotero.Search();
  s.addCondition('libraryID', 'is', Zotero.Libraries.userLibraryID);
  s.addCondition('title', 'is', title);
  const old = await s.search();
  if (old.length) await Zotero.Items.erase(old);
  S.prItems = S.prItems || {};
  const item = await Zotero.Attachments.importFromFile({ file: P.fixturePr1, libraryID: Zotero.Libraries.userLibraryID, title });
  S.prItems.a = item.id;

  // the fixture's Document voice: a compatible voice, written as the store writes it
  const att = Zotero.Items.get(item.id);
  const key = 'user/' + att.key;
  const record = JSON.stringify({ voice: { id: 'compatible::alloy', lang: 'en' }, manual: true, ts: Date.now() });
  S.prDocVoiceKey = key;
  const branch = 'extensions.zotero.zotero-tts.documentVoices.';
  if (Services.prefs.prefHasUserValue(branch + key)) S.prDocVoiceBefore = Services.prefs.getStringPref(branch + key);
  Services.prefs.setStringPref(branch + key, record);

  await Zotero.Reader.open(item.id);
  const t0 = Date.now();
  let reader = null;
  while (Date.now() - t0 < 24000) {
    reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === item.id);
    if (reader && reader._internalReader) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!reader) { out.error = 'reader not ready'; return JSON.stringify(out); }
  S.prTab = reader.tabID;
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 500));

  // open the Player and catch the announcement toast in the same script (it lives 5 s)
  reader._internalReader.toggleReadAloudPopup(true);
  const seen = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 6000) {
    const el = reader._iframeWindow.document.getElementById('ztts-speed-toast');
    seen.push(el ? String(el.textContent).slice(0, 140) : null);
    if (el && /Cannot reach OpenAI Compatible/.test(el.textContent || '')) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  out.toastSeen = seen.filter(Boolean).slice(0, 6);
  out.toast = seen.find((t) => t && /Cannot reach/.test(t)) ?? null;
  try { reader._internalReader._readAloudManager.pause(); } catch (e) {}

  // The Player's OpenAI Compatible entry lists what the catalog lists for the tier (the pane and
  // the player draw on the same listing): zero voices under a 502, OpenAI's eleven under a 404.
  const dv = JSON.parse(await d.defaultVoice());
  const rows = (dv.rows ?? []).filter((r) => r && r.tier === 'compatible');
  out.compatibleCatalogUnder502 = { count: rows.length, ids: rows.slice(0, 12).map((r) => String(r.id)) };
  out.pass = !!(out.toast && /Cannot reach OpenAI Compatible\. This document keeps its voice/.test(out.toast) && rows.length === 0);
  return JSON.stringify(out);
})()
