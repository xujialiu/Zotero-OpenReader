(async () => {
  // Issue #156 item 7, setup: capture position baseline and the owner PDF tab's
  // player state, point the default voice at a free macOS System voice before any
  // player opens, and import temporary copies of the book's EPUB and PDF
  // attachments. The original items and the owner's tab are only read, never driven.
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const params = run.params || {};
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const systemVoice = params.voice || 'system::osx/com.apple.voice.enhanced.en-US.Ava';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const titleOf = id => { try { const item = Zotero.Items.get(id); return (item?.parentItem ? Zotero.Items.get(item.parentItem) : item)?.getField('title') || null; } catch (_) { return null; } };
  const readerOf = id => { const rs = Zotero.Reader?._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === id) return rs[i]; return null; };
  const snapPref = suffix => {
    const key = prefix + suffix;
    const type = prefs.getPrefType(key), user = prefs.prefHasUserValue(key);
    let value = null;
    try { if (type === prefs.PREF_BOOL) value = prefs.getBoolPref(key); else if (type === prefs.PREF_INT) value = prefs.getIntPref(key); else if (type === prefs.PREF_STRING) value = prefs.getStringPref(key); } catch (_) {}
    return { type, user, value };
  };
  const parsedID = value => { try { return JSON.parse(value || 'null')?.id ?? null; } catch (_) { return null; } };
  const metered = id => !id || !String(id).includes('::') || /^fish/i.test(String(id));
  const out = { step: 'part-anchored-fixtures', bookTitle: params.bookTitle || null };

  // Position baseline, before any copy exists.
  if (!state.positionBefore) {
    try { state.positionBefore = await Zotero.ZoteroTTS.diagnostics.position(); } catch (e) { throw new Error('position baseline unavailable: ' + String(e)); }
    try { state.posBeforeRows = JSON.parse(state.positionBefore)?.database?.rows ?? null; } catch (_) {}
  }
  out.positionRowsBefore = state.posBeforeRows ?? null;

  // The fixture book and its EPUB and PDF attachments.
  const search = new Zotero.Search();
  search.libraryID = Zotero.Libraries.userLibraryID;
  search.addCondition('title', 'contains', params.bookTitle);
  const found = Zotero.Items.get(await search.search());
  const attachments = [];
  for (const item of found) {
    if (item.isAttachment()) attachments.push(item);
    else for (const aid of item.getAttachments()) attachments.push(Zotero.Items.get(aid));
  }
  const byKind = {};
  for (const a of attachments) {
    const type = String(a.attachmentContentType || '');
    if (/pdf/i.test(type) && !byKind.pdf) byKind.pdf = a;
    if (/epub/i.test(type) && !byKind.epub) byKind.epub = a;
  }
  if (!byKind.pdf || !byKind.epub) throw new Error('EPUB/PDF attachments of the fixture book not found: ' + JSON.stringify(attachments.map(a => ({ id: a.id, type: a.attachmentContentType }))));
  out.source = { pdf: byKind.pdf.id, epub: byKind.epub.id };
  state.sources = { pdf: byKind.pdf.id, epub: byKind.epub.id };

  // The owner's PDF tab: read only, before and after this setup.
  const ownerState = () => {
    const reader = readerOf(byKind.pdf.id);
    if (!reader) return { open: false };
    const manager = reader._internalReader?._readAloudManager;
    return {
      open: true,
      active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
    };
  };
  out.ownerBefore = ownerState();
  state.ownerBefore = state.ownerBefore || out.ownerBefore;

  // Voice prefs, before any player of the copies opens. Originals are restored by 99.
  state.tempPrefs = state.tempPrefs || {};
  if (!state.tempPrefs['readAloud.volume']) state.tempPrefs['readAloud.volume'] = snapPref('readAloud.volume');
  prefs.setIntPref(prefix + 'readAloud.volume', 0);
  if (!state.tempPrefs['system.enabled']) state.tempPrefs['system.enabled'] = snapPref('system.enabled');
  prefs.setBoolPref(prefix + 'system.enabled', true);
  const defaultVoiceSnap = state.tempPrefs['readAloud.defaultVoice'] || snapPref('readAloud.defaultVoice');
  state.tempPrefs['readAloud.defaultVoice'] = defaultVoiceSnap;
  if (parsedID(defaultVoiceSnap.value) !== systemVoice) {
    prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ id: systemVoice, lang: 'en' }));
    out.defaultVoiceSet = systemVoice;
  } else out.defaultVoiceWas = systemVoice;
  // The workflow's standing rule: a memory naming an unoffered or metered voice
  // would fall back to a paid voice at popup open. Point it at the System voice;
  // 99 restores the original as its final pref write.
  const memorySnap = state.tempPrefs['readAloud.memory'] || snapPref('readAloud.memory');
  const memoryID = parsedID(memorySnap.value);
  out.memoryAtSetup = String(memoryID ?? 'unset');
  if (metered(memoryID)) {
    state.tempPrefs['readAloud.memory'] = memorySnap;
    prefs.setStringPref(prefix + 'readAloud.memory', JSON.stringify({ id: systemVoice, lang: 'en' }));
    out.memorySetTo = systemVoice;
  }

  // Temporary copies of both attachments, then their readers in the background.
  state.fixtures = state.fixtures || {};
  state.runOwnedIDs = state.runOwnedIDs || [];
  for (const kind of ['pdf', 'epub']) {
    if (state.fixtures[kind]?.id) continue;
    const file = byKind[kind].getFile();
    if (!file?.exists?.()) throw new Error('attachment file unavailable: ' + kind);
    const copy = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: 'ztts issue156 ' + kind.toUpperCase() + ' copy ' + (params.runId || String(Date.now())) });
    state.runOwnedIDs.push(copy.id);
    state.fixtures[kind] = { id: copy.id, sourceID: byKind[kind].id };
  }
  out.copies = { pdf: state.fixtures.pdf.id, epub: state.fixtures.epub.id };
  const opts = Components.utils.cloneInto({ openInBackground: true, allowDuplicate: false }, Zotero);
  for (const kind of ['pdf', 'epub']) {
    if (readerOf(state.fixtures[kind].id)) continue;
    Zotero.Reader.open(state.fixtures[kind].id, null, opts);
  }
  for (const kind of ['pdf', 'epub']) {
    const ready = await waitFor(() => { const r = readerOf(state.fixtures[kind].id); return r?._internalReader?._readAloudManager ? r : null; }, 24000, 200);
    if (!ready) throw new Error('copy reader did not initialize: ' + kind);
  }
  out.ownerAfter = ownerState();
  out.ownerUnchanged = JSON.stringify(out.ownerBefore) === JSON.stringify(out.ownerAfter);
  return JSON.stringify(out, null, 1);
})()
