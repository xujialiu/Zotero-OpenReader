import { describe, expect, it, vi } from 'vitest';
import { REMINDER_ID, removeReminder, showReminder } from '../../src/ui/zotero-reminder';

class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  style: Record<string, string> & { cssText?: string } = {};
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<(event: unknown) => void>>();
  id = '';
  className = '';
  textContent = '';
  constructor(readonly tag: string, readonly doc: FakeDoc) {}
  appendChild(child: FakeNode) { child.parent = this; this.children.push(child); return child; }
  append(...children: FakeNode[]) { for (const child of children) this.appendChild(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener(type: string, fn: (event: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  click() { for (const fn of this.listeners.get('click') ?? []) fn({ preventDefault() {} }); }
  get text(): string { return this.textContent + this.children.map((c) => c.text).join(''); }
}

class FakeDoc {
  body = new FakeNode('body', this);
  documentElement = this.body;
  createElementNS(_ns: string, tag: string) { return new FakeNode(tag, this); }
  getElementById(id: string): FakeNode | null {
    const walk = (node: FakeNode): FakeNode | null => (node.id === id ? node : node.children.map(walk).find(Boolean) ?? null);
    return walk(this.body);
  }
}

const buttons = (node: FakeNode): FakeNode[] => [...(node.tag === 'button' ? [node] : []), ...node.children.flatMap(buttons)];

describe('the reminder over the document (issue #140)', () => {
  it('shows the text, the Add more time link and a close button, and stays until closed', () => {
    const doc = new FakeDoc();
    const open = vi.fn();
    showReminder(doc, { text: 'Zotero Premium has no remaining time.', link: { label: 'Add more time', open }, closeLabel: 'Close' });
    const box = doc.getElementById(REMINDER_ID)!;
    expect(box.text).toContain('Zotero Premium has no remaining time.');
    const [link, close] = buttons(box);
    expect(link.textContent).toBe('Add more time');
    expect(close.attrs.get('aria-label')).toBe('Close');
    link.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(doc.getElementById(REMINDER_ID)).not.toBeNull();
    close.click();
    expect(doc.getElementById(REMINDER_ID)).toBeNull();
  });

  it('has no link when none is given', () => {
    const doc = new FakeDoc();
    showReminder(doc, { text: 'Zotero Premium has reached today\'s limit.', closeLabel: 'Close' });
    expect(buttons(doc.getElementById(REMINDER_ID)!)).toHaveLength(1);
  });

  it('replaces the reminder already shown, and goes with the plugin', () => {
    const doc = new FakeDoc();
    showReminder(doc, { text: 'first', closeLabel: 'Close' });
    showReminder(doc, { text: 'second', closeLabel: 'Close' });
    expect(doc.body.children).toHaveLength(1);
    expect(doc.getElementById(REMINDER_ID)!.text).toContain('second');
    removeReminder(doc);
    expect(doc.getElementById(REMINDER_ID)).toBeNull();
  });
});
