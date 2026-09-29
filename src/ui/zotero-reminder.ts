import type { ToastDocument } from './speed-toast';

/**
 * The reminder that opens over the document when Zotero will not read a
 * Zotero voice for its account (issue #140, read-aloud/zotero-refusals.ts):
 * a line of text, an Add more time link when buying helps, and a close
 * button; it stays until closed. Shown where the speed toast is
 * (`toastDoc`): the reader's document, or the main window when the tab is
 * behind another. The players it speaks of are closed by then, so it
 * cannot live in the Player.
 */
export const REMINDER_ID = 'ztts-zotero-reminder';

const XHTML = 'http://www.w3.org/1999/xhtml';

const BOX = [
  'position:fixed',
  'top:56px',
  'left:50%',
  'transform:translateX(-50%)',
  'z-index:2147483647',
  'display:flex',
  'align-items:flex-start',
  'gap:10px',
  'background:rgba(38,38,42,0.95)',
  'color:#fff',
  'font:500 13px/1.45 system-ui,-apple-system,sans-serif',
  'padding:10px 10px 10px 14px',
  'border-radius:8px',
  'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
  'max-width:min(80vw, 520px)',
].join(';');
const LINK = 'margin-left:6px;padding:0;border:0;background:none;color:#8ab4ff;text-decoration:underline;font:inherit;cursor:pointer';
const CLOSE = 'flex:0 0 auto;padding:0 4px;border:0;background:none;color:inherit;font:16px/1.2 system-ui,sans-serif;opacity:.8;cursor:pointer';

export interface ReminderView {
  text: string;
  link?: { label: string; open(): void };
  closeLabel: string;
}

function element(doc: ToastDocument, tag: string, css: string): any {
  // Explicit XHTML namespace: the main window is XUL/XHTML mixed
  const el = doc.createElementNS(XHTML, tag);
  el.style.cssText = css;
  return el;
}

/** Shows the reminder, replacing one already there; returns its close. */
export function showReminder(doc: ToastDocument, view: ReminderView): () => void {
  removeReminder(doc);
  const box = element(doc, 'div', BOX);
  box.id = REMINDER_ID;
  box.setAttribute('role', 'alert');
  const body = element(doc, 'div', 'flex:1 1 auto');
  const text = element(doc, 'span', '');
  text.textContent = view.text;
  body.appendChild(text);
  if (view.link) {
    const link = element(doc, 'button', LINK);
    link.textContent = view.link.label;
    const open = view.link.open;
    link.addEventListener('click', () => open());
    body.appendChild(link);
  }
  const close = element(doc, 'button', CLOSE);
  close.textContent = '✕';
  close.setAttribute('aria-label', view.closeLabel);
  const dismiss = () => {
    try {
      box.remove();
    } catch (error) {
      // The reader may close while its reminder is up
      if (!String(error).includes("can't access dead object")) throw error;
    }
  };
  close.addEventListener('click', dismiss);
  box.appendChild(body);
  box.appendChild(close);
  (doc.body ?? doc.documentElement).appendChild(box);
  return dismiss;
}

export function removeReminder(doc: ToastDocument): void {
  doc.getElementById(REMINDER_ID)?.remove();
}
