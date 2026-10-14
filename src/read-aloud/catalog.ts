import { SynthesisError } from '../core/providers/errors';
import type { ProviderId, TTSProvider, VoiceInfo, VoiceListNotice } from '../core/providers/types';
import { getLocalEngine } from '../core/providers/local/registry';
import { enabledProviders, hiddenZoteroTiers, PROVIDER_IDS, type Settings } from '../core/settings';
import { withTimeout } from '../core/timeout';
import { providerTierLabel, tierForProvider, zoteroTierLabel, type TierEntry, type TierNaming } from './voice-catalog';
import { ZOTERO_TIERS } from './zotero-voices';

/**
 * `name` is the provider's entry name where it is not the provider's own
 * (issue #110): the local provider's engine ("Kokoro"). The entry is what
 * the player's first dropdown and the voice browser's first column show;
 * the voices' labels are their own.
 */
export type CatalogEntry = { provider: ProviderId; name?: string; voices: VoiceInfo[]; notices?: VoiceListNotice[]; failure?: ListingFailure };

/**
 * Why a provider's entry is empty (issue #179): its listing failed or ran
 * past its bound. `key` when it refused the key or has none, `unreachable`
 * for everything else — a network or server failure, a local server that
 * is not running, the bound. The Player says which, instead of taking a
 * document voice it cannot find for one that is gone.
 */
export type ListingFailure = { reason: 'key' | 'unreachable'; detail: string };

/** A provider whose voices this listing could not get, and why (issue #179). */
export type UnlistedProvider = { provider: ProviderId; reason: ListingFailure['reason'] };

/**
 * The providers of a catalog whose voices could not be listed: every entry
 * with a failure, and every entry with a `stale` notice as unreachable —
 * Fish Audio's, whose lists could not be fetched (fish.ts listVoices): it
 * does not fail then, it answers with what it still has, and with nothing
 * fetched this session that is its Default alone. A voice of such a
 * provider that the list lacks is one this listing could not see, not one
 * that is gone.
 */
export function unlistedProviders(entries: readonly Pick<CatalogEntry, 'provider' | 'notices' | 'failure'>[]): UnlistedProvider[] {
  const out: UnlistedProvider[] = [];
  for (const entry of entries) {
    if (entry.failure) out.push({ provider: entry.provider, reason: entry.failure.reason });
    else if (entry.notices?.some((notice) => notice.kind === 'stale')) out.push({ provider: entry.provider, reason: 'unreachable' });
  }
  return out;
}

function listingFailure(error: unknown): ListingFailure {
  const reason = error instanceof SynthesisError && (error.kind === 'auth' || error.kind === 'no-key') ? 'key' : 'unreachable';
  const message = (error as { message?: unknown } | undefined)?.message;
  return { reason, detail: String(message ?? error) };
}

/**
 * How long one provider may take to list its voices before it is skipped
 * like one that failed (issue #55). The bound Test connection puts on a
 * provider's list (ui/prefs-pane.ts TEST_CONNECTION_TIMEOUT_MS), so the
 * pane and the popup agree on how long is too long.
 */
export const PROVIDER_LISTING_TIMEOUT_MS = 15_000;

/**
 * For the callers that cap the whole listing as a last resort (the voice
 * browser, the diagnostics): every provider settles within the bound
 * above, so this fires only if the catalog itself hangs — and it sits
 * above the bound, or the two would tie.
 */
export const CATALOG_CAP_MS = PROVIDER_LISTING_TIMEOUT_MS + 5_000;

export type CatalogBound = {
  /** How long one provider may take; PROVIDER_LISTING_TIMEOUT_MS by default. */
  timeoutMs?: number;
  /**
   * The AbortController for one provider's request, so a listing that runs
   * past the bound is cancelled rather than left running. From a chrome
   * window — the plugin sandbox has none (CLAUDE.md); absent, or null, the
   * request is left to finish on its own and the rejection is what matters.
   */
  newAbortController?: () => AbortController | null;
};

/**
 * List the voices of every enabled provider, in the given order. Providers
 * are independent: one that cannot list (no key, server down, unknown
 * engine) must not hide the others, so each is awaited on its own and a
 * failure is logged with the provider's name and kept as an entry with no
 * voices and the failure (issue #179) — what every consumer already makes
 * of a provider that lists none. Each is bounded on its own too (issue
 * #55): one that neither answers nor fails within the bound is kept the
 * same way, its request aborted. A provider that hung used to hold the
 * whole listing past the caller's cap, which then dropped every provider's
 * voices, the ones that had answered included.
 */
export async function collectCatalog(
  ids: readonly ProviderId[],
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
  bound: CatalogBound = {},
): Promise<CatalogEntry[]> {
  const timeoutMs = bound.timeoutMs ?? PROVIDER_LISTING_TIMEOUT_MS;
  const results = await Promise.allSettled(
    ids.map(async (id): Promise<CatalogEntry> => {
      const provider = getProvider(id);
      const controller = bound.newAbortController?.() ?? null;
      const voices = await withTimeout(
        controller ? provider.listVoices({ signal: controller.signal }) : provider.listVoices(),
        timeoutMs,
        () => new SynthesisError('network', `no voice list within ${Math.round(timeoutMs / 1000)} s`),
        () => controller?.abort(),
      );
      const notices = provider.voiceListNotices?.();
      return { provider: id, voices, ...(notices?.length ? { notices } : {}) };
    }),
  );
  const out: CatalogEntry[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      out.push(result.value);
    } else {
      const failure = listingFailure(result.reason);
      log?.(new Error(`${ids[i]}: listing voices failed: ${failure.detail}`, { cause: result.reason }));
      out.push({ provider: ids[i], voices: [], failure });
    }
  });
  return out;
}

/**
 * What the entry names depend on beyond the provider id (voice-catalog.ts
 * providerTierLabel): the local engine's name.
 */
export function providerNaming(settings: Settings): TierNaming {
  return { localEngine: getLocalEngine(settings.local.engine)?.voiceName };
}

/**
 * The tier key of every provider (voice-catalog.ts tierForProvider): the
 * provider id, the local engine's name for the local provider.
 */
export function providerTierKeys(settings: Settings): Record<ProviderId, string> {
  const { localEngine } = providerNaming(settings);
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, tierForProvider(id, localEngine)])) as Record<ProviderId, string>;
}

/**
 * The entry names by tier key — every provider's, enabled or not, and
 * Zotero's two in the plugin's copy of Zotero's words — for the player's
 * first dropdown and the stranded rule (read-aloud/provider-tiers.ts).
 */
export function providerTierLabels(settings: Settings): Record<string, string> {
  const naming = providerNaming(settings);
  const out: Record<string, string> = {};
  for (const tier of ZOTERO_TIERS) out[tier] = zoteroTierLabel(tier);
  for (const id of PROVIDER_IDS) out[tierForProvider(id, naming.localEngine)] = providerTierLabel(id, naming);
  return out;
}

/**
 * The voice browser's first column (issue #110): every enabled provider,
 * whether or not it lists anything right now, and Zotero's Standard and
 * Premium while their switches are on (issue #111) — unsorted;
 * ui/voice-browser-rows.ts sorts by label.
 */
export function providerTierColumns(settings: Settings): TierEntry[] {
  const naming = providerNaming(settings);
  const hidden: readonly string[] = hiddenZoteroTiers(settings);
  return [
    ...enabledProviders(settings).map((id) => ({ tier: tierForProvider(id, naming.localEngine), label: providerTierLabel(id, naming) })),
    ...ZOTERO_TIERS.filter((tier) => !hidden.includes(tier)).map((tier) => ({ tier, label: zoteroTierLabel(tier) })),
  ];
}

/**
 * The catalog as the plugin publishes it: every enabled provider's voices,
 * the local provider's entry named after the engine serving them
 * ("Kokoro", since "Local" says nothing once several engines exist). The
 * Read Aloud interface and the settings' voice browser both list through
 * this, so they agree on voices and entries.
 */
export async function listNamedCatalog(
  settings: Settings,
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
  bound?: CatalogBound,
): Promise<CatalogEntry[]> {
  const entries = await collectCatalog(enabledProviders(settings), getProvider, log, bound);
  const { localEngine } = providerNaming(settings);
  return entries.map((e) => (e.provider === 'local' && localEngine ? { ...e, name: localEngine } : e));
}
