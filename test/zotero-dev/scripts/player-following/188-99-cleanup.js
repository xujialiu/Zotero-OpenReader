// 188-99 — item 7: close the fixture readers, delete the imported items, restore the kit's prefs,
// confirm the position rows and document-voice records are back. (Volume, memory, system.enabled and
// WebDAV are restored by the run's final restore script, since later kits reuse them.)
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const win = Zotero.getMainWindow();
  const d = Zotero.ZoteroTTS.diagnostics;

  // Close fixture readers
  for (const tab of [S.fix4SnapshotTab, S.fix4PdfTab]) {
    if (tab) { try { win.Zotero_Tabs.close(tab); } catch (e) { out['closeError' + tab] = String(e); } }
  }
  const c0 = Date.now();
  while (Date.now() - c0 < 8000 && (Zotero.Reader._readers ?? []).some((r) => r.itemID === S.fix4Items.snapshot || r.itemID === S.fix4Items.pdf)) {
    await new Promise((r) => setTimeout(r, 300));
  }
  out.readersLeft = (Zotero.Reader._readers ?? []).map((r) => r.itemID);

  // Default scrolling back
  const ds = S.fix4Prefs['readAloud.defaultAutoScroll'];
  if (ds.hadUser) Zotero.Prefs.set('zotero-tts.readAloud.defaultAutoScroll', ds.value);
  else Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.defaultAutoScroll');
  out.defaultAutoScrollRestored = { value: ds.value, hadUser: ds.hadUser };
  const asmo = S.fix4Prefs['readAloud.autoScrollMode'];
  if (asmo.hadUser) Zotero.Prefs.set('zotero-tts.readAloud.autoScrollMode', asmo.value);
  else Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.autoScrollMode');

  // Erase fixture items (attachment + its host + every pdf import of this run)
  const ids = Object.values(S.fix4Items ?? {}).filter((v) => typeof v === 'number');
  await Zotero.Items.erase(ids);
  await new Promise((r) => setTimeout(r, 500));
  out.erased = ids;
  out.itemsGone = ids.every((id) => !Zotero.Items.get(id));

  // document-voice records: remove ones this run created for fixture keys, keep the owner's
  const branch = Services.prefs.getBranch('extensions.zotero.zotero-tts.documentVoices.');
  const now = {};
  for (const k of branch.getChildList('')) now[k] = branch.getStringPref(k);
  const before = S.fix4Prefs.documentVoices ?? {};
  const added = Object.keys(now).filter((k) => !(k in before));
  for (const k of added) Services.prefs.clearUserPref('extensions.zotero.zotero-tts.documentVoices.' + k);
  const changed = Object.keys(now).filter((k) => k in before && before[k] !== now[k]);
  for (const k of changed) branch.setStringPref(k, before[k]);
  out.documentVoiceRecords = { removed: added.length, restoredValues: changed.length };
  out.documentVoicesClean = Object.keys(Services.prefs.getBranch('extensions.zotero.zotero-tts.documentVoices.').getChildList('')).every((k) => k in before);

  // Rows and folder state
  const pos = JSON.parse(await d.position());
  out.positionRows = { now: pos.database.rows, baseline: S.fix4RowsBaseline ?? null };
  const ps = JSON.parse(await d.positionSync());
  out.folder = ps.folder;
  out.pass = out.itemsGone && added.length >= 0 && out.documentVoicesClean
    && (S.fix4RowsBaseline == null || pos.database.rows === S.fix4RowsBaseline) && ps.folder === false;
  return JSON.stringify(out);
})()
