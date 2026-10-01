import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { PREFETCH_IDS, PREFETCH_OBSERVERS, initPrefetchRows } from '../../src/ui/prefetch-rows';
import { englishAttribute } from '../setup';

const CUSTOM = `${PREF_PREFIX}readAloud.prefetchCustom`;
const SENTENCES = `${PREF_PREFIX}readAloud.prefetchSentences`;
const REQUESTS = `${PREF_PREFIX}readAloud.prefetchRequests`;
const CACHE = `${PREF_PREFIX}cacheAudio`;

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown>; writes: string[] } {
  const store = { ...initial };
  const writes: string[] = [];
  return {
    store,
    writes,
    get: (k) => store[k],
    set: (k, v) => {
      writes.push(k);
      store[k] = v;
    },
  };
}

class FakeField {
  value = '';
  disabled = false;
  private listeners: (() => void)[] = [];
  addEventListener(type: string, fn: () => void): void {
    if (type === 'change') this.listeners.push(fn);
  }
  /** The user types a value and leaves the field. */
  enter(value: string): void {
    this.value = value;
    for (const fn of this.listeners) fn();
  }
}

function setup(initial: Record<string, unknown> = {}) {
  const sentences = new FakeField();
  const requests = new FakeField();
  const doc = { getElementById: (id: string) => (id === PREFETCH_IDS.sentences ? sentences : id === PREFETCH_IDS.requests ? requests : null) };
  const prefs = fakePrefs(initial);
  let observer: (() => void) | null = null;
  let watched: readonly string[] = [];
  let unregistered = false;
  const rows = initPrefetchRows(doc, {
    prefs,
    watch: (onChange) => {
      observer = onChange;
      watched = PREFETCH_OBSERVERS;
      return () => void (unregistered = true);
    },
  });
  return {
    prefs,
    rows,
    sentences,
    requests,
    /** A pref written behind the pane's back: the switch's checkbox, a restore, the sync. */
    write: (key: string, value: unknown) => {
      prefs.store[key] = value;
      observer?.();
    },
    watched: () => watched,
    unregistered: () => unregistered,
  };
}

describe('initPrefetchRows (issue #166)', () => {
  it('shows the defaults, editable, on an untouched profile, and writes nothing', () => {
    const pane = setup();
    expect([pane.sentences.value, pane.requests.value]).toEqual(['5', '2']);
    expect([pane.sentences.disabled, pane.requests.disabled]).toEqual([false, false]);
    expect(pane.prefs.writes).toEqual([]);
  });

  it('shows the user\'s numbers while Custom prefetch is on', () => {
    const pane = setup({ [CUSTOM]: true, [SENTENCES]: 12, [REQUESTS]: 1 });
    expect([pane.sentences.value, pane.requests.value]).toEqual(['12', '1']);
    expect(pane.sentences.disabled).toBe(false);
  });

  it('shows the defaults, grayed, while it is off, and the user\'s numbers again when it is back on', () => {
    const pane = setup({ [CUSTOM]: false, [SENTENCES]: 12, [REQUESTS]: 1 });
    expect([pane.sentences.value, pane.requests.value]).toEqual(['5', '2']);
    expect([pane.sentences.disabled, pane.requests.disabled]).toEqual([true, true]);
    pane.write(CUSTOM, true);
    expect([pane.sentences.value, pane.requests.value]).toEqual(['12', '1']);
    expect([pane.sentences.disabled, pane.requests.disabled]).toEqual([false, false]);
    expect(pane.prefs.store[SENTENCES]).toBe(12);
  });

  it('writes an entry clamped into its range, and shows what was kept', () => {
    const pane = setup();
    pane.sentences.enter('50');
    expect(pane.prefs.store[SENTENCES]).toBe(20);
    expect(pane.sentences.value).toBe('20');
    pane.sentences.enter('1');
    expect(pane.prefs.store[SENTENCES]).toBe(3);
    pane.requests.enter('9');
    expect(pane.prefs.store[REQUESTS]).toBe(5);
    pane.requests.enter('3.6');
    expect(pane.prefs.store[REQUESTS]).toBe(4);
    expect(pane.requests.value).toBe('4');
  });

  it('puts back the number kept for an entry that is not one', () => {
    const pane = setup({ [SENTENCES]: 8 });
    pane.sentences.enter('');
    expect(pane.prefs.store[SENTENCES]).toBe(8);
    expect(pane.sentences.value).toBe('8');
    expect(pane.prefs.writes).toEqual([]);
  });

  it('does not write while Custom prefetch is off', () => {
    const pane = setup({ [CUSTOM]: false });
    pane.sentences.enter('9');
    expect(pane.prefs.writes).toEqual([]);
    expect(pane.sentences.value).toBe('5');
  });

  it('repaints on refresh, for a restored backup, and on a pref written elsewhere', () => {
    const pane = setup();
    pane.prefs.store[SENTENCES] = 9;
    pane.rows.refresh();
    expect(pane.sentences.value).toBe('9');
    pane.write(REQUESTS, 4);
    expect(pane.requests.value).toBe('4');
  });

  it('watches the three prefs as Zotero.Prefs.registerObserver names them, and stops when the pane closes', () => {
    const pane = setup();
    expect(pane.watched().map((name) => `extensions.zotero.${name}`)).toEqual([CUSTOM, SENTENCES, REQUESTS]);
    pane.rows.dispose();
    expect(pane.unregistered()).toBe(true);
  });

  it('never touches the audio cache: it stands on its own', () => {
    const pane = setup({ [CACHE]: false });
    pane.write(CUSTOM, false);
    pane.write(CUSTOM, true);
    expect(pane.prefs.store[CACHE]).toBe(false);
    expect(pane.prefs.writes).toEqual([]);
  });
});

describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const rowOf = (marker: string) => {
    const at = xhtml.indexOf(marker);
    expect(at, marker).toBeGreaterThan(-1);
    return xhtml.slice(xhtml.lastIndexOf('<hbox', at), xhtml.indexOf('</hbox>', at));
  };
  const helpOf = (row: string) => englishAttribute(row.match(/<label class="ztts-help"[^>]*data-l10n-id="([^"]+)"/)?.[1] ?? '', 'help') ?? '';

  it('binds the switch, and leaves the two numbers to the rows, in their ranges', () => {
    expect(rowOf(`preference="${CUSTOM}"`)).toContain('<checkbox');
    const sentences = rowOf(`id="${PREFETCH_IDS.sentences}"`);
    expect(sentences).toMatch(/min="3" max="20"/);
    expect(sentences).not.toContain('preference=');
    const requests = rowOf(`id="${PREFETCH_IDS.requests}"`);
    expect(requests).toMatch(/min="1" max="5"/);
    expect(requests).not.toContain('preference=');
  });

  it('frees the cache checkbox from prefetch', () => {
    const row = rowOf(`preference="${CACHE}"`);
    expect(row).not.toMatch(/\sid="ztts-cache-audio"/);
    const help = helpOf(row);
    expect(help).toMatch(/emptied when Zotero restarts/);
    expect(help).not.toMatch(/prefetch/i);
  });

  // The ? is at most two sentences (MEMORY/code.md): what it gives, what it costs
  it('says what each number gives and what it costs, in at most two sentences', () => {
    const sentences = (text: string) => text.split(/(?<=\.)\s+/).filter(Boolean).length;
    for (const marker of [`preference="${CUSTOM}"`, `id="${PREFETCH_IDS.sentences}"`, `id="${PREFETCH_IDS.requests}"`, `preference="${CACHE}"`]) {
      const help = helpOf(rowOf(marker));
      expect(help, marker).not.toBe('');
      expect(sentences(help), marker).toBeLessThanOrEqual(2);
    }
    expect(helpOf(rowOf(`id="${PREFETCH_IDS.sentences}"`))).toMatch(/billed|credits/);
  });
});
