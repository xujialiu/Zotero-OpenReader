// What each sentence's DOM range holds in the live reader, and what the rule of
// src/read-aloud/range-text.ts (rangeParts / rangeSpells, 1.16.16-beta5) makes of
// it. For each segment index: the Segment text Zotero spells, range.toString()
// and whether it alone equals the Segment (normalized), the range's nodes (every
// child of its common ancestor with intersectsNode and — for an <img> — its alt,
// aria-label, class and the first characters of src), then a chrome-side replay
// of the rule: the range's parts in document order (each covered text slice, '\n'
// for a <br>, a gap for an <img>), the text pieces between the gaps, each
// normalized (NFC, white space collapsed, trimmed), and whether the pieces appear
// in the normalized Segment text in order, the first at its start and the last at
// its end, anything in the gaps; a range with no text outside its gaps matches
// nothing. `replayMatches` is that verdict; compare it with what the plugin drew
// (30's primaryShown / sentencePieces). A segment whose selector resolves to nothing is listed under
// `unresolved` and left out of `allReplayMatch`. Read-only.
// params: which, indices. state: reads readers[which].
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'range-dom-probe', which: p.which, segments: [] };
  const waive = Components.utils.waiveXrays;
  const normText = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const rd = state.readers?.[p.which];
  const reader = rd ? (Zotero.Reader._readers || []).find((r) => r.itemID === rd.itemID) : null;
  if (!reader) throw new Error('reader not open: ' + p.which);
  const internal = waive(reader._internalReader);
  const view = waive(internal._activePrimaryView || internal._primaryView);
  const segs = waive(internal._readAloudSegments.segments);

  // rangeParts, replayed: strings for text and <br>, null for an <img>.
  const IMAGE = null;
  const partsOf = (range) => {
    const start = range.startContainer, end = range.endContainer;
    const parts = [];
    const visit = (node) => {
      const type = node?.nodeType;
      if (type === 3) {
        if (node !== start && node !== end && !range.intersectsNode(node)) return;
        const data = String(node.data ?? '');
        parts.push(data.slice(node === start ? range.startOffset : 0, node === end ? range.endOffset : data.length));
        return;
      }
      if (type !== 1 || !range.intersectsNode(node)) return;
      const name = String(node.localName ?? '').toLowerCase();
      if (name === 'br') { parts.push('\n'); return; }
      if (name === 'img') { parts.push(IMAGE); return; }
      const kids = node.childNodes;
      for (let i = 0; i < (kids?.length ?? 0); i++) visit(kids[i]);
    };
    visit(range.commonAncestorContainer);
    return parts;
  };
  // The text pieces between the gaps, normalized.
  const piecesOf = (parts) => {
    const pieces = [''];
    for (const part of parts) { if (part === IMAGE) pieces.push(''); else pieces[pieces.length - 1] += part; }
    return pieces.map(normText);
  };
  // rangeSpells, replayed: first piece at the start, last at the end, the others in order between, anything in the gaps.
  const spells = (texts, expected) => {
    if (texts.length === 1) return texts[0] === expected;
    if (!texts.some((t) => t)) return false;
    const first = texts[0], last = texts[texts.length - 1];
    const end = expected.length - last.length;
    if (!expected.startsWith(first) || !expected.endsWith(last) || end < first.length) return false;
    let at = first.length;
    for (let i = 1; i < texts.length - 1; i++) {
      const found = expected.indexOf(texts[i], at);
      if (found < 0 || found + texts[i].length > end) return false;
      at = found + texts[i].length;
    }
    return true;
  };

  for (const idx of p.indices) {
    const seg = waive(segs[idx]);
    const expected = normText(seg.text);
    const info = { index: idx, segment: String(seg.text) };
    try {
      const range = waive(view.toDisplayedRange(seg.sourcePosition));
      if (!range) { info.unresolved = true; out.segments.push(info); continue; } // e.g. the snapshot's last <p>: the selector resolves to nothing
      info.toString = String(range.toString());
      info.toStringEqualsSegment = normText(info.toString) === expected;
      const parts = partsOf(range);
      info.parts = parts.map((x) => (x === IMAGE ? '[IMG]' : x));
      info.imageGaps = parts.filter((x) => x === IMAGE).length;
      info.pieces = piecesOf(parts);
      info.replayMatches = spells(info.pieces, expected);
      const root = range.commonAncestorContainer;
      info.commonAncestor = String(root.localName ?? root.nodeName);
      info.children = [];
      const kids = root.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        const d = { type: c.nodeType, intersects: !!range.intersectsNode(c) };
        if (c.nodeType === 3) d.data = String(c.data).slice(0, 60);
        if (c.nodeType === 1) {
          d.name = String(c.localName);
          if (d.name === 'img') {
            d.alt = c.getAttribute('alt');
            d.ariaLabel = c.getAttribute('aria-label');
            d.class = c.getAttribute('class');
            d.src = String(c.getAttribute('src') ?? '').slice(0, 24);
          }
        }
        info.children.push(d);
      }
    } catch (e) {
      info.error = String(e);
    }
    out.segments.push(info);
  }
  out.unresolved = out.segments.filter((s) => s.unresolved).map((s) => s.index);
  out.allReplayMatch = out.segments.filter((s) => !s.unresolved).every((s) => s.replayMatches === true);
  return JSON.stringify(out, null, 1);
})()
