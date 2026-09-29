import { describe, expect, it, vi } from 'vitest';
import type { ZoteroCredits, ZoteroVoice } from '../../src/read-aloud/zotero-voices';
import {
  cheapestPrices,
  creditState,
  initZoteroCreditRows,
  readZoteroCredits,
  UNLIMITED_MINUTES,
  zoteroCreditIds,
} from '../../src/ui/zotero-credit-rows';

const VOICES: ZoteroVoice[] = [
  { id: 'std-1', label: 'Standard Voice 1', locale: 'en-US', tier: 'standard', creditsPerMinute: 1 },
  { id: 'prm-5', label: 'Premium Voice 5', locale: 'en-US', tier: 'premium', creditsPerMinute: 30 },
  { id: 'prm-1', label: 'Premium Voice 1', locale: 'en-US', tier: 'premium', creditsPerMinute: 10 },
];

class FakeElement {
  hidden = false;
  textContent = '';
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

function fakeDoc() {
  const elements = new Map<string, FakeElement>();
  for (const tier of ['standard', 'premium'] as const) {
    for (const id of Object.values(zoteroCreditIds(tier))) {
      const el = new FakeElement();
      // As the markup starts them: the credits row and the log-in link hidden
      if (id.includes('credits-row') || id.includes('log-in')) el.hidden = true;
      elements.set(id, el);
    }
  }
  return { getElementById: (id: string) => elements.get(id) ?? null, el: (id: string) => elements.get(id)! };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function deps(over: { signedIn?: boolean; credits?: ZoteroCredits; voices?: ZoteroVoice[] } = {}) {
  let signedIn = over.signedIn ?? true;
  const credits = vi.fn(async (): Promise<ZoteroCredits> => over.credits ?? { standard: 115, premium: 283 });
  const listVoices = vi.fn(async () => over.voices ?? VOICES);
  const openAccount = vi.fn();
  const log = vi.fn();
  return {
    signedIn: () => signedIn,
    setSignedIn: (value: boolean) => (signedIn = value),
    service: { credits, listVoices },
    credits,
    listVoices,
    openAccount,
    log,
  };
}

const view = (doc: ReturnType<typeof fakeDoc>, tier: 'standard' | 'premium') => {
  const ids = zoteroCreditIds(tier);
  return {
    row: doc.el(ids.row).hidden ? null : doc.el(ids.text).textContent,
    none: doc.el(ids.text).hasAttribute('data-ztts-none'),
    buy: !doc.el(ids.buy).hidden,
    logIn: !doc.el(ids.logIn).hidden,
  };
};

describe('creditState', () => {
  it('says nothing without a figure', () => {
    expect(creditState(null, 1)).toEqual({ kind: 'unknown' });
  });

  it('is none at zero or below', () => {
    expect(creditState(0, 1)).toEqual({ kind: 'none' });
    expect(creditState(-3, 10)).toEqual({ kind: 'none' });
  });

  // Zotero's own player hides a time over 90 days as unlimited
  // (formatTimeRemaining, reader.js 38417-38421); here at the tier's cheapest voice
  it('is unlimited past 90 days of minutes at the cheapest price, Zotero’s own line', () => {
    expect(UNLIMITED_MINUTES).toBe(60 * 24 * 90);
    expect(creditState(UNLIMITED_MINUTES, 1)).toEqual({ kind: 'left', credits: UNLIMITED_MINUTES });
    expect(creditState(UNLIMITED_MINUTES + 1, 1)).toEqual({ kind: 'unlimited' });
    expect(creditState(UNLIMITED_MINUTES + 1, 10)).toEqual({ kind: 'left', credits: UNLIMITED_MINUTES + 1 });
  });

  it('shows the figure when the price is unknown', () => {
    expect(creditState(10_000_000, null)).toEqual({ kind: 'left', credits: 10_000_000 });
  });
});

describe('cheapestPrices', () => {
  it('takes each tier’s lowest price, null where no voice has one', () => {
    expect(cheapestPrices(VOICES)).toEqual({ standard: 1, premium: 10 });
    expect(cheapestPrices([{ id: 'x', label: 'X', locale: 'en-US', tier: 'premium' }])).toEqual({ standard: null, premium: null });
  });
});

describe('readZoteroCredits', () => {
  it('reads both figures and prices, and a failed listing only loses the prices', async () => {
    const d = deps();
    expect(await readZoteroCredits(d.service)).toEqual({
      standard: { credits: 115, cheapest: 1, state: { kind: 'left', credits: 115 } },
      premium: { credits: 283, cheapest: 10, state: { kind: 'left', credits: 283 } },
    });
    d.listVoices.mockRejectedValueOnce(new Error('network'));
    const log = vi.fn();
    expect((await readZoteroCredits(d.service, log)).premium).toEqual({ credits: 283, cheapest: null, state: { kind: 'left', credits: 283 } });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('initZoteroCreditRows (issue #159)', () => {
  it('shows each tier’s credits with the Add more time link, and no Log in link, while signed in', async () => {
    const doc = fakeDoc();
    const d = deps();
    await initZoteroCreditRows(doc, d).refresh();
    expect(view(doc, 'standard')).toEqual({ row: '115 credits left', none: false, buy: true, logIn: false });
    expect(view(doc, 'premium')).toEqual({ row: '283 credits left', none: false, buy: true, logIn: false });
  });

  it('writes the figure as the locale groups numbers', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: 1234, premium: 0 } })).refresh();
    expect(view(doc, 'standard').row).toBe('1,234 credits left');
  });

  it('marks a tier with nothing left, and keeps its link', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: 115, premium: 0 } })).refresh();
    expect(view(doc, 'premium')).toEqual({ row: 'No credits left', none: true, buy: true, logIn: false });
    expect(view(doc, 'standard').none).toBe(false);
  });

  it('says Unlimited with no link past Zotero’s 90 days', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: UNLIMITED_MINUTES + 1, premium: 283 } })).refresh();
    expect(view(doc, 'standard')).toEqual({ row: 'Unlimited', none: false, buy: false, logIn: false });
  });

  it('hides a tier Zotero gives no figure for', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: null, premium: 283 } })).refresh();
    expect(view(doc, 'standard').row).toBeNull();
    expect(view(doc, 'premium').row).toBe('283 credits left');
  });

  it('signed out: no credits rows, a Log in link on each switch row, and nothing asked of Zotero', async () => {
    const doc = fakeDoc();
    const d = deps({ signedIn: false });
    await initZoteroCreditRows(doc, d).refresh();
    expect(view(doc, 'standard')).toEqual({ row: null, none: false, buy: true, logIn: true });
    expect(view(doc, 'premium').logIn).toBe(true);
    expect(d.credits).not.toHaveBeenCalled();
    expect(d.listVoices).not.toHaveBeenCalled();
  });

  it('a Log in click opens Zotero’s account settings', async () => {
    const doc = fakeDoc();
    const d = deps({ signedIn: false });
    await initZoteroCreditRows(doc, d).refresh();
    doc.el(zoteroCreditIds('premium').logIn).fire('click');
    expect(d.openAccount).toHaveBeenCalledTimes(1);
  });

  it('follows a sign-out and a sign-in', async () => {
    const doc = fakeDoc();
    const d = deps();
    const rows = initZoteroCreditRows(doc, d);
    await rows.refresh();
    d.setSignedIn(false);
    await rows.refresh();
    expect(view(doc, 'standard')).toMatchObject({ row: null, logIn: true });
    d.setSignedIn(true);
    await rows.refresh();
    expect(view(doc, 'standard')).toMatchObject({ row: '115 credits left', logIn: false });
  });

  it('hides the rows and logs when the credits cannot be read', async () => {
    const doc = fakeDoc();
    const d = deps();
    const rows = initZoteroCreditRows(doc, d);
    await rows.refresh();
    d.credits.mockRejectedValueOnce(new Error("Zotero's credits did not answer within 20 s"));
    await rows.refresh();
    expect(view(doc, 'standard').row).toBeNull();
    expect(view(doc, 'premium').row).toBeNull();
    expect(d.log).toHaveBeenCalledTimes(1);
  });

  it('lets the later of two refreshes paint, whichever answers first', async () => {
    const doc = fakeDoc();
    const d = deps();
    const slow = deferred<ZoteroCredits>();
    d.credits.mockImplementationOnce(() => slow.promise);
    const rows = initZoteroCreditRows(doc, d);
    const first = rows.refresh();
    d.credits.mockResolvedValueOnce({ standard: 90, premium: 200 });
    await rows.refresh();
    slow.resolve({ standard: 115, premium: 283 });
    await first;
    expect(view(doc, 'standard').row).toBe('90 credits left');
  });
});
