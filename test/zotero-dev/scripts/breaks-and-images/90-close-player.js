// Close the Read Aloud Player of a FIXTURE reader (never the owner's) the one
// permitted way, reader._internalReader.toggleReadAloudPopup(false), and wait for
// the manager to go inactive. The tab stays open; params.closeTab = true also
// closes it (Zotero_Tabs.close), after the player. Refuses any reader whose item
// is not a fixture of state.fx.
// params: which, closeTab (optional). state: reads fx, readers.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'close-player', which: p.which };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const fx = state.fx?.[p.which];
  if (!fx) throw new Error('not a fixture: ' + p.which);
  const win = Zotero.getMainWindow();
  const find = () => (Zotero.Reader._readers || []).find((r) => r.itemID === fx.id) ?? null;
  const reader = find();
  if (!reader) { out.alreadyClosed = true; out.ok = true; return JSON.stringify(out, null, 1); }
  const internal = waive(reader._internalReader);
  const manager = waive(internal._readAloudManager);
  out.before = { active: !!manager?.active, paused: !!manager?.paused };
  if (manager?.active) {
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 24 && manager.active; i++) await sleep(250);
  }
  out.after = { active: !!manager?.active };
  if (p.closeTab) {
    win.Zotero_Tabs.close(reader.tabID);
    for (let i = 0; i < 40 && find(); i++) await sleep(200);
    out.tabClosed = !find();
  }
  out.ok = !out.after.active && (!p.closeTab || out.tabClosed);
  return JSON.stringify(out, null, 1);
})()
