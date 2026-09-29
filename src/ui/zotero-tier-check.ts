import { t } from '../core/l10n';
import type { ZoteroTier } from '../core/settings';
import type { ZoteroVoiceService } from '../read-aloud/zotero-voices';
import type { CheckOutcome } from './provider-rows';

/**
 * The check Enable and Test connection run on one of Zotero's own tiers
 * (issue #111), as every provider's section runs its connection check:
 * a Zotero sync account is signed in — `Zotero.Sync.Runner.enabled`, the
 * very flag Zotero's reader hands its player as `loggedIn`
 * (`xpcom/reader.js` 270, 2881), without which the player lists neither
 * tier — then Zotero's `tts/voices` lists at least one voice of the
 * tier. Not signed in or an empty tier fails, so the switch stays off
 * with the reason beside it; otherwise the voice count. The credits have
 * a line of their own under the tier's name (ui/zotero-credit-rows.ts,
 * issue #159), read again after each check.
 */
export interface ZoteroTierCheckDeps {
  signedIn(): boolean;
  service: Pick<ZoteroVoiceService, 'listVoices'>;
}

/** The tier's name as the pane's rows say it: Zotero's own word for it. */
export const zoteroTierName = (tier: ZoteroTier): string => t(tier === 'standard' ? 'ztts-zotero-standard' : 'ztts-zotero-premium');

export async function checkZoteroTier(tier: ZoteroTier, deps: ZoteroTierCheckDeps): Promise<CheckOutcome> {
  if (!deps.signedIn()) return { ok: false, message: t('ztts-zotero-not-signed-in') };
  const name = zoteroTierName(tier);
  const voices = await deps.service.listVoices();
  // One entry per voice and locale: the count is of voices
  const count = new Set(voices.filter((voice) => voice.tier === tier).map((voice) => voice.id)).size;
  if (!count) return { ok: false, message: t('ztts-zotero-tier-empty', { tier: name }) };
  return { ok: true, message: t('ztts-zotero-tier-ok', { count, tier: name }) };
}
