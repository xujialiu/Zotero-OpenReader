/**
 * A paragraph as the DOM holds it, for code that walks a Range over it:
 * text nodes, and the elements a sentence can hold — `<br>`, `<img>`, an
 * inline `<span>`. Every node edge and every character gets one position,
 * so boundary points compare, and `intersectsNode` answers, as the DOM's do
 * for the shapes the tests build. Ranges start and end in text nodes, as a
 * resolved EPUB CFI or snapshot selector does.
 */

/**
 * An `img` holds the attributes the page has; `source` is the text Zotero's
 * document worker read for it from the file, when the reader's page no
 * longer says it (the EPUB view relabels every image "Zoom In").
 */
export type Child = string | { br: true } | { img: Record<string, string>; source?: string } | { span: Child[] };

export const BR = { br: true } as const;

export interface FakeText {
  nodeType: 3;
  data: string;
  parentNode: FakeElement;
  childNodes: never[];
  /** The position of the node's first character. */
  at: number;
}

export interface FakeElement {
  nodeType: 1;
  localName: string;
  parentNode: FakeElement | null;
  childNodes: FakeNode[];
  getAttribute(name: string): string | null;
  /** The positions of the element's start and end. */
  start: number;
  end: number;
}

export type FakeNode = FakeText | FakeElement;

/** A `<p>` holding `children`, its text nodes in document order, and ranges over them. */
export function paragraph(children: Child[]) {
  let next = 0;
  const texts: FakeText[] = [];
  const element = (localName: string, parentNode: FakeElement | null, attributes: Record<string, string> = {}): FakeElement => ({
    nodeType: 1,
    localName,
    parentNode,
    childNodes: [],
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    start: next++,
    end: -1,
  });
  const fill = (parent: FakeElement, list: Child[]) => {
    for (const child of list) {
      if (typeof child === 'string') {
        const text: FakeText = { nodeType: 3, data: child, parentNode: parent, childNodes: [], at: next };
        next += child.length + 1;
        texts.push(text);
        parent.childNodes.push(text);
        continue;
      }
      const el = 'br' in child ? element('br', parent) : 'img' in child ? element('img', parent, child.img) : element('span', parent);
      if ('span' in child) fill(el, child.span);
      el.end = next++;
      parent.childNodes.push(el);
    }
  };
  const root = element('p', null);
  fill(root, children);
  root.end = next++;

  const ancestors = (node: FakeNode): FakeNode[] => {
    const out: FakeNode[] = [];
    for (let n: FakeNode | null = node; n; n = n.parentNode) out.unshift(n);
    return out;
  };
  const position = (node: FakeNode, offset: number) => {
    if (node.nodeType !== 3) throw new Error('the fake places boundary points in text nodes only');
    return node.at + offset;
  };

  class FakeRange {
    constructor(
      public startContainer: FakeText,
      public startOffset: number,
      public endContainer: FakeText,
      public endOffset: number,
    ) {}
    get collapsed() {
      return position(this.startContainer, this.startOffset) >= position(this.endContainer, this.endOffset);
    }
    get commonAncestorContainer(): FakeNode {
      const a = ancestors(this.startContainer);
      const b = ancestors(this.endContainer);
      let common: FakeNode = root;
      for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) common = a[i];
      return common;
    }
    cloneRange() {
      return new FakeRange(this.startContainer, this.startOffset, this.endContainer, this.endOffset);
    }
    setStart(node: FakeText, offset: number) {
      this.startContainer = node;
      this.startOffset = offset;
    }
    setEnd(node: FakeText, offset: number) {
      this.endContainer = node;
      this.endOffset = offset;
    }
    comparePoint(node: FakeText, offset: number) {
      const at = position(node, offset);
      if (at < position(this.startContainer, this.startOffset)) return -1;
      return at > position(this.endContainer, this.endOffset) ? 1 : 0;
    }
    intersectsNode(node: FakeNode) {
      const start = position(this.startContainer, this.startOffset);
      const end = position(this.endContainer, this.endOffset);
      if (node.nodeType === 3) return node.at <= end && node.at + node.data.length >= start;
      return node.start < end && node.end > start;
    }
    /** What a DOM Range's toString gives: the text nodes' characters, nothing for an element. */
    toString() {
      const from = texts.indexOf(this.startContainer);
      const to = texts.indexOf(this.endContainer);
      let out = '';
      for (let i = from; i <= to; i++) out += texts[i].data.slice(i === from ? this.startOffset : 0, i === to ? this.endOffset : undefined);
      return out;
    }
  }

  const range = (start: FakeText, startOffset: number, end: FakeText, endOffset: number) => new FakeRange(start, startOffset, end, endOffset);
  return { root, texts, range, FakeRange };
}
