// Before the install: (1) gate — the profile still holds the build the brief
// names as the "before" state (bundle hash), else stop with nothing touched;
// (2) record the owner's reader (tab, session, voice, saved position, document
// voice) and stop, touching nothing, if its session is PLAYING (active and not
// paused: the owner is listening); (3) close a PAUSED session the one permitted
// way, reader._internalReader.toggleReadAloudPopup(false) (never
// manager.deactivate()), leaving the tab open and never reopening the session —
// a manager that is not active gets no call at all; (4) record the same again,
// then minimize the window for the bridge-only install steps.
// params: ownerItemID, expectedBefore (bundle sha256). state: reads baseline; writes owner.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'pre-install-owner-session' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waive = Components.utils.waiveXrays;
  const sha256Hex = (bytes) => {
    const d = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    d.init(d.SHA256);
    d.update(bytes, bytes.byteLength);
    const raw = d.finish(false);
    let hex = '';
    for (let i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  };

  // (1) The gate: the installed bundle's hash.
  const xpi = Zotero.Profile.dir + '/extensions/zotero-tts@xujialiu.top.xpi';
  const zr = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
  zr.open(Zotero.File.pathToFile(xpi));
  const tmp = PathUtils.join(Zotero.getTempDirectory().path, 'ztts209-before.js');
  zr.extract('content/zotero-tts.js', Zotero.File.pathToFile(tmp));
  zr.close();
  const installedSha = sha256Hex(new Uint8Array(await IOUtils.read(tmp)));
  await IOUtils.remove(tmp);
  out.installedBundleSha256 = installedSha;
  out.expectedBefore = p.expectedBefore;
  out.gate = installedSha === p.expectedBefore;
  if (!out.gate) { out.ok = false; out.stop = 'the installed build is not the expected before-state; nothing touched'; return JSON.stringify(out, null, 1); }

  // (2) The owner's reader before.
  const win = Zotero.getMainWindow();
  const find = () => (Zotero.Reader._readers || []).find((r) => r.itemID === p.ownerItemID) ?? null;
  const reader = find();
  if (!reader) { out.ok = false; out.stop = 'the owner reader is not open'; return JSON.stringify(out, null, 1); }
  const internal = waive(reader._internalReader);
  const m = waive(internal._readAloudManager);
  const rowOf = async () => {
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const row = (pos.readers || []).find((r) => r.itemID === p.ownerItemID) ?? null;
    return { row, rows: pos.database?.rows ?? null };
  };
  const dvOf = () => {
    const dv = JSON.parse(Zotero.ZoteroTTS.diagnostics.documentVoices());
    return { saved: (dv.readers || []).find((r) => r.key === 'user/' + Zotero.Items.get(p.ownerItemID).key)?.saved ?? null };
  };
  const snap = async () => {
    const st = (() => { try { return waive(waive(internal._state).readAloudState); } catch (e) { return null; } })();
    return {
      tabs: (win.Zotero_Tabs._tabs || []).map((t) => t.id), selectedTab: win.Zotero_Tabs.selectedID, readerTab: reader.tabID,
      active: !!m.active, paused: !!m.paused, voice: m.selectedVoiceID ?? null, popupOpen: st ? !!st.popupOpen : null,
      position: await rowOf(), documentVoice: dvOf(),
    };
  };
  out.before = await snap();

  // The owner is listening: stop, nothing touched.
  if (out.before.active && !out.before.paused) { out.ok = false; out.stop = 'the owner session is PLAYING (active, not paused); nothing touched'; return JSON.stringify(out, null, 1); }

  // (3) Close a paused session: the popup, nothing else. No session open, no call.
  out.hadSession = out.before.active;
  if (m.active) {
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 24 && m.active; i++) await sleep(250);
    await sleep(600);
  }
  out.after = await snap();
  out.sessionClosed = !m.active;
  out.tabStillOpen = !!find() && out.after.tabs.includes(reader.tabID);
  state.owner = { itemID: p.ownerItemID, tabID: reader.tabID, before: out.before, afterClose: out.after };

  // (4) Bridge-only steps follow: minimize (restored later for the steps that render).
  try { win.minimize(); } catch (e) { out.minimizeError = String(e); }
  await sleep(500);
  out.windowState = win.windowState;
  out.ok = out.gate && out.sessionClosed && out.tabStillOpen;
  return JSON.stringify(out, null, 1);
})()
