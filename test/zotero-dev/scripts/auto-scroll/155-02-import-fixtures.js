// Issue #155 run, fixture import (2026-09-29, 1.16.2-beta2).
// The kit's original fixtures (25417 PDF, 25387 EPUB) are gone from the
// library, so this pass imports substitutes, re-points state.fixtures at
// them, and erases them at cleanup. Nothing owner-owned is imported.
return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fixtureDir = String(Zotero.ZoteroTTSRun.params.fixturesDir || '');
  const stamp = Date.now();
  const fixtures = {
    pdf: { title: `Zotero-TTS issue 155 PDF ${stamp}`, itemID: null, key: null, file: PathUtils.join(fixtureDir, 'fixture-a.pdf') },
    epub: { title: `Zotero-TTS issue 155 EPUB ${stamp}`, itemID: null, key: null, file: PathUtils.join(fixtureDir, 'return-key', 'return-key.epub') },
  };
  const out = [];
  for (const kind of Object.keys(fixtures)) {
    const slot = fixtures[kind];
    try {
      const imported = await Zotero.Attachments.importFromFile({ file: slot.file, libraryID: Zotero.Libraries.userLibraryID, title: slot.title });
      const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
      if (!item?.id) throw new Error('import returned no item');
      slot.itemID = item.id;
      slot.key = item.key;
      slot.libraryID = item.libraryID;
      out.push({ kind, itemID: slot.itemID, key: slot.key, title: slot.title });
    } catch (e) { out.push({ kind, error: String(e) }); }
  }
  state.fixturesImported = fixtures;
  return JSON.stringify({ out, originalsWereAbsent: state.fixtures ? { pdf: state.fixtures.pdf?.present === false, epub: state.fixtures.epub?.present === false } : null });
})()
