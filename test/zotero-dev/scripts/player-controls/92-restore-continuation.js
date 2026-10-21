return (async () => {
  // Continuation restore: erases the outline + fresh fixtures, restores speedPercent,
  // WebDAV switch and the exact readAloudVoices string from the preflight snapshot,
  // verifies every named pref, and leaves the host window minimized.
  const R = Zotero.ZoteroTTSRun, S = R.state || (R.state = {}), P = R.params || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (t, ms = 8000, step = 80) => { const e = Date.now() + ms; while (Date.now() < e) { const v = t(); if (v) return v; await sleep(step); } return t(); };
  const readers = () => Zotero.Reader?._readers || [];
  const p = Services.prefs, errors = [];
  const out = {};
  // 1. close + erase the continuation fixtures
  const slots = [S.fixtures?.outline, S.fixtures?.fresh].filter(x => x && x.itemID);
  try { const s = new Zotero.Search(); s.addCondition('title', 'beginsWith', 'Zotero-TTS issue 213 Outline'); const ids = await s.search(); for (const id of ids || []) if (!slots.some(x => x.itemID === id)) slots.push({ itemID: id, stray: true }); } catch (e) { errors.push('stray outline search: ' + String(e)); }
  try { const s2 = new Zotero.Search(); s2.addCondition('title', 'beginsWith', 'Zotero-TTS issue 197'); const ids2 = await s2.search(); for (const id of ids2 || []) if (!slots.some(x => x.itemID === id)) slots.push({ itemID: id, stray: true }); } catch (e) { errors.push('stray 197 search: ' + String(e)); }
  out.closed = []; out.erased = [];
  for (const slot of slots) {
    for (const r of readers()) if (r?.itemID === slot.itemID) {
      try { r._internalReader?.toggleReadAloudPopup(false); } catch (e) { errors.push('popup ' + slot.itemID + ': ' + String(e)); }
      try { const pending = r.close?.(); if (pending?.then) await pending; out.closed.push(slot.itemID); } catch (e) { errors.push('close ' + slot.itemID + ': ' + String(e)); }
    }
  }
  for (let t = 0; t < 180; t++) { let present = false; for (const r of readers()) if (slots.some(s => s.itemID === r?.itemID)) present = true; if (!present) break; await sleep(50); }
  for (const slot of slots) {
    try { const item = Zotero.Items.get(slot.itemID); if (item) { await item.eraseTx(); out.erased.push({ id: slot.itemID, gone: !Zotero.Items.get(slot.itemID) }); } } catch (e) { errors.push('erase ' + slot.itemID + ': ' + String(e)); }
  }
  // 2. load the preflight snapshot and restore exactly
  let snap = null;
  try { snap = await IOUtils.readJSON(P.preflightFile); } catch (e) { errors.push('preflight read: ' + String(e)); }
  if (snap) {
    const write = (name, saved) => {
      if (!saved) return;
      if (!saved.user) { if (p.prefHasUserValue(name)) p.clearUserPref(name); return; }
      if (saved.type === p.PREF_STRING) p.setStringPref(name, String(saved.value));
      else if (saved.type === p.PREF_BOOL) p.setBoolPref(name, !!saved.value);
      else if (saved.type === p.PREF_INT) p.setIntPref(name, Number(saved.value));
    };
    write('extensions.zotero.zotero-tts.readAloud.speedPercent', snap.speedPercent);
    write('extensions.zotero.zotero-tts.webdav.enabled', snap.webdavEnabled);
    write('extensions.zotero.zotero-tts.readAloud.globalSpeed', snap.globalSpeed);
    write('extensions.zotero.zotero-tts.readAloud.playerLayout', snap.playerLayout);
    write('extensions.zotero.reader.readAloudVoices', snap.voices);
    await sleep(500);
    // 3. verification
    const read = name => { const type = p.getPrefType(name), user = p.prefHasUserValue(name); let value = null; try { if (type === p.PREF_STRING) value = p.getStringPref(name); else if (type === p.PREF_BOOL) value = p.getBoolPref(name); else if (type === p.PREF_INT) value = p.getIntPref(name); } catch (e) {} return { type, user, value }; };
    const names = ['extensions.zotero.zotero-tts.readAloud.speedPercent', 'extensions.zotero.zotero-tts.readAloud.volume', 'extensions.zotero.zotero-tts.readAloud.globalSpeed', 'extensions.zotero.zotero-tts.readAloud.playerLayout', 'extensions.zotero.zotero-tts.webdav.enabled'];
    out.finalPrefs = {}; for (const n of names) out.finalPrefs[n] = read(n);
    const voicesNow = read('extensions.zotero.reader.readAloudVoices');
    out.voices = { chars: (voicesNow.value || '').length, user: voicesNow.user, identicalToPreflight: String(voicesNow.value) === String(snap.voices.value || '') };
    let checksum = 0; for (let i = 0; i < (voicesNow.value || '').length; i++) checksum = (checksum + (voicesNow.value.charCodeAt(i) * (i + 1))) % 4294967296;
    out.voices.checksum = checksum;
    try { const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()); out.positionSyncFolder = ps.folder; } catch (e) { out.positionSyncFolder = 'error: ' + String(e); }
    out.memory = (() => { const v = read('extensions.zotero.zotero-tts.readAloud.memory'); return { user: v.user, chars: (v.value || '').length }; })();
  }
  // 4. owner readers untouched
  out.owner = [];
  for (const before of (S.baseline?.readers || [])) {
    let now = null;
    for (const r of readers()) if (r?.itemID === before.itemID && r?.tabID === before.tabID) { const m = r._internalReader?._readAloudManager; now = { itemID: r.itemID, tabID: r.tabID, active: !!m?.active, paused: !!m?.paused, lang: m?.lang ?? null, frameVisible: r._iframeWindow?.document?.getElementById('ztts-player-frame')?.hidden === false }; break; }
    out.owner.push({ itemID: before.itemID, beforeState: { active: before.active, paused: before.paused }, now, unchanged: !!now && now.active === before.active && now.paused === before.paused });
  }
  // 5. fixture leftovers audit
  out.leftoverReaders = readers().filter(r => slots.some(s => s.itemID === r?.itemID)).map(r => r.itemID);
  out.leftoverItems = slots.filter(s => { try { return !!Zotero.Items.get(s.itemID); } catch (e) { return false; } }).map(s => s.itemID);
  // 6. reselect the owner's tab and minimize the host
  if (S.baseline?.selectedTabID) { try { Zotero_Tabs.select(S.baseline.selectedTabID); } catch (e) {} }
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (w) { try { w.minimize(); } catch (e) { errors.push('minimize: ' + String(e)); } await sleep(400); }
  out.windowState = w ? w.windowState : null;
  out.errors = errors;
  out.ok = errors.length === 0 && out.voices?.identicalToPreflight === true && out.leftoverReaders.length === 0 && out.leftoverItems.length === 0 && out.positionSyncFolder === false && out.finalPrefs['extensions.zotero.zotero-tts.readAloud.speedPercent']?.value === 145 && out.finalPrefs['extensions.zotero.zotero-tts.webdav.enabled']?.user === false && out.finalPrefs['extensions.zotero.zotero-tts.readAloud.playerLayout']?.user === false;
  return JSON.stringify(out, null, 1);
})()
