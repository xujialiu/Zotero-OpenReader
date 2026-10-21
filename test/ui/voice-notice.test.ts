import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceNotices, VOICE_NOTICE_ID } from '../../src/ui/voice-notice';

/** A document as far as the notices use one: one element per id, no window (so nothing positions it). */
function fakeDocument() {
  const elements = new Map<string, any>();
  return {
    elements,
    getElementById: (id: string) => elements.get(id) ?? null,
    createElementNS: () => ({ id: '', textContent: '', style: { cssText: '', opacity: '', whiteSpace: '' } }),
    body: { appendChild: (el: any) => elements.set(el.id, el) },
    documentElement: {},
  };
}

describe('the voice notices (issues #224, #225)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const doc = fakeDocument();
    const reader = {};
    const notices = createVoiceNotices({
      document: () => doc as any,
      message: (kind, voice, reading) => `${kind}|${voice}|${reading ?? ''}`,
    });
    const shown = () => {
      const el = doc.getElementById(VOICE_NOTICE_ID);
      return el && el.style.opacity === '1' ? el.textContent : null;
    };
    return { doc, reader, notices, shown };
  }

  it('names the voice reading beside the one being prepared, on lines of their own, until the switch ends', () => {
    const t = setup();
    t.notices.notice(t.reader, 'preparing', 'Brian', 'Ava');
    expect(t.shown()).toBe('preparing|Brian|Ava');
    expect(t.doc.getElementById(VOICE_NOTICE_ID).style.whiteSpace).toBe('pre-line');
    vi.advanceTimersByTime(60_000);
    expect(t.shown()).toBe('preparing|Brian|Ava');
    t.notices.notice(t.reader, 'selected', 'Brian');
    expect(t.shown()).toBe(null);
  });

  it.each(['called-off', 'paused', 'choose', 'failed', 'unavailable'] as const)('shows %s for five seconds', (kind) => {
    const t = setup();
    t.notices.notice(t.reader, kind, 'Brian');
    expect(t.shown()).toBe(`${kind}|Brian|`);
    vi.advanceTimersByTime(4_999);
    expect(t.shown()).not.toBe(null);
    vi.advanceTimersByTime(1);
    expect(t.shown()).toBe(null);
  });

  it('a quiet cancel clears a preparing notice at once', () => {
    const t = setup();
    t.notices.notice(t.reader, 'preparing', 'Brian', 'Ava');
    t.notices.notice(t.reader, 'cancelled', 'Brian');
    expect(t.shown()).toBe(null);
  });
});
