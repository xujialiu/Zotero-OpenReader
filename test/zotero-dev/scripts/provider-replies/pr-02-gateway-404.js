// pr-02 — item 1b (#198): the voice list answers 404 (a server without a voice list) — the Player's
// OpenAI Compatible entry then lists OpenAI's documented eleven. Run after flipping the stub's
// voices_status to 404; reuses pr-01's fixture reader (popup reopened to re-list the catalog).
(async () => {
  const out = {};
  const S = Zotero.ZoteroTTSRun.state;
  const d = Zotero.ZoteroTTS.diagnostics;
  const itemID = S.prItems && S.prItems.a;
  const reader = (Zotero.Reader._readers ?? []).find((r) => r.itemID === itemID);
  if (!reader) { out.error = 'pr1 reader gone'; return JSON.stringify(out); }
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 300));
  // reopen the popup: the reconcile re-lists the catalog (the stub now answers 404)
  try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {}
  await new Promise((r) => setTimeout(r, 500));
  reader._internalReader.toggleReadAloudPopup(true);
  await new Promise((r) => setTimeout(r, 1500));
  try { reader._internalReader._readAloudManager.pause(); } catch (e) {}

  // The Player's own voice list after the reopen: the OpenAI Compatible entry with the eleven
  const m = reader._internalReader._readAloudManager;
  const voices = m.allVoices;
  const total = Number(voices?.length) || 0;
  const compat = [];
  for (let i = 0; i < total; i++) {
    const v = Components.utils.waiveXrays(voices[i]);
    if (v && typeof v.id === 'string' && v.id.startsWith('compatible::')) compat.push(v.id.slice('compatible::'.length));
  }
  const eleven = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
  const present = compat.filter((id) => eleven.includes(id));
  out.compatibleUnder404 = { count: compat.length, ids: compat };
  out.elevenPresent = present;
  out.pass = compat.length === 11 && present.length === 11;
  return JSON.stringify(out);
})()
