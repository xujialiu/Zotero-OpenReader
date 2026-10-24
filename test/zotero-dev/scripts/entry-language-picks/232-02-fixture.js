// 232-02 — import fixture-a.pdf as a standalone attachment (fresh fixture for
// the idle-draft item). No reader is opened here; 232-03 plants first, 232-04
// opens. The absolute file path comes in as params.fixtureA.
(async () => {
  const Z = Zotero;
  const out = { steps: [] };
  const state = (Z.ZoteroTTSRun.state.ep232 ||= {});
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); return ok ? undefined : detail; };
  try {
    if (state.schema !== 2 || !state.snapshotComplete || state.fixture || state.cleaned) throw new Error('A fresh isolated run with no existing fixture is required');
    const file = Z.ZoteroTTSRun.params.fixtureA;
    const title = Z.ZoteroTTSRun.params.fixtureTitle || 'ztts fixture';
    if (!file) throw new Error('params.fixtureA missing');
    // Any leftover fixture of the same title would mean an un-cleaned earlier attempt
    const all = await Z.Items.getAll(Z.Libraries.userLibraryID, false, false);
    const existing = all.filter(
      (i) => i.isAttachment() && String(i.getField('title') ?? '') === title,
    );
    out.leftovers = existing.length;
    step('no-leftover-fixture', existing.length === 0, `${existing.length} item(s) already titled ${title}`);
    if (existing.length) { out.ok = false; return JSON.stringify(out); }

    const item = await Z.Attachments.importFromFile({ file, libraryID: Z.Libraries.userLibraryID, title });
    state.fixture = Object.freeze({ itemID: item.id, key: item.key, title, created: true });
    out.fixture = { itemID: item.id, key: item.key, title: String(item.getField('title')) };
    step('imported', !!item.key, 'no key');
    out.ok = out.steps.every((s) => s.ok);
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, fatal: String(e), steps: out.steps });
  }
})()
