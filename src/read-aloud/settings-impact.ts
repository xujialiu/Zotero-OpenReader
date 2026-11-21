import type { FlatSettings } from '../core/settings-backup';
import { favoritesLimitList, parseFavoriteVoices, type FavoriteListings } from './favorites';
import { decodeVoiceId } from './voice-catalog';
import { sectionOf } from '../core/settings-sync';
import { SWITCH_IDS } from '../core/settings';
import { isPlayerOpen } from './player-stop';

// Direct playback controls remain usable. These keys are checked when a
// restore or background sync would change playback as a side effect.
const PLAYBACK_SETTINGS = new Set([
  'readAloud.prefetchCustom', 'readAloud.prefetchSentences', 'readAloud.prefetchRequests', 'cacheAudio', 'readAloud.volume',
  'readAloud.sameForAllDocuments', 'readAloud.globalSpeed', 'readAloud.speedPercent',
  'readAloud.sentenceDelayEnabled', 'readAloud.sentenceDelayMs',
  'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
]);

export interface ReadingSession {
  title: string;
  /** The reader it runs in, for the guard to close exactly the tabs it listed (issue #160). */
  reader?: unknown;
  uncertain?: boolean;
  /** The playing voice and any prepared replacement, including paused playback. */
  voices: { id: string; provider: string }[];
}

/**
 * Turning a provider or a Zotero tier on only adds voices to a player's
 * list, which refreshes without touching the reading (issue #160).
 */
function turnsOn(key: string, value: unknown): boolean {
  return value === true && key === `${sectionOf(key)}.enabled` && (SWITCH_IDS as readonly string[]).includes(sectionOf(key));
}

/** The proposed batch is inspected before any preference is written. */
export function affectedReading(current: FlatSettings, changes: FlatSettings, sessions: readonly ReadingSession[]): string[] {
  return affectedSessions(current, changes, sessions).map(session => session.title);
}

function affectedSessions<S extends ReadingSession>(current: FlatSettings, changes: FlatSettings, sessions: readonly S[],
  listings?: (reader: unknown) => FavoriteListings | null): S[] {
  const changed = Object.keys(changes).filter(key => changes[key] !== current[key]);
  const next = { ...current, ...changes };
  const providerKeys = changed.filter(key => (SWITCH_IDS as readonly string[]).includes(sectionOf(key)));
  const protectedProviders = new Set(providerKeys.filter(key => !turnsOn(key, changes[key])).map(sectionOf));
  const playbackChanged = changed.some(key => PLAYBACK_SETTINGS.has(key));
  const favoritesEdited = changed.some(key => key === 'readAloud.favoritesOnly' || key === 'readAloud.favoriteVoices');
  const favorites = new Set(next['readAloud.favoritesOnly'] === true && favoritesEdited
    ? parseFavoriteVoices(next['readAloud.favoriteVoices']) : []);
  return sessions.filter(session => {
    if (playbackChanged || (session.uncertain && protectedProviders.size > 0)) return true;
    if (session.voices.some(voice => protectedProviders.has(voice.provider))) return true;
    if (!favorites.size || !session.voices.some(voice => !favorites.has(voice.id))) return false;
    // A simultaneous provider edit can invalidate what this catalog knows.
    const catalog = providerKeys.length ? null : listings?.(session.reader);
    return !catalog || favoritesLimitList(favorites, catalog);
  });
}

export function createReadingImpact(deps: {
  values(): FlatSettings;
  readers(): readonly any[];
  pending(reader: any): readonly string[];
  listings?(reader: unknown): FavoriteListings | null;
  title(reader: any): string;
}) {
  function protectedVoices(reader: any): string[] {
    const m = reader?._internalReader?._readAloudManager;
    return [...new Set([m?._voice?.id, m?.selectedVoiceID, ...deps.pending(reader)]
      .filter((id): id is string => typeof id === 'string' && !!id))];
  }
  function sessions(): ReadingSession[] {
    const out: ReadingSession[] = [];
    for (const reader of deps.readers()) {
      if (!isPlayerOpen(reader)) continue;
      const m = reader._internalReader?._readAloudManager;
      const ids = protectedVoices(reader);
      const voices = ids.map(id => {
        const decoded = decodeVoiceId(id);
        if (decoded) return { id, provider: decoded.provider };
        let tier = m?._voice?.id === id ? m._voice.tier : null;
        for (let i = 0; !tier && i < (m?._allVoices?.length ?? 0); i++) if (m._allVoices[i].id === id) tier = m._allVoices[i].tier;
        return { id, provider: tier === 'standard' || tier === 'premium' ? 'zotero-' + tier : '' };
      });
      out.push({ title: deps.title(reader), reader, voices, uncertain: !voices.length || voices.some(v => !v.provider) });
    }
    return out;
  }
  const affected = (changes: FlatSettings) => affectedSessions(deps.values(), changes, sessions(), deps.listings);
  return {
    sessions,
    protectedVoices,
    affectedTabs: (changes: FlatSettings) => affected(changes).map(session => session.title),
    affectedSessions: affected,
  };
}
