/**
 * Whether a DOM Range shows a Segment's text, where the page and the Segment
 * spell the same sentence differently (issue #209). Zotero's document worker
 * builds a paragraph's text from the source file: a newline for every
 * `<br>`, and an inline image's `aria-label` or prose `alt` for every `<img>`
 * (Zotero 10.0.6 `resource/document-worker/worker.js` `walkInline`,
 * 165304-165329). The range Zotero hands over for a sentence holds the text
 * nodes only, so `range.toString()` has neither.
 *
 * A `<br>` is put back as the newline it was. An image's text cannot be read
 * back from the page: the EPUB view relabels every image not inside a link
 * "Zoom In" (`resource/reader/reader.js:55590-55601`), replacing a source
 * `aria-label`. So an image is a gap that the Segment may fill with
 * anything, and the text either side of it must still be the Segment's,
 * which keeps a range on the wrong node (#4) refused.
 *
 * Only `nodeType`, `childNodes`, `localName`, `data` and the range's
 * boundary points and `intersectsNode` are read, all of which read fine from
 * the plugin sandbox through the reader's Xrays (verified live on
 * 1.16.16-beta4).
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** Where an inline image sits in a range. */
export const IMAGE: unique symbol = Symbol('image');

export type RangePart = string | typeof IMAGE;

/**
 * What the range covers, in document order: each text node's covered slice,
 * `'\n'` for a `<br>`, `IMAGE` for an `<img>`. Null when the range cannot be
 * walked; the caller then has `toString()` alone. A dead node throws, as a
 * read of it does anywhere; the caller reports it.
 */
export function rangeParts(range: any): RangePart[] | null {
  const root = range?.commonAncestorContainer;
  if (!root || typeof range.intersectsNode !== 'function') return null;
  const start = range.startContainer;
  const end = range.endContainer;
  const parts: RangePart[] = [];
  const visit = (node: any): void => {
    const type = node?.nodeType;
    if (type === TEXT_NODE) {
      if (node !== start && node !== end && !range.intersectsNode(node)) return;
      const data = String(node.data ?? '');
      parts.push(data.slice(node === start ? range.startOffset : 0, node === end ? range.endOffset : data.length));
      return;
    }
    if (type !== ELEMENT_NODE || !range.intersectsNode(node)) return;
    const name = String(node.localName ?? '').toLowerCase();
    if (name === 'br') {
      parts.push('\n');
      return;
    }
    if (name === 'img') {
      parts.push(IMAGE);
      return;
    }
    // Index loops: a reader-realm list never runs a sandbox callback (MEMORY/zotero.md)
    const children = node.childNodes;
    for (let i = 0; i < (children?.length ?? 0); i++) visit(children[i]);
  };
  visit(root);
  return parts;
}

/**
 * Whether `expected` (already normalized) is the range's text with anything,
 * or nothing, where each image sits: the text between the images appears in
 * it in order, the first piece at its start and the last at its end. Each
 * piece goes through `normalize`, which trims, so the white space beside an
 * image falls into its gap. A range with no text of its own outside the gaps
 * matches nothing.
 */
export function rangeSpells(parts: readonly RangePart[], expected: string, normalize: (text: string) => string): boolean {
  const pieces: string[] = [''];
  for (const part of parts) {
    if (part === IMAGE) pieces.push('');
    else pieces[pieces.length - 1] += part;
  }
  const texts = pieces.map(normalize);
  if (texts.length === 1) return texts[0] === expected;
  if (!texts.some((text) => text)) return false;
  const first = texts[0];
  const last = texts[texts.length - 1];
  const end = expected.length - last.length;
  if (!expected.startsWith(first) || !expected.endsWith(last) || end < first.length) return false;
  // Leftmost occurrence of each middle piece: with only gaps between them,
  // a later occurrence can never fit where the leftmost does not
  let at = first.length;
  for (let i = 1; i < texts.length - 1; i++) {
    const found = expected.indexOf(texts[i], at);
    if (found < 0 || found + texts[i].length > end) return false;
    at = found + texts[i].length;
  }
  return true;
}
