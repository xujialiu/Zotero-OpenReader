// Case item 4, the READ-ONLY controls (the run's scope: no source toggling, no listing, no
// synthesis): the three source switches in one horizontal row with a normal-weight caption,
// their labels and prefs as found, the Voices (Model IDs) field and its caption link to
// fish.audio/app/discovery, the ? help (live tooltip when the window can be OS-active, else the
// icon's help attribute), the absence of a Find Model IDs link / Refresh Fish list button /
// community search panel, Enable/Disable and Test connection following the sources row at the end
// of the Fish section, the Fish Speech heading's github.com/fishaudio/fish-speech link, and the
// layout by measure plus a screenshot of the section. Mutates NOTHING: writes no pref, clicks no
// control; restores the host's minimized state if it had to raise it for the tooltip/screenshot.
// params: tmpDir (fallback root). state: reads runBase.host (optional); writes controlsReadonly.
(async () => {
  const P = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const p = Services.prefs, PRE = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const readers = Zotero.Reader._readers || [];
  for (let i = 0; i < readers.length; i++) {
    if (readers[i]?._internalReader?._readAloudManager?.active) throw new Error('a Read Aloud session is active; close it under the baseline rules first');
  }
  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  if (ps.folder !== false) throw new Error('WebDAV folder must be off (run-level isolation)');

  // Open the pane fresh.
  let w = Services.wm.getMostRecentWindow('zotero:pref');
  if (w) { w.close(); for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100); }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let win = null;
  for (let i = 0; i < 60 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); }
  if (!win) throw new Error('settings window did not open');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 80 && !win.document.getElementById('ztts-provider-fish'); i++) await sleep(100);
  const doc = win.document;
  if (!doc.getElementById('ztts-provider-fish')) throw new Error('pane did not load');

  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const raisedHost = host && host.windowState === host.STATE_MINIMIZED;
  if (raisedHost) { host.restore(); await sleep(800); }
  try {
    // The switches as found (checked, disabled, pref user-value presence). No pref is written.
    const boxes = {};
    for (const n of ['official', 'own', 'manual']) {
      const el = doc.getElementById('ztts-fish-include-' + n);
      boxes[n] = {
        present: !!el, checked: el ? el.checked === true : null, disabled: el ? !!el.disabled : null,
        label: el ? (el.getAttribute('label') || '') : null,
        prefHasUser: p.prefHasUserValue(PRE + 'fish.include' + n[0].toUpperCase() + n.slice(1)),
        prefValue: p.getBoolPref(PRE + 'fish.include' + n[0].toUpperCase() + n.slice(1)),
      };
    }
    out.switches = boxes;
    out.fishEnabledAtRead = p.getBoolPref(PRE + 'fish.enabled');

    // One horizontal row: same top (±3 px), increasing x; caption normal weight.
    const row = doc.getElementById('ztts-fish-sources');
    const caption = row ? row.querySelector('label.ztts-field-label') : null;
    const rects = ['official', 'own', 'manual'].map(n => doc.getElementById('ztts-fish-include-' + n)?.getBoundingClientRect());
    const tops = rects.map(r => (r ? Math.round(r.top) : null));
    out.horizontalRow = {
      rowPresent: !!row,
      tops, sameTop: tops.every(t => t !== null && Math.abs(t - tops[0]) <= 3),
      leftsIncrease: rects.every((r, i) => i === 0 || (rects[i - 1] && r.left > rects[i - 1].left)),
      caption: caption ? (caption.value || caption.textContent) : null,
      captionFontWeight: caption ? win.getComputedStyle(caption).fontWeight : null,
    };

    // The Voices (Model IDs) field and its caption link.
    const ids = doc.getElementById('ztts-fish-model-ids');
    const voicesLabel = doc.querySelector('.ztts-fish-voices-label');
    const link = voicesLabel ? voicesLabel.querySelector('label[is="zotero-text-link"], a[href]') : null;
    const voicesVal = String(p.getStringPref(PRE + 'fish.voices') || '');
    const idCount = voicesVal ? voicesVal.split(/[\s,]+/).filter(s => s.length > 0).length : 0;
    out.voicesField = {
      present: !!ids, disabled: ids ? !!ids.disabled : null,
      placeholder: ids ? (ids.placeholder || ids.getAttribute('placeholder')) : null,
      caption: voicesLabel ? voicesLabel.textContent : null,
      captionLinkHref: link ? link.getAttribute('href') : null,
      savedVoicesIdCount: idCount, savedVoicesLen: voicesVal.length,
    };

    // The ? help: live tooltip when the window can be OS-active, else the icon's help attribute.
    const icon = doc.querySelector('label.ztts-help[data-l10n-id="ztts-help-fish-model-ids"]');
    const tip = doc.getElementById('ztts-help-tip');
    let hover = { iconPresent: !!icon, tooltipPresent: !!tip, attempted: false };
    if (icon && tip) {
      try {
        win.focus();
        await sleep(200);
        if (Services.focus.activeWindow === win) {
          hover.attempted = true;
          icon.scrollIntoView({ block: 'center' });
          await sleep(300);
          const r = icon.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const wu = win.windowUtils;
          wu.sendMouseEvent('mousemove', Math.max(2, cx - 30), cy, 0, 0, 0, false, 0, 0, false, false);
          await sleep(120);
          wu.sendMouseEvent('mousemove', cx, cy, 0, 0, 0, false, 0, 0, false, false);
          await sleep(120);
          wu.sendMouseEvent('mousemove', cx, cy + 1, 0, 0, 0, false, 0, 0, false, false);
          let seen = 'closed';
          for (let i = 0; i < 20; i++) { await sleep(100); if (tip.state !== 'closed') { seen = tip.state; break; } }
          hover.tipState = seen;
          hover.label = tip.getAttribute('label') || (tip.firstChild ? tip.textContent.slice(0, 300) : '');
          hover.includesDiscovery = /fish\.audio\/app\/discovery/.test(hover.label || '');
          hover.explainsModelId = /Model ID/.test(hover.label || '') && /voice/i.test(hover.label || '');
          // Leave the element: park on a blank spot of the pane.
          wu.sendMouseEvent('mousemove', 12, 80, 0, 0, 0, false, 0, 0, false, false);
          await sleep(300);
          hover.closedAfterLeave = tip.state === 'closed';
        } else {
          hover.reason = 'window could not become OS-active (host minimized)';
        }
      } catch (e) { hover.error = String(e && e.message || e); }
    }
    if (!hover.label && icon) {
      hover.helpAttribute = icon.getAttribute('help') || null;
      hover.includesDiscovery = /fish\.audio\/app\/discovery/.test(hover.helpAttribute || '');
      hover.explainsModelId = /Model ID/.test(hover.helpAttribute || '') && /voice/i.test(hover.helpAttribute || '');
    }
    out.help = hover;

    // Absent controls: no Find Model IDs link, no Refresh Fish list button, no community panel.
    const section = doc.getElementById('ztts-provider-fish');
    const texts = [];
    const walk = el => { for (const c of el.children) { texts.push((c.textContent || '').toLowerCase()); walk(c); } };
    walk(section);
    const joined = texts.join(' | ');
    out.absentControls = {
      findModelIdsLink: !/find model ids/i.test(joined),
      refreshFishListButton: !Array.from(section.querySelectorAll('button')).some(b => /refresh/i.test(b.textContent || '')) && !/refresh fish/i.test(joined),
      communitySearchPanel: !doc.querySelector('[data-l10n-id*="community"], #ztts-fish-community') && !/community search/i.test(joined),
    };

    // Enable/Disable and Test connection follow the sources row (end of the Fish section).
    const enableBtn = doc.getElementById('ztts-enable-fish'), testBtn = doc.getElementById('ztts-test-fish');
    out.order = {
      sourcesBeforeEnable: !!(row.compareDocumentPosition(enableBtn) & Node.DOCUMENT_POSITION_FOLLOWING),
      sourcesBeforeTest: !!(row.compareDocumentPosition(testBtn) & Node.DOCUMENT_POSITION_FOLLOWING),
      resultLineAfterTest: !!(testBtn.compareDocumentPosition(doc.getElementById('ztts-test-result-fish')) & Node.DOCUMENT_POSITION_FOLLOWING),
      sectionIsGroupbox: section.localName,
    };

    // The Local (Fish Speech) heading names the repository.
    const speechH2 = doc.querySelector('#ztts-provider-fishspeech h2, #ztts-provider-fishspeech label');
    const speechLink = doc.querySelector('#ztts-provider-fishspeech a[href], #ztts-provider-fishspeech label[is="zotero-text-link"]');
    out.localHeading = {
      text: speechH2 ? speechH2.textContent.trim().slice(0, 120) : null,
      linkHref: speechLink ? speechLink.getAttribute('href') : null,
      hasGithubFishSpeech: (speechLink ? speechLink.getAttribute('href') : '').includes('github.com/fishaudio/fish-speech'),
    };

    // Layout by measure: the section fits the pane's content width (no horizontal overflow).
    const pane = doc.getElementById('zotero-tts-pane') || doc.querySelector('.pane-content') || doc.documentElement;
    out.layout = {
      sectionRight: Math.round(section.getBoundingClientRect().right),
      paneClientWidth: pane.clientWidth, paneScrollWidth: pane.scrollWidth,
      noHorizontalOverflow: pane.scrollWidth <= pane.clientWidth + 1,
      windowWidth: win.innerWidth,
    };

    // Screenshot of the Fish section for the by-eye check (drawSnapshot is async; the canvas is
    // sized from the rect x scale, as secret-fields 05 does).
    try {
      const r = section.getBoundingClientRect();
      const rect = new win.DOMRect(Math.max(0, r.left), Math.max(0, r.top), r.width, r.height);
      const image = await win.browsingContext.currentWindowGlobal.drawSnapshot(rect, 2, 'rgb(255,255,255)');
      const canvas = new win.OffscreenCanvas(rect.width * 2, rect.height * 2);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      const base = P.tmpDir || PathUtils.join(P.root || '', '.tmp', 'zotero-dev');
      const dir = PathUtils.join(base, 'fish-voice-sources');
      await IOUtils.makeDirectory(dir, { createAncestors: true });
      out.screenshot = PathUtils.join(dir, 'fish-section.png');
      await IOUtils.write(out.screenshot, buf);
      out.screenshotBytes = buf.length;
    } catch (e) { out.screenshotError = String(e && e.message || e); }
  } finally {
    // Nothing was written; only the window and the host state are put back.
    out.settingsClosed = await (async () => {
      let cw = Services.wm.getMostRecentWindow('zotero:pref');
      if (cw) { cw.close(); for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100); }
      return !Services.wm.getMostRecentWindow('zotero:pref');
    })();
    if (raisedHost && host && !host.closed) { host.minimize(); await sleep(500); }
    out.hostMinimizedAgain = host ? host.windowState === host.STATE_MINIMIZED : null;
  }
  const sw = out.switches, hr = out.horizontalRow, vf = out.voicesField, hp = out.help, ab = out.absentControls, od = out.order, lh = out.localHeading, lo = out.layout;
  out.ok = sw.official.present && sw.own.present && sw.manual.present && hr.rowPresent && hr.sameTop && hr.leftsIncrease
    && hr.captionFontWeight === '400' && vf.present && vf.captionLinkHref === 'https://fish.audio/app/discovery/'
    && (hp.includesDiscovery === true && hp.explainsModelId === true)
    && ab.findModelIdsLink && ab.refreshFishListButton && ab.communitySearchPanel
    && od.sourcesBeforeEnable && od.sourcesBeforeTest && od.resultLineAfterTest
    && lh.hasGithubFishSpeech && lo.noHorizontalOverflow && out.settingsClosed === true;
  out.status = out.ok ? 'PASS' : 'CHECK';
  state.controlsReadonly = { status: out.status, ok: out.ok };
  return JSON.stringify(out, null, 1);
})()
