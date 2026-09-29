// Item 1: the voice button's time left. Reads the player's inspect() state
// (diagnostics.pluginPlayer()): every Zotero voice (no '::' in its id) lists
// `time` (its minutesRemaining rounded up, the plugin's OWN form since beta5:
// '26min') and `low`; plugin voices neither; the player's `alert` field is
// GONE since beta5 (the auto-opened alert was removed — asserted absent).
// The expected strings are computed from the voice's own provider figure
// (premiumCreditsRemaining / its creditsPerMinute, ceil) with the kit's
// fmtMinutes (ztts-duration-*), cross-checked against
// diagnostics.zoteroTiers()'s credits.premium. In the frame: the voice
// button's .time-left shown with the same text, sitting AFTER .value and its
// right edge 6 px (the picker's gap) left of the .chevron, and the button's
// title 'Voice: Premium Voice 1 · 26min'. A 30-credit voice ('Premium Voice
// 5' in en-US) reads the dearest price's time. The window is already restored
// by t0 (the player mounts only in the selected tab).
// params: none. state: reads itemID/pickedVoice; writes item1.
(async () => {
  const out = { step: 'voice-button-time' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.pickedVoice) throw new Error('run state missing -- t0 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtMinutes = S.fmtMinutes;
  try {
    const diagnostics = Zotero.ZoteroTTS.diagnostics;
    const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
    const reader = readerOf(S.itemID);
    if (!reader) throw new Error('fixture reader gone');
    const host = Services.wm.getMostRecentWindow('navigator:browser');
    out.hostRestored = host ? host.windowState !== 2 : 'no host';
    out.tabSelected = host && host.Zotero_Tabs ? host.Zotero_Tabs.selectedID === S.tabID : null;

    // --- The snapshot. ---
    const diag = JSON.parse(await diagnostics.pluginPlayer());
    const rows = diag.readers || [];
    const openRows = rows.filter((r) => r && r.open);
    out.openEntries = openRows.length;
    const entry = openRows.length === 1 ? openRows[0] : rows.find((r) => r && r.open && r.state && r.state.voice === (S.pickedVoice.id)) || null;
    if (!entry) throw new Error('no open player entry for the fixture');
    const state = entry.state;
    out.state = {
      provider: state.provider, locale: state.locale, voice: state.voice,
      alertFieldPresent: !!(state && Object.prototype.hasOwnProperty.call(state, 'alert')),
      error: state.error ?? null, playing: state.playing, active: state.active,
    };
    out.alertFieldAbsent = !out.state.alertFieldPresent;

    // --- Voices: Zotero rows carry time+low, plugin rows neither. ---
    const voices = state.voices || [];
    out.voiceCount = voices.length;
    const pluginRow = [];
    let zoteroRows = 0, zoteroRowsOk = 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const isZotero = !String(v.value).includes('::');
      if (isZotero) {
        zoteroRows++;
        if (typeof v.time === 'string' && v.time !== '' && typeof v.low === 'boolean') zoteroRowsOk++;
      } else {
        pluginRow.push({ label: v.label, time: v.time ?? null, low: v.low ?? null });
      }
    }
    out.voiceRows = { zoteroRows, zoteroRowsOk, pluginRows: pluginRow };
    out.allZoteroRowsCarryTime = zoteroRows > 0 && zoteroRowsOk === zoteroRows;

    // --- The selected voice and its own figure. ---
    const selected = voices.find((v) => v.value === state.voice) || null;
    if (!selected) throw new Error('selected voice not in the list');
    const m = reader._internalReader._readAloudManager;
    let sourceVoice = null;
    const list = m ? m.voicesForLanguage : null;
    const srcRows = [];
    for (let i = 0; i < (list ? list.length : 0); i++) {
      const v = list[i];
      try {
        const w = Components.utils.waiveXrays(v);
        const prov = w.provider ? Components.utils.waiveXrays(w.provider) : null;
        const row = {
          id: String(w.id), label: String(w.label ?? w.name ?? w.id),
          creditsPerMinute: typeof w.creditsPerMinute === 'number' ? w.creditsPerMinute : null,
          minutesRemaining: typeof w.minutesRemaining === 'number' ? w.minutesRemaining : null,
          premium: prov ? (typeof prov.premiumCreditsRemaining === 'number' ? prov.premiumCreditsRemaining : null) : null,
          standard: prov ? (typeof prov.standardCreditsRemaining === 'number' ? prov.standardCreditsRemaining : null) : null,
        };
        srcRows.push(row);
        if (row.id === state.voice && !sourceVoice) sourceVoice = row;
      } catch (e) {
        srcRows.push({ id: String(v && v.id), error: String(e) });
      }
    }
    out.sourceRows = srcRows;
    if (!sourceVoice) throw new Error('the selected voice was not found in voicesForLanguage');
    const expectedSelected = sourceVoice.minutesRemaining !== null ? fmtMinutes(sourceVoice.minutesRemaining) : null;
    out.selectedVoice = {
      label: selected.label, time: selected.time ?? null, low: selected.low ?? null,
      expectedTime: expectedSelected, timeMatchesOwnFigure: selected.time === expectedSelected,
      lowFalse: selected.low === false,
      premiumCredits: sourceVoice.premium, creditsPerMinute: sourceVoice.creditsPerMinute,
    };

    // --- A 30-credit voice ('Premium Voice 5' in en-US) reads the dearest price's time. ---
    const dearest = srcRows.filter((r) => r.creditsPerMinute != null).map((r) => r.creditsPerMinute);
    const dearestPrice = dearest.length ? Math.max(...dearest) : null;
    const pv5 = voices.find((v) => v.label === 'Premium Voice 5') || null;
    const pv5Source = pv5 ? srcRows.find((r) => r.id === pv5.value) || null : null;
    out.dearestVoice = {
      label: pv5 ? pv5.label : null, time: pv5 ? (pv5.time ?? null) : null,
      expectedTime: pv5Source && pv5Source.minutesRemaining != null ? fmtMinutes(pv5Source.minutesRemaining) : null,
      creditsPerMinute: pv5Source ? pv5Source.creditsPerMinute : null,
      dearestPriceSeen: dearestPrice,
    };
    out.dearestVoiceTimeOk = !!pv5 && !!pv5Source && pv5.time === fmtMinutes(pv5Source.minutesRemaining) && pv5Source.creditsPerMinute === dearestPrice;

    // --- Cross-check the account figure with the diagnostic. ---
    const zt = JSON.parse(await diagnostics.zoteroTiers());
    S.tiersPremiumCredits = zt.credits && zt.credits.premium ? zt.credits.premium.credits : null;
    out.accountFigure = {
      tiersPremiumCredits: S.tiersPremiumCredits,
      providerPremiumCredits: sourceVoice.premium,
      tiersText: zt.credits && zt.credits.premium ? zt.credits.premium.text : null,
      expectedFromProvider: sourceVoice.premium != null ? fmtMinutes(sourceVoice.premium / sourceVoice.creditsPerMinute) : null,
    };

    // --- The frame: the voice button's .time-left. ---
    const doc = reader._iframeWindow.document;
    const frame = doc.getElementById('ztts-player-frame');
    if (!frame || frame.hidden) throw new Error('the player frame is hidden');
    const fdoc = frame.contentDocument;
    const btn = fdoc.querySelector('[data-pick="voice"]');
    if (!btn) throw new Error('voice picker button missing');
    const value = btn.querySelector('.value');
    const time = btn.querySelector('.time-left');
    const chevron = btn.querySelector('.chevron');
    if (!value || !time || !chevron) throw new Error('voice button parts missing');
    const order = [value, time, chevron].map((el) => Array.prototype.indexOf.call(btn.children, el));
    out.buttonOrder = { valueIndex: order[0], timeIndex: order[1], chevronIndex: order[2], afterValue: order[1] > order[0] && order[2] > order[1] };
    const rect = (el) => { const r = el.getBoundingClientRect(); return { left: +r.left.toFixed(2), right: +r.right.toFixed(2), w: +r.width.toFixed(2) }; };
    const timeRect = rect(time), chevRect = rect(chevron), valueRect = rect(value);
    const gap = +(chevRect.left - timeRect.right).toFixed(2);
    out.geometry = { value: valueRect, time: timeRect, chevron: chevRect, gapChevronLeftMinusTimeRight: gap, gapIsSixPx: Math.abs(gap - 6) <= 0.5 };
    out.frameTimeLeft = {
      hidden: time.hidden === true, text: time.textContent,
      matchesSnapshot: time.textContent === selected.time,
      computedColor: fdoc.defaultView.getComputedStyle(time).color,
    };
    out.buttonTitle = { title: btn.getAttribute('title'), expected: `Voice: ${selected.label} · ${selected.time}`, matches: btn.getAttribute('title') === `Voice: ${selected.label} · ${selected.time}` };
    out.valueLabel = { text: value.textContent, matches: value.textContent === selected.label };

    S.item1 = {
      voice: state.voice, label: selected.label, time: selected.time, low: selected.low,
      providerPremiumCredits: sourceVoice.premium, providerStandardCredits: sourceVoice.standard,
      grayColor: out.frameTimeLeft.computedColor,
      tiersPremiumCredits: S.tiersPremiumCredits,
    };
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
