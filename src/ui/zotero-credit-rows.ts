import { t } from '../core/l10n';
import { formatOverUnlimited, formatTimeLeft, UNLIMITED_MINUTES } from '../core/time-left';
import { ZOTERO_TIERS, type ZoteroTier, type ZoteroVoice, type ZoteroVoiceService } from '../read-aloud/zotero-voices';

/**
 * The line under each of Zotero's two tiers in the settings pane (issue
 * #159): the time left on the account for the tier, with an Add more time
 * link to zotero.org, and a Log in link on the switch row while no Zotero
 * account is signed in.
 *
 * Time, not credits, since issue #140, as zotero.org/settings/readaloud
 * writes it: a tier's voices cost different amounts a minute (Premium 10
 * or 30 on 2026-09-29), so its time left is a range, from its dearest
 * voice's to its cheapest's — "9m – 26m left, depending on voice" for 260
 * Premium credits. With no price listed, the credits figure stands in.
 *
 * Read when the pane opens, after a Zotero tier's Test connection or
 * Enable, and when an account is signed in or out (ui/prefs-pane.ts). A
 * tier switched off still shows its time: the credits are the account's.
 */

export { UNLIMITED_MINUTES };

/** A tier's lowest and highest price per minute among the listed voices; null where none has one. */
export type TierPrices = { cheapest: number | null; dearest: number | null };

/**
 * What the line says for a tier: minutes at the dearest voice (`low`) and
 * at the cheapest (`high`, null past Zotero's 90 days). Unlimited only
 * when even the dearest voice is past them: Standard with a Zotero Storage
 * subscription, for one.
 */
export type CreditState =
  | { kind: 'unknown' }
  | { kind: 'none' }
  | { kind: 'unlimited' }
  | { kind: 'time'; low: number; high: number | null }
  | { kind: 'credits'; credits: number };

export function creditState(credits: number | null, prices: TierPrices): CreditState {
  if (credits === null) return { kind: 'unknown' };
  if (credits <= 0) return { kind: 'none' };
  const { cheapest, dearest } = prices;
  if (cheapest === null || dearest === null || cheapest <= 0 || dearest <= 0) return { kind: 'credits', credits };
  const low = credits / dearest;
  if (low > UNLIMITED_MINUTES) return { kind: 'unlimited' };
  const high = credits / cheapest;
  return { kind: 'time', low, high: high > UNLIMITED_MINUTES ? null : high };
}

/** Each tier's lowest and highest price per minute among the listed voices. */
export function tierPrices(voices: readonly ZoteroVoice[]): Record<ZoteroTier, TierPrices> {
  const out: Record<ZoteroTier, TierPrices> = { standard: { cheapest: null, dearest: null }, premium: { cheapest: null, dearest: null } };
  for (const voice of voices) {
    const price = voice.creditsPerMinute;
    if (price === undefined) continue;
    const known = out[voice.tier];
    if (known.cheapest === null || price < known.cheapest) known.cheapest = price;
    if (known.dearest === null || price > known.dearest) known.dearest = price;
  }
  return out;
}

export type TierCredits = { credits: number | null; cheapest: number | null; dearest: number | null; state: CreditState };

/**
 * Both tiers' figures and prices, read in parallel. A listing that fails
 * only costs the prices, so the credits figure is shown, and is logged;
 * credits that cannot be read reject.
 */
export async function readZoteroCredits(
  service: Pick<ZoteroVoiceService, 'listVoices' | 'credits'>,
  log: (error: unknown) => void = () => {},
): Promise<Record<ZoteroTier, TierCredits>> {
  const [credits, voices] = await Promise.all([
    service.credits(),
    service.listVoices().catch((e: unknown) => {
      log(e);
      return [] as ZoteroVoice[];
    }),
  ]);
  const prices = tierPrices(voices);
  const tier = (id: ZoteroTier): TierCredits => ({ credits: credits[id], ...prices[id], state: creditState(credits[id], prices[id]) });
  return { standard: tier('standard'), premium: tier('premium') };
}

/** The line's text for a tier's state; null for unknown, which hides the line. */
export function creditText(state: CreditState): string | null {
  switch (state.kind) {
    case 'unknown': return null;
    case 'none': return t('ztts-zotero-time-left', { time: formatTimeLeft(0) ?? '' });
    case 'unlimited': return t('ztts-zotero-credits-unlimited');
    case 'credits': return t('ztts-zotero-credits-left', { credits: state.credits });
    case 'time': {
      const low = formatTimeLeft(state.low) ?? '';
      const high = state.high === null ? t('ztts-zotero-time-over', { time: formatOverUnlimited() }) : (formatTimeLeft(state.high) ?? '');
      return low === high ? t('ztts-zotero-time-left', { time: low }) : t('ztts-zotero-time-range', { low, high });
    }
  }
}

/** The tier's elements in preferences.xhtml: the credits row, its text, its Add more time link, and the Log in link on the switch row. */
export function zoteroCreditIds(tier: ZoteroTier): { row: string; text: string; buy: string; logIn: string } {
  return {
    row: `ztts-zotero-credits-row-${tier}`,
    text: `ztts-zotero-credits-${tier}`,
    buy: `ztts-zotero-buy-${tier}`,
    logIn: `ztts-zotero-log-in-${tier}`,
  };
}

/** The attribute the stylesheet paints red: nothing left. */
const NONE_ATTR = 'data-ztts-none';

export interface ZoteroCreditRowsDeps {
  /** A Zotero account is signed in: `Zotero.Sync.Runner.enabled`, the flag Zotero's reader goes by. */
  signedIn(): boolean;
  service: Pick<ZoteroVoiceService, 'listVoices' | 'credits'>;
  /** Zotero's Account settings, with the sign-in started, as Zotero's own player's Log in does. */
  openAccount(): void;
  log(error: unknown): void;
}

export function initZoteroCreditRows(doc: { getElementById(id: string): any }, deps: ZoteroCreditRowsDeps): { refresh(): Promise<void> } {
  const elements = (tier: ZoteroTier) => {
    const ids = zoteroCreditIds(tier);
    return {
      row: doc.getElementById(ids.row),
      text: doc.getElementById(ids.text),
      buy: doc.getElementById(ids.buy),
      logIn: doc.getElementById(ids.logIn),
    };
  };
  const setHidden = (el: any, hidden: boolean) => {
    if (el) el.hidden = hidden;
  };

  function paint(tier: ZoteroTier, state: CreditState): void {
    const { row, text, buy } = elements(tier);
    if (state.kind === 'unknown') {
      setHidden(row, true);
      return;
    }
    if (text) {
      text.textContent = creditText(state) ?? '';
      if (state.kind === 'none') text.setAttribute(NONE_ATTR, 'true');
      else text.removeAttribute(NONE_ATTR);
    }
    setHidden(buy, state.kind === 'unlimited');
    setHidden(row, false);
  }

  for (const tier of ZOTERO_TIERS) elements(tier).logIn?.addEventListener('click', () => deps.openAccount());

  /** Bumped by every refresh: an answer that arrives after a later refresh started is dropped. */
  let generation = 0;

  async function refresh(): Promise<void> {
    const mine = ++generation;
    const signedIn = deps.signedIn();
    for (const tier of ZOTERO_TIERS) setHidden(elements(tier).logIn, signedIn);
    if (!signedIn) {
      for (const tier of ZOTERO_TIERS) paint(tier, { kind: 'unknown' });
      return;
    }
    let read: Record<ZoteroTier, TierCredits> | null = null;
    try {
      read = await readZoteroCredits(deps.service, deps.log);
    } catch (e) {
      deps.log(e);
    }
    if (mine !== generation) return;
    for (const tier of ZOTERO_TIERS) paint(tier, read ? read[tier].state : { kind: 'unknown' });
  }

  return { refresh };
}
