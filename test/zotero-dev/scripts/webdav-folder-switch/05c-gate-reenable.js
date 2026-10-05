// Item 5c: Enable again — within a few seconds the transport runs with
// trigger 'switch-on'. Polls at 25 ms to catch the 'Checking…' transient
// item 4's 100 ms poll missed. Then restores the isolation: the positions
// sync back off, the other switches stay suspended.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'gate-reenable' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window closed');
    const doc = win.document;
    const enable = doc.getElementById('ztts-webdav-enable');
    const snap = () => ({ t: Date.now() % 100000, label: enable.getAttribute('label'), line: doc.getElementById('ztts-webdav-message')?.textContent ?? null, enabled: Zotero.Prefs.get(full('webdav.enabled'), true) });
    const trace = [snap()];
    enable.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await sleep(25);
      const s = snap();
      const last = trace[trace.length - 1];
      if (s.label !== last.label || s.line !== last.line || s.enabled !== last.enabled) trace.push(s);
      if (s.enabled === true) break;
    }
    out.trace = trace;

    // The switch-on poke: the transport runs within a few seconds.
    let trigger = null;
    for (let i = 0; i < 24; i++) {
      await sleep(250);
      const p = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      if (p.transport?.lastTrigger === 'switch-on' && !p.transport?.running) { trigger = p.transport; break; }
      if (i === 23) trigger = p.transport;
    }
    out.switchOn = { lastTrigger: trigger?.lastTrigger ?? null, lastOutcome: trigger?.lastOutcome ?? null, syncs: trigger?.syncs ?? null, lastError: trigger?.lastError ?? null };
    const shared = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared;
    out.sharedAfter = { lastTrigger: shared?.transport?.lastTrigger ?? null, lastOutcome: shared?.transport?.lastOutcome ?? null };

    // Isolation back: positions sync off (the folder observer fires but the gate holds it).
    Zotero.Prefs.set(full('webdav.syncPositions'), false, true);
    await sleep(600);
    const pos = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.isolationRestored = {
      syncPositions: Zotero.Prefs.get(full('webdav.syncPositions'), true),
      syncSettings: Zotero.Prefs.get(full('webdav.syncSettings'), true),
      autoUpload: Zotero.Prefs.get(full('webdav.autoUploadSettings'), true),
      folder: pos.folder, enabled: pos.enabled, quiet: !pos.transport?.running && !pos.shared?.transport?.running,
    };
    out.ok = out.switchOn.lastTrigger === 'switch-on' && out.switchOn.lastOutcome === 'ok'
      && out.isolationRestored.syncPositions === false && out.isolationRestored.folder === true;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
