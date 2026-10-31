// Pick a voice in an open fixture Player (manager active, paused, muted): list what
// the manager offers per tier, selectTier() then selectVoice(), and wait for
// selectedVoiceID. A Zotero-tier voice is never picked (they spend credits): an id
// without '::' is refused. Also reports what the pick moved: the global default
// voice, this document's voice record, and the length of Zotero's per-language
// voice pref, so cleanup knows what to put back (01 holds the snapshots).
// Voice ids are printed with any 32-hex run masked.
// params: which, tier (e.g. 'fish', 'system'), voiceId (optional; else the first
//   voice of that tier whose id starts with <tier>::en, preferring params.preferId).
// state: reads readers[which], fx. Writes nothing but the pick itself.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'pick-voice', which: p.which, tier: p.tier };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const mask = (s) => (s == null ? s : String(s).replace(/[0-9a-f]{32}/g, '<32hex>'));
  const P = 'extensions.zotero.zotero-tts.';
  if (Services.prefs.getIntPref(P + 'readAloud.volume', -1) !== 0) throw new Error('not muted');
  const rd = state.readers?.[p.which];
  const reader = rd ? (Zotero.Reader._readers || []).find((r) => r.itemID === rd.itemID) : null;
  if (!reader) throw new Error('reader not open: ' + p.which);
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  if (!manager.active || !manager.paused) throw new Error('the Player must be active and paused');

  // What the manager offers, by tier (index loop: reader-realm arrays ignore callbacks).
  const all = waive(manager.allVoices);
  const byTier = {};
  const ids = [];
  for (let i = 0; i < (Number(all?.length) || 0); i++) {
    const v = waive(all[i]);
    const id = String(v.id ?? '');
    const tier = String(v.tier ?? id.split('::')[0]);
    byTier[tier] = (byTier[tier] || 0) + 1;
    ids.push({ id, tier });
  }
  out.offeredByTier = byTier;

  let target = p.voiceId || null;
  if (!target) {
    const inTier = ids.filter((v) => v.id.startsWith(p.tier + '::'));
    target = (p.preferId && inTier.find((v) => v.id === p.preferId)?.id) || inTier.find((v) => v.id.startsWith(p.tier + '::en'))?.id || inTier[0]?.id || null;
  }
  out.target = mask(target);
  if (!target || !target.includes('::')) { out.ok = false; out.stop = 'no listed (::) voice to pick in tier ' + p.tier; return JSON.stringify(out, null, 1); }
  out.targetOffered = ids.some((v) => v.id === target);

  const before = {
    voice: manager.selectedVoiceID, tier: manager.selectedTier,
    defaultVoice: Services.prefs.getStringPref(P + 'readAloud.defaultVoice', ''),
    zoteroVoicesLen: Services.prefs.getStringPref('extensions.zotero.reader.readAloudVoices', '').length,
  };
  try { manager.selectTier(p.tier); } catch (e) { out.tierError = String(e); }
  await sleep(500);
  try { manager.selectVoice(target); } catch (e) { out.voiceError = String(e); }
  for (let i = 0; i < 40 && manager.selectedVoiceID !== target; i++) await sleep(150);
  await sleep(500);
  out.selected = { voice: mask(manager.selectedVoiceID), tier: manager.selectedTier ?? null, matches: manager.selectedVoiceID === target, active: !!manager.active, paused: !!manager.paused };

  const dv = JSON.parse(Zotero.ZoteroTTS.diagnostics.documentVoices());
  const key = 'user/' + Zotero.Items.get(rd.itemID).key;
  const defaultNow = Services.prefs.getStringPref(P + 'readAloud.defaultVoice', '');
  out.moved = {
    defaultVoiceChanged: defaultNow !== before.defaultVoice,
    defaultVoiceNow: mask(defaultNow),
    zoteroVoicesLenBefore: before.zoteroVoicesLen,
    zoteroVoicesLenNow: Services.prefs.getStringPref('extensions.zotero.reader.readAloudVoices', '').length,
    documentRecord: (dv.readers || []).find((r) => r.key === key)?.saved ? { voice: mask(JSON.stringify((dv.readers || []).find((r) => r.key === key).saved.voice)), manual: dv.readers.find((r) => r.key === key).saved.manual } : null,
  };
  out.ok = out.selected.matches && out.selected.paused;
  return JSON.stringify(out, null, 1);
})()
