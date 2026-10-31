// What each sentence's DOM range holds in the live reader, and what the walk of
// src/read-aloud/range-text.ts (segmentTextOf) makes of it. For each segment index:
// the Segment text Zotero spells, range.toString(), the range's boundary nodes,
// every child of its common ancestor with intersectsNode and — for an element —
// its alt, aria-label, class and the first characters of src, then a chrome-side
// replay of the same walk (same rules, same image-text rule) and whether its
// normalized result equals the normalized Segment text. A difference between the
// replay and the Segment text names the node that causes it. A second replay,
// `walkIgnoringReaderLabel`, skips the aria-label of an image the EPUB view has
// decorated (class clickable-image, aria-label "Zoom In": reader.js 55593-55600 of
// Zotero 10.0.6) and reads its alt instead — it shows what the live DOM can still
// give back and what it cannot. Read-only.
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

  // The walk and the image-text rule of range-text.ts, replayed.
  const imageText = (img) => {
    const label = String(img.getAttribute('aria-label') ?? '').trim();
    if (label) return label;
    const alt = String(img.getAttribute('alt') ?? '').trim();
    if (!alt) return '';
    const pathLike = !/\s/.test(alt) && (/^(?:https?|file|data):/i.test(alt) || /[\\/]/.test(alt) || /\.(?:png|jpe?g|gif|svg|webp|bmp|tiff?|avif)$/i.test(alt));
    return pathLike ? '' : alt;
  };
  const imageTextIgnoringReaderLabel = (img) => {
    const decorated = /(^|\s)clickable-image(\s|$)/.test(String(img.getAttribute('class') ?? '')) && String(img.getAttribute('aria-label') ?? '').trim() === 'Zoom In';
    if (!decorated) return imageText(img);
    const alt = String(img.getAttribute('alt') ?? '').trim();
    if (!alt) return '';
    const pathLike = !/\s/.test(alt) && (/^(?:https?|file|data):/i.test(alt) || /[\\/]/.test(alt) || /\.(?:png|jpe?g|gif|svg|webp|bmp|tiff?|avif)$/i.test(alt));
    return pathLike ? '' : alt;
  };
  const walk = (range, imgText = imageText) => {
    const start = range.startContainer, end = range.endContainer;
    let acc = '';
    const visit = (node) => {
      const type = node?.nodeType;
      if (type === 3) {
        if (node !== start && node !== end && !range.intersectsNode(node)) return;
        const data = String(node.data ?? '');
        acc += data.slice(node === start ? range.startOffset : 0, node === end ? range.endOffset : data.length);
        return;
      }
      if (type !== 1 || !range.intersectsNode(node)) return;
      const name = String(node.localName ?? '').toLowerCase();
      if (name === 'br') { acc += '\n'; return; }
      if (name === 'img') { acc += imgText(node); return; }
      const kids = node.childNodes;
      for (let i = 0; i < (kids?.length ?? 0); i++) visit(kids[i]);
    };
    visit(range.commonAncestorContainer);
    return acc;
  };

  for (const idx of p.indices) {
    const seg = waive(segs[idx]);
    const info = { index: idx, segment: String(seg.text) };
    try {
      const range = waive(view.toDisplayedRange(seg.sourcePosition));
      info.toString = String(range.toString());
      info.toStringEqualsSegment = normText(info.toString) === normText(info.segment);
      const walked = walk(range);
      info.walk = walked;
      info.walkEqualsSegment = normText(walked) === normText(info.segment);
      const walked2 = walk(range, imageTextIgnoringReaderLabel);
      info.walkIgnoringReaderLabel = walked2;
      info.walkIgnoringReaderLabelEqualsSegment = normText(walked2) === normText(info.segment);
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
  return JSON.stringify(out, null, 1);
})()
