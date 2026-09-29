import { t } from '../core/l10n';
import { ZOTERO_TIERS, type ZoteroTier, type ZoteroVoice, type ZoteroVoiceService } from '../read-aloud/zotero-voices';

/**
 * The credits line under each of Zotero's two tiers in the settings pane
 * (issue #159): the credits left on the account for the tier, with an Add
 * more time link to zotero.org, and a Log in link on the switch row while
 * no Zotero account is signed in. Credits and not minutes: a tier's voices
 * cost different amounts a minute (Premium 10 or 30 on 2026-09-29), and
 * which ones cost less differs by language, so no single time holds for a
 * tier; a voice's own time left is the Player's (#140).
 *
 * Read when the pane opens, after a Zotero tier's Test connection or
 * Enable, and when an account is signed in or out (ui/prefs-pane.ts). A
 * tier switched off still shows its credits: they are the account's.
 */

/**
 * More minutes than this at the tier's cheapest voice reads as Unlimited,
 * the line Zotero's own player draws (`formatTimeRemaining`, reader.js
 * 38417-38421): Standard with a Zotero Storage subscription, for one.
 */
export const UNLIMITED_MINUTES = 60 * 24 * 90;

export type CreditState = { kind: 'unknown' } | { kind: 'none' } | { kind: 'unlimited' } | { kind: 'left'; credits: number };

/** What the line says for a tier's figure; with no price known the figure itself is shown. */
export function creditState(credits: number | null, cheapest: number | null): CreditState {
  if (credits === null) return { kind: 'unknown' };
  if (credits <= 0) return { kind: 'none' };
  if (cheapest !== null && cheapest > 0 && credits / cheapest > UNLIMITED_MINUTES) return { kind: 'unlimited' };
  return { kind: 'left', credits };
}

/** Each tier's lowest price per minute among the listed voices; null where none has one. */
export function cheapestPrices(voices: readonly ZoteroVoice[]): Record<ZoteroTier, number | null> {
  const out: Record<ZoteroTier, number | null> = { standard: null, premium: null };
  for (const voice of voices) {
    const price = voice.creditsPerMinute;
    if (price === undefined) continue;
    const known = out[voice.tier];
    if (known === null || price < known) out[voice.tier] = price;
  }
  return out;
}

export type TierCredits = { credits: number | null; cheapest: number | null; state: CreditState };

/**
 * Both tiers' figures and prices, read in parallel. A listing that fails
 * only costs the Unlimited check, and is logged; credits that cannot be
 * read reject.
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
  const cheapest = cheapestPrices(voices);
  const tier = (id: ZoteroTier): TierCredits => ({ credits: credits[id], cheapest: cheapest[id], state: creditState(credits[id], cheapest[id]) });
  return { standard: tier('standard'), premium: tier('premium') };
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
      text.textContent =
        state.kind === 'none'
          ? t('ztts-zotero-credits-none')
          : state.kind === 'unlimited'
            ? t('ztts-zotero-credits-unlimited')
            : t('ztts-zotero-credits-left', { credits: state.credits });
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
