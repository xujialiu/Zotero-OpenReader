// Item 2: the voice list. Opens the voice picker (a click on the voice
// button in the frame), then: every Zotero voice's row is .option.has-time
// with a .option-label and a .time-left, the .time-left right edges are
// equal across rows (right-aligned; compared within 0.5 px), each .time-left
// text is that row voice's `time` from the snapshot, and a row without a
// time (a plugin voice, if the language lists one) has no .time-left. The
// picker is closed again with a second click on the voice button (its own
// toggle); no option row is ever clicked (a row selects on pointerup).
// params: none. state: reads itemID/pickedVoice; writes item2.
(async () => {
  const out = { step: 'voice-list-rows' };
  const S = Zotero.__zttsTimeLeft140;
  if (!S || !S.pickedVoice) throw new Error('run state missing -- t0 did not run');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (test, timeout = 8000, step = 120) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(step); }
    return test();
  };
  try {
    const diagnostics = Zotero.ZoteroTTS.diagnostics;
    const readerOf = (id) => { const l = Zotero.Reader._readers || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].itemID === id) return l[i]; return null; };
    const reader = readerOf(S.itemID);
    if (!reader) throw new Error('fixture reader gone');
    const doc = reader._iframeWindow.document;
    const frame = doc.getElementById('ztts-player-frame');
    if (!frame || frame.hidden) throw new Error('the player frame is hidden');
    const fdoc = frame.contentDocument;

    const diag = JSON.parse(await diagnostics.pluginPlayer());
    const rows = diag.readers || [];
    const openRows = rows.filter((r) => r && r.open);
    const entry = openRows.find((r) => r.state && r.state.voice === S.pickedVoice.id) || openRows[0] || null;
    if (!entry) throw new Error('no open player entry');
    const snapVoices = entry.state.voices || [];
    const byLabel = {};
    for (let i = 0; i < snapVoices.length; i++) byLabel[snapVoices[i].label] = snapVoices[i];
    out.snapshotVoices = snapVoices.length;

    // --- Open the picker. ---
    const btn = fdoc.querySelector('[data-pick="voice"]');
    if (!btn) throw new Error('voice picker button missing');
    btn.click();
    const list = await waitFor(() => {
      const pop = fdoc.querySelector('.popover.picker-popover');
      const l = pop && pop.querySelector('.option-list');
      return l && l.children.length ? l : null;
    }, 8000);
    if (!list) throw new Error('the voice picker popover never opened');
    out.pickerOpened = true;

    // --- Walk the rows by index. ---
    const rowNodes = list.querySelectorAll('.option-row');
    const details = [];
    const rightEdges = [];
    let hasTimeRows = 0, noTimeRows = 0, textMismatches = [];
    for (let i = 0; i < rowNodes.length; i++) {
      const option = rowNodes[i].querySelector('.option');
      if (!option) continue;
      const isHasTime = option.classList.contains('has-time');
      const labelEl = option.querySelector('.option-label');
      const timeEl = option.querySelector('.time-left');
      if (isHasTime) {
        hasTimeRows++;
        const label = labelEl ? labelEl.textContent : null;
        const timeText = timeEl ? timeEl.textContent : null;
        const r = timeEl ? timeEl.getBoundingClientRect() : null;
        if (r) rightEdges.push(+r.right.toFixed(2));
        const snap = label != null ? byLabel[label] : null;
        const ok = !!snap && snap.time === timeText && !!timeEl && !!labelEl;
        if (!ok) textMismatches.push({ label, timeText, snapshotTime: snap ? (snap.time ?? null) : '(label not in snapshot)' });
        details.push({ hasTime: true, label, time: timeText, title: option.getAttribute('title'), matchesSnapshot: ok });
      } else {
        noTimeRows++;
        details.push({ hasTime: false, label: option.textContent, hasTimeLeftSpan: !!timeEl, title: option.getAttribute('title') });
      }
    }
    out.rows = { total: details.length, hasTimeRows, noTimeRows };
    out.rowSample = details.slice(0, 6);
    out.rowTail = details.slice(-3);
    const maxRight = rightEdges.length ? Math.max(...rightEdges) : null;
    const minRight = rightEdges.length ? Math.min(...rightEdges) : null;
    out.rightEdges = { count: rightEdges.length, min: minRight, max: maxRight, spreadPx: rightEdges.length ? +(maxRight - minRight).toFixed(2) : null };
    out.rightEdgesEqual = rightEdges.length > 1 && maxRight - minRight <= 0.5;
    out.allHasTimeTextsMatchSnapshot = textMismatches.length === 0;
    out.textMismatches = textMismatches.slice(0, 5);

    // --- Close the picker again (the voice button toggles its own popover). ---
    btn.click();
    const closed = await waitFor(() => !fdoc.querySelector('.popover.picker-popover'), 4000);
    out.pickerClosed = !!closed;
    if (!closed) { const pop = fdoc.querySelector('.popover'); if (pop) pop.remove(); out.pickerClosedForced = true; }
    await sleep(150);
    out.status = 'PASS';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
