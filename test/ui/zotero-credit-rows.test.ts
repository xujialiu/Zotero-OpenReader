import { describe, expect, it, vi } from 'vitest';
import type { ZoteroCredits, ZoteroVoice } from '../../src/read-aloud/zotero-voices';
import {
  creditState,
  initZoteroCreditRows,
  readZoteroCredits,
  tierPrices,
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

const PRICES = { cheapest: 10, dearest: 30 };

describe('creditState (issue #140: time left, not credits)', () => {
  it('says nothing without a figure', () => {
    expect(creditState(null, PRICES)).toEqual({ kind: 'unknown' });
  });

  it('is none at zero or below', () => {
    expect(creditState(0, PRICES)).toEqual({ kind: 'none' });
    expect(creditState(-3, PRICES)).toEqual({ kind: 'none' });
  });

  it('is a range of minutes, from the dearest voice’s to the cheapest’s, as zotero.org writes it', () => {
    expect(creditState(260, PRICES)).toEqual({ kind: 'time', low: 260 / 30, high: 26 });
    expect(creditState(114, { cheapest: 1, dearest: 1 })).toEqual({ kind: 'time', low: 114, high: 114 });
  });

  // Zotero's own player hides a time over 90 days as unlimited
  // (formatTimeRemaining, reader.js 38417-38421)
  it('is unlimited only when even the dearest voice has more than 90 days', () => {
    expect(UNLIMITED_MINUTES).toBe(60 * 24 * 90);
    expect(creditState(UNLIMITED_MINUTES * 30, PRICES)).toEqual({ kind: 'time', low: UNLIMITED_MINUTES, high: null });
    expect(creditState(UNLIMITED_MINUTES * 30 + 1, PRICES)).toEqual({ kind: 'unlimited' });
    expect(creditState(UNLIMITED_MINUTES + 1, { cheapest: 1, dearest: 1 })).toEqual({ kind: 'unlimited' });
  });

  it('tops the range out at 90 days when only the cheaper voices pass it', () => {
    expect(creditState(1_500_000, PRICES)).toEqual({ kind: 'time', low: 50_000, high: null });
  });

  it('shows the credits figure when no price is known', () => {
    expect(creditState(10_000_000, { cheapest: null, dearest: null })).toEqual({ kind: 'credits', credits: 10_000_000 });
  });
});

describe('tierPrices', () => {
  it('takes each tier’s lowest and highest price, null where no voice has one', () => {
    expect(tierPrices(VOICES)).toEqual({ standard: { cheapest: 1, dearest: 1 }, premium: { cheapest: 10, dearest: 30 } });
    expect(tierPrices([{ id: 'x', label: 'X', locale: 'en-US', tier: 'premium' }])).toEqual({
      standard: { cheapest: null, dearest: null },
      premium: { cheapest: null, dearest: null },
    });
  });
});

describe('readZoteroCredits', () => {
  it('reads both figures and prices, and a failed listing only loses the prices', async () => {
    const d = deps();
    expect(await readZoteroCredits(d.service)).toEqual({
      standard: { credits: 115, cheapest: 1, dearest: 1, state: { kind: 'time', low: 115, high: 115 } },
      premium: { credits: 283, cheapest: 10, dearest: 30, state: { kind: 'time', low: 283 / 30, high: 28.3 } },
    });
    d.listVoices.mockRejectedValueOnce(new Error('network'));
    const log = vi.fn();
    expect((await readZoteroCredits(d.service, log)).premium).toEqual({ credits: 283, cheapest: null, dearest: null, state: { kind: 'credits', credits: 283 } });
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('initZoteroCreditRows (issue #159)', () => {
  it('shows each tier’s time left with the Add more time link, and no Log in link, while signed in', async () => {
    const doc = fakeDoc();
    const d = deps();
    await initZoteroCreditRows(doc, d).refresh();
    expect(view(doc, 'standard')).toEqual({ row: '1h 55m left', none: false, buy: true, logIn: false });
    expect(view(doc, 'premium')).toEqual({ row: '10m – 29m left, depending on voice', none: false, buy: true, logIn: false });
  });

  it('matches zotero.org for the owner’s 114 and 260 credits on 2026-09-29', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: 114, premium: 260 } })).refresh();
    expect(view(doc, 'standard').row).toBe('1h 54m left');
    expect(view(doc, 'premium').row).toBe('9m – 26m left, depending on voice');
  });

  it('shows the credits figure, as the locale groups numbers, when the prices cannot be listed', async () => {
    const doc = fakeDoc();
    const d = deps({ credits: { standard: 1234, premium: 283 } });
    d.listVoices.mockRejectedValueOnce(new Error('network'));
    await initZoteroCreditRows(doc, d).refresh();
    expect(view(doc, 'standard').row).toBe('1,234 credits left');
  });

  it('marks a tier with nothing left as 0m, and keeps its link', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: 115, premium: 0 } })).refresh();
    expect(view(doc, 'premium')).toEqual({ row: '0m left', none: true, buy: true, logIn: false });
    expect(view(doc, 'standard').none).toBe(false);
  });

  it('says Unlimited with no link past Zotero’s 90 days', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: UNLIMITED_MINUTES + 1, premium: 283 } })).refresh();
    expect(view(doc, 'standard')).toEqual({ row: 'Unlimited', none: false, buy: false, logIn: false });
  });

  it('tops a range out at 90d+ when only the cheaper voices pass 90 days, and keeps the link', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: 115, premium: 1_500_000 } })).refresh();
    expect(view(doc, 'premium')).toEqual({ row: '34d 17h 20m – 90d+ left, depending on voice', none: false, buy: true, logIn: false });
  });

  it('hides a tier Zotero gives no figure for', async () => {
    const doc = fakeDoc();
    await initZoteroCreditRows(doc, deps({ credits: { standard: null, premium: 283 } })).refresh();
    expect(view(doc, 'standard').row).toBeNull();
    expect(view(doc, 'premium').row).toBe('10m – 29m left, depending on voice');
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
    expect(view(doc, 'standard')).toMatchObject({ row: '1h 55m left', logIn: false });
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
    expect(view(doc, 'standard').row).toBe('1h 30m left');
  });
});
