/**
 * The text of a DOM Range spelled the way Read Aloud spells a Segment
 * (issue #209). Zotero's document worker builds a paragraph's text from its
 * text nodes plus two characters the page does not hold: a newline for every
 * `<br>`, and an inline image's text for every `<img>` (Zotero 10.0.6
 * `resource/document-worker/worker.js` `walkInline`, 165304-165329). The
 * range Zotero hands over for a sentence runs from its first to its last
 * text node, so `range.toString()` has neither, and a sentence holding an
 * unspaced `<br/>` or an image with alt text never reads as itself.
 *
 * Only what the walk needs is read — `nodeType`, `childNodes`, `localName`,
 * `data`, `getAttribute` and the range's boundary points and
 * `intersectsNode` — all of which read fine from the plugin sandbox through
 * the reader's Xrays (notes, 2026-08-25).
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Zotero's `getImageText` (worker.js 165235-165254): the `aria-label`, else
 * the `alt` unless it looks like a path or a URL. Anything with white space
 * reads as prose.
 */
export function imageText(img: any): string {
  const label = String(img?.getAttribute?.('aria-label') ?? '').trim();
  if (label) return label;
  const alt = String(img?.getAttribute?.('alt') ?? '').trim();
  if (!alt) return '';
  const pathLike = !/\s/.test(alt) && (/^(?:https?|file|data):/i.test(alt) || /[\\/]/.test(alt) || /\.(?:png|jpe?g|gif|svg|webp|bmp|tiff?|avif)$/i.test(alt));
  return pathLike ? '' : alt;
}

/**
 * The range's text with a newline for each `<br>` and the image text for each
 * `<img>` it covers, raw (the caller normalizes white space). Null when the
 * range cannot be walked; the caller then has `toString()` alone. A dead
 * node throws, as a read of it does anywhere; the caller reports it.
 */
export function segmentTextOf(range: any): string | null {
  const root = range?.commonAncestorContainer;
  if (!root || typeof range.intersectsNode !== 'function') return null;
  const start = range.startContainer;
  const end = range.endContainer;
  let out = '';
  const visit = (node: any): void => {
    const type = node?.nodeType;
    if (type === TEXT_NODE) {
      if (node !== start && node !== end && !range.intersectsNode(node)) return;
      const data = String(node.data ?? '');
      out += data.slice(node === start ? range.startOffset : 0, node === end ? range.endOffset : data.length);
      return;
    }
    if (type !== ELEMENT_NODE || !range.intersectsNode(node)) return;
    const name = String(node.localName ?? '').toLowerCase();
    if (name === 'br') {
      out += '\n';
      return;
    }
    if (name === 'img') {
      out += imageText(node);
      return;
    }
    // Index loops: a reader-realm list never runs a sandbox callback (MEMORY/zotero.md)
    const children = node.childNodes;
    for (let i = 0; i < (children?.length ?? 0); i++) visit(children[i]);
  };
  visit(root);
  return out;
}
