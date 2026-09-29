import { sentences, t } from '../core/l10n';
import type { ZoteroRefusal } from './engine';

/**
 * What the plugin does when Zotero will not read a Zotero voice for its
 * account (issue #140), as the owner settled it on 2026-09-30:
 *
 * - **used up** — the tier's credits are 0 (read afresh from `tts/credits`,
 *   else the plugin's own figure): the tier is switched off, as its
 *   Disable does, after every player reading with it, in every tab, is
 *   closed the stop key's way (positions kept), and a reminder opens where
 *   it happened, with Add more time;
 * - **daily limit** — the tier that hit it, the same, without the link;
 *   the other tier is left until it hits the limit itself (Zotero does not
 *   say whether the two share it);
 * - **short** — Zotero refused while credits are left, for a voice dearer
 *   than what is left: nothing is switched off, the cheaper voices may
 *   still read; the reminder says so, with Add more time.
 *
 * The players close before the switch goes off, so no reading loses its
 * voice under it and the reading guard (issue #121) has nothing to refuse.
 * A tier already off, or being switched off, is left alone: two tabs that
 * fail together get one reminder.
 */

export type RefusalAction = 'used-up' | 'daily-limit' | 'short';
type Tier = ZoteroRefusal['tier'];

export function refusalAction(code: ZoteroRefusal['code'], credits: number | null, minutes: number | null): RefusalAction {
  if (code === 'daily-limit-exceeded') return 'daily-limit';
  const left = credits ?? minutes;
  return left !== null && left <= 0 ? 'used-up' : 'short';
}

export interface Reminder {
  action: RefusalAction;
  tier: Tier;
  text: string;
  /** With the Add more time link. */
  buy: boolean;
  /** Players closed in other tabs. */
  others: number;
}

export interface ZoteroRefusalsDeps<R> {
  readers(): readonly R[];
  /** The reader's player is open and reads with, or has selected, a voice of the tier; a voice being switched to does not count. */
  usesTier(reader: R, tier: Tier): boolean;
  /** The headphone button's own close (read-aloud/player-stop.ts). */
  close(reader: R): void;
  isOn(tier: Tier): boolean;
  switchOff(tier: Tier): void;
  /** The tier's credits, read afresh; null when they cannot be read. */
  credits(tier: Tier): Promise<number | null>;
  remind(reader: R, reminder: Reminder): void;
  /** "Zotero Premium", as the player's first dropdown names it. */
  label(tier: Tier): string;
  log(error: unknown): void;
  now?(): number;
}

export interface RefusalRecord {
  at: number;
  code: ZoteroRefusal['code'];
  tier: Tier;
  credits: number | null;
  minutes: number | null;
  action: RefusalAction;
  closed: number;
}

export function createZoteroRefusals<R>(deps: ZoteroRefusalsDeps<R>) {
  const busy = new Set<Tier>();
  let last: RefusalRecord | null = null;

  async function refused(reader: R, refusal: ZoteroRefusal): Promise<void> {
    const { code, tier, minutes } = refusal;
    if (!deps.isOn(tier) || busy.has(tier)) return;
    busy.add(tier);
    try {
      const credits = code === 'quota-exceeded' ? await deps.credits(tier).catch((e: unknown) => (deps.log(e), null)) : null;
      const action = refusalAction(code, credits, minutes);
      let closed = 0;
      let others = 0;
      if (action !== 'short') {
        if (!deps.isOn(tier)) return;
        for (const each of deps.readers()) {
          try {
            if (!deps.usesTier(each, tier)) continue;
            deps.close(each);
            closed++;
            if (each !== reader) others++;
          } catch (e) {
            deps.log(e);
          }
        }
        deps.switchOff(tier);
      }
      last = { at: deps.now?.() ?? Date.now(), code, tier, credits, minutes, action, closed };
      const name = deps.label(tier);
      const said = action === 'used-up' ? t('ztts-reminder-used-up', { tier: name })
        : action === 'daily-limit' ? t('ztts-reminder-daily-limit', { tier: name })
        : t('ztts-reminder-short', { tier: name });
      const text = sentences(said, others ? t('ztts-reminder-others', { count: others }) : null);
      deps.remind(reader, { action, tier, text, buy: action !== 'daily-limit', others });
    } finally {
      busy.delete(tier);
    }
  }

  return {
    refused,
    /** The last refusal acted on, for diagnostics. */
    last: (): RefusalRecord | null => last,
  };
}
