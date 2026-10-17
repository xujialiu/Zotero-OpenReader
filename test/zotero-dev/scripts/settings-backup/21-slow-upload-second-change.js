// Item 6.21 (issue #204, 1.16.12-beta): a change made during a slow upload
// still goes up. Against the webdav-shutdown kit's stub, in hold mode (each
// PUT held 14 s before its 201), folder Enabled on the stub and the settings
// auto-upload on: change readAloud.speedPercent at t=0 (the PUT starts about
// 10 s later and is held 14 s), change readAloud.sentenceDelayMs at about
// 13 s, inside the hold. Expected: a second PUT of the machine settings file
// starting within a second of the first one's answer (gap ≈ 14 s in the
// stub's log), its body holding the second change; autoUpload.uploads +2,
// pending false, lastOutcome ok; no third PUT in the next 2 minutes.
// Params: stubPort, stubLog. The setup's own PUT (the webdav.* writes arm
// the auto-upload too) is settled by a fixed 45 s wait before t=0.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'slow-upload-second-change' };
  const full = (k) => 'extensions.zotero.zotero-tts.' + k;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stubUrl = state.stubUrl || `http://127.0.0.1:${P.stubPort}/dav/`;
  try {
    // Hold mode: each PUT answers 201 after 14 s.
    const ctl = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=hold&hold=14`, { timeout: 3000 });
    out.control = JSON.parse(ctl.responseText);

    // The pane, on the plugin pane; folder off, URL at the stub, Enable.
    // ALWAYS close and reopen: a window left open across an in-place
    // reinstall keeps the old pane, whose listeners point into the nuked
    // scope (§1).
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win) { win.close(); const tw = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tw < 3000) await sleep(100); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const t1 = Date.now();
    while (Date.now() - t1 < 8000) {
      await sleep(150);
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.Zotero_Preferences) {
        try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch { /* a beat */ }
        if (win.document.getElementById('ztts-webdav-enable')) break;
      }
    }
    if (!win || !win.document.getElementById('ztts-webdav-enable')) throw new Error('pane never became ready');
    const doc = win.document;
    const toggle = doc.getElementById('ztts-webdav-enable');
    if (Zotero.Prefs.get(full('webdav.enabled'), true) === true) {
      toggle.click();
      const t2 = Date.now();
      while (Date.now() - t2 < 5000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== false) await sleep(100);
    }
    Zotero.Prefs.set(full('webdav.url'), stubUrl, true);
    await sleep(300);
    toggle.click();
    const t3 = Date.now();
    while (Date.now() - t3 < 10000 && Zotero.Prefs.get(full('webdav.enabled'), true) !== true) await sleep(100);
    out.enabledOnStub = Zotero.Prefs.get(full('webdav.enabled'), true) === true;
    Zotero.Prefs.set(full('webdav.autoUploadSettings'), true, true);
    Zotero.Prefs.set(full('webdav.syncSettings'), false, true);
    Zotero.Prefs.set(full('webdav.syncPositions'), false, true);

    // Settle the setup's own auto-upload PUT (debounce 10 s + hold 14 s).
    const readLog = async () => { try { return (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean); } catch { return []; } };
    await sleep(45000);
    const up0 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    out.uploadsAfterSettle = up0.autoUpload?.uploads;
    out.pendingAfterSettle = up0.autoUpload?.pending;
    const baseCount = (await readLog()).length;
    out.logCountAtT0 = baseCount;

    // t=0: change one settings pref.
    const sp0 = Zotero.Prefs.get(full('readAloud.speedPercent'), true);
    const t0 = Date.now();
    const sp1 = (typeof sp0 === 'number' ? sp0 : 100) + 1;
    Zotero.Prefs.set(full('readAloud.speedPercent'), sp1, true);
    state.triggerSpeed = { before: sp0, planted: sp1 };
    out.change1 = { pref: 'readAloud.speedPercent', from: sp0, to: sp1 };

    // About 13 s in, while the PUT is held: a second change.
    await sleep(Math.max(0, 13000 - (Date.now() - t0)));
    const sd0 = Zotero.Prefs.get(full('readAloud.sentenceDelayMs'), true);
    const sd1 = (typeof sd0 === 'number' ? sd0 : 0) + 500;
    Zotero.Prefs.set(full('readAloud.sentenceDelayMs'), sd1, true);
    state.triggerDelay = { before: sd0, planted: sd1 };
    out.change2 = { pref: 'readAloud.sentenceDelayMs', from: sd0, to: sd1, atMs: Date.now() - t0 };

    // Wait for the second PUT (first answer ≈ t+24 s; second PUT right after).
    let segment = [];
    const t4 = Date.now();
    while (Date.now() - t4 < 40000) {
      await sleep(1000);
      segment = (await readLog()).slice(baseCount).map((l) => JSON.parse(l));
      const puts = segment.filter((e) => e.method === 'PUT' && /zotero-tts-settings_/.test(e.path));
      if (puts.length >= 2) break;
    }
    segment = (await readLog()).slice(baseCount).map((l) => JSON.parse(l));
    out.segment = segment.map((e) => ({ t: e.t, iso: e.iso, method: e.method, file: e.path.split('/').pop(), body: e.body }));
    const puts = segment.filter((e) => e.method === 'PUT' && /zotero-tts-settings_/.test(e.path));
    out.put1At = puts[0] ? { iso: puts[0].iso, offsetMs: puts[0].t - t0, body: puts[0].body } : null;
    out.put2At = puts[1] ? { iso: puts[1].iso, offsetMs: puts[1].t - t0, body: puts[1].body } : null;
    out.putGapMs = puts.length >= 2 ? puts[1].t - puts[0].t : null;

    // The bodies: the first holds change 1 only, the second both changes.
    const readBody = async (rel) => rel ? JSON.parse(await IOUtils.readUTF8(P.stubLog.replace('/requests.log', '/') + rel)) : null;
    const b1 = await readBody(puts[0]?.body);
    const b2 = await readBody(puts[1]?.body);
    out.body1 = b1 ? { speedPercent: b1.settings['readAloud.speedPercent'], sentenceDelayMs: b1.settings['readAloud.sentenceDelayMs'] } : null;
    out.body2 = b2 ? { speedPercent: b2.settings['readAloud.speedPercent'], sentenceDelayMs: b2.settings['readAloud.sentenceDelayMs'] } : null;
    out.body1HasChange1Only = !!b1 && b1.settings['readAloud.speedPercent'] === sp1 && b1.settings['readAloud.sentenceDelayMs'] === sd0;
    out.body2HasBoth = !!b2 && b2.settings['readAloud.speedPercent'] === sp1 && b2.settings['readAloud.sentenceDelayMs'] === sd1;

    // The stats.
    const up1 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    out.stats = { uploads: up1.autoUpload?.uploads, pending: up1.autoUpload?.pending, lastOutcome: up1.autoUpload?.lastOutcome, lastName: up1.autoUpload?.lastName };
    out.uploadsUpBy2 = up1.autoUpload?.uploads === (out.uploadsAfterSettle ?? 0) + 2;

    // No third PUT in the next 2 minutes.
    await sleep(Math.max(0, 120000 - (Date.now() - t4)));
    const after = (await readLog()).slice(baseCount).map((l) => JSON.parse(l));
    out.entriesInQuietWindow = after.map((e) => ({ iso: e.iso, method: e.method, file: e.path.split('/').pop() }));
    out.thirdPut = after.some((e) => e.method === 'PUT' && /zotero-tts-settings_/.test(e.path));

    out.ok = out.enabledOnStub && out.putGapMs !== null && out.putGapMs <= 15000 && out.putGapMs >= 13000
      && out.body1HasChange1Only && out.body2HasBoth && out.uploadsUpBy2
      && out.stats.pending === false && out.stats.lastOutcome === 'ok' && !out.thirdPut;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
