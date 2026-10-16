import type { RemainingSnapshot } from '../core/engine/session';
import type { L10nArgs } from '../core/l10n';
import { remainingTimeLines, type RemainingTimeLine } from '../ui/remaining-time';
import type { FlatSettings } from '../core/settings-backup';
import { NAVIGATION_ACTIONS, type NavigationAction } from '../core/shortcut-actions';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { VOLUME_PREF, clampVolume } from '../core/read-aloud-volume';
import { parseFavoriteVoices, serializeFavoriteVoices, toggleFavoriteVoice } from './favorites';
import { baseLanguage, dropdownLabels, languageDisplayName } from './language-dropdown';
import { compareVoiceLabels } from './voice-catalog';
import { formatTimeLeft, isLowTime } from '../core/time-left';

/** `time` and `low`: a Zotero voice's time left, rounded up, and whether it is under 3 minutes (issue #140). */
export interface PlayerOption { value: string; label: string; time?: string; low?: boolean }
export interface PlayerSnapshot {
  expandOnOpen: boolean; opened: boolean; active: boolean; playing: boolean; buffering: boolean;
  provider: string; locale: string; voice: string; speed: number; volume: number; automatic: boolean;
  providers: PlayerOption[]; locales: PlayerOption[]; voices: PlayerOption[]; favorites: string[];
  error: string | null;
  remaining?: RemainingTimeLine[];
}
export interface PlayerControllerDeps {
  prefs: PrefsBackend;
  labels(): Record<string, string>;
  clone(reader: any, value: unknown): any;
  start(reader: any): void;
  close(reader: any): void;
  togglePaused(reader: any): void;
  rememberSpeed(speed: number): void;
  follow(reader: any): void;
  navigate(reader: any, action: NavigationAction): void;
  automatic(reader: any): boolean;
  manual(reader: any): void;
  anyReading(): boolean;
  affectedTabs?(changes: FlatSettings): string[];
  message(key: string, args?: L10nArgs): string;
  remainingTime?(reader: any): RemainingSnapshot;
}

/** The reader engine is isolated here; the player consumes only JSON and commands. */
export function createPlayerController(deps: PlayerControllerDeps) {
  const managerOf = (reader: any): any => {
    try { const manager = reader?._internalReader?._readAloudManager; void manager?.active; return manager; }
    catch { return null; }
  };
  const popupOpen = (reader: any): boolean => {
    try { return !!reader?._internalReader?._state?.readAloudState?.popupOpen; }
    catch { return false; }
  };
  const pref = (key: string) => deps.prefs.get(PREF_PREFIX + 'readAloud.' + key);
  const write = (key: string, value: unknown) => deps.prefs.set(PREF_PREFIX + 'readAloud.' + key, value);
  /** A Zotero voice's minutes left: its own getter, credits over its price (reader.js 39256-39263); null for a plugin voice. */
  const minutesOf = (voice: any): number | null => {
    try {
      const minutes = voice?.minutesRemaining;
      return typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : null;
    } catch { return null; }
  };
  // Reader-compartment arrays must be walked by index, never with a sandbox callback.
  const voicesOf = (source: any): PlayerOption[] => {
    const rows: PlayerOption[] = [];
    for (let i = 0; i < (source?.length ?? 0); i++) {
      const voice = source[i];
      if (typeof voice?.id !== 'string') continue;
      const row: PlayerOption = { value: voice.id, label: String(voice.label ?? voice.name ?? voice.id) };
      const minutes = minutesOf(voice);
      const time = formatTimeLeft(minutes);
      if (time !== null) Object.assign(row, { time, low: isLowTime(minutes) });
      rows.push(row);
    }
    return rows.sort((a, b) => compareVoiceLabels(a.label, b.label));
  };
  /**
   * The ! of the Player. A Zotero voice's two account errors (issue #140)
   * are worded as Zotero's: its daily limit (`daily-limit-exceeded`,
   * syncAPIClient.js 717-721), and `quota-exceeded` with Zotero's Standard
   * or Premium selected — which a plugin provider's rate limit also reads
   * as, so only then. Used up or at the daily limit, the tier is switched
   * off and the player closed (read-aloud/zotero-refusals.ts); this is the
   * refusal with credits left, which keeps the player and Retry.
   */
  function errorOf(m: any, labels: Record<string, string>): string | null {
    if (!m?.error) return null;
    const tier = String(m?.selectedTier ?? '');
    const name = labels[tier] ?? tier;
    if (m.error === 'daily-limit-exceeded') return deps.message('ztts-player-daily-limit', { tier: name });
    if (m.error === 'quota-exceeded' && (tier === 'standard' || tier === 'premium')) return deps.message('ztts-player-zotero-short', { tier: name });
    return deps.message(m.error === 'quota-exceeded' ? 'ztts-player-quota-error' : 'ztts-player-playback-error');
  }
  function snapshot(reader: any): PlayerSnapshot {
    const m = managerOf(reader);
    const labels = deps.labels();
    const providers: PlayerOption[] = [];
    if (m?.tiers) for (const tier of m.tiers) providers.push({ value: String(tier), label: labels[tier] ?? String(tier) });
    providers.sort((a, b) => compareVoiceLabels(a.label, b.label));
    const languages: string[] = [];
    if (m?.languages) for (const language of m.languages) languages.push(String(language));
    const locales = [...dropdownLabels(languages, languageDisplayName)].map(([value, label]) => ({ value, label }));
    locales.sort((a, b) => a.value === 'mul' ? -1 : b.value === 'mul' ? 1 : compareVoiceLabels(a.label, b.label));
    const region = m?.currentVoiceRegion ?? m?.region;
    const full = m?.lang ? String(m.lang) + (region ? '-' + region : '') : '';
    const locale = locales.some(v => v.value === full) ? full : locales.some(v => v.value === m?.lang) ? String(m.lang) : '';
    return {
      expandOnOpen: pref('openExpanded') === true,
      remaining: m && pref('remainingTime') !== false && deps.remainingTime ? remainingTimeLines(deps.remainingTime(reader), deps.message) : [],
      opened: popupOpen(reader) || !!m?.active,
      active: !!m?.active, playing: !!m?.active && !m?.paused, buffering: !!m?.buffering,
      provider: String(m?.selectedTier ?? ''), locale, voice: String(m?.selectedVoiceID ?? ''),
      speed: Number(m?.speed) || 1, volume: clampVolume(deps.prefs.get(VOLUME_PREF)),
      automatic: !!m && deps.automatic(reader), providers, locales,
      voices: voicesOf(m?.voicesForLanguage), favorites: parseFavoriteVoices(pref('favoriteVoices')),
      error: errorOf(m, labels),
    };
  }
  async function command(reader: any, action: string, value?: unknown): Promise<void> {
    const m = managerOf(reader);
    if (!m) throw new Error(deps.message('ztts-player-unavailable'));
    const state = snapshot(reader);
    const requireChoice = (options: PlayerOption[]): string => {
      if (typeof value !== 'string' || !options.some(v => v.value === value)) throw new Error(deps.message('ztts-player-unavailable-choice'));
      return value;
    };
    const number = (min: number, max: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(deps.message('ztts-player-invalid-value'));
      return value;
    };
    switch (action) {
      case 'open':
        if (!m.active) deps.start(reader);
        else if (m.paused) deps.togglePaused(reader);
        return;
      case 'play':
        if (m.active) deps.togglePaused(reader); else deps.start(reader);
        return;
      case 'close': deps.close(reader); return;
      case 'navigate': {
        const action = NAVIGATION_ACTIONS.find(action => action === value);
        if (!action) throw new Error(deps.message('ztts-player-invalid-value'));
        if (m.active) deps.navigate(reader, action);
        return;
      }
      case 'provider': await m.selectTier(requireChoice(state.providers)); return;
      case 'locale': {
        const language = requireChoice(state.locales), base = baseLanguage(language);
        await m.setLanguage(base, deps.clone(reader, { region: language.includes('-') ? language.slice(base.length + 1) : null, persist: true }));
        return;
      }
      case 'voice': await m.selectVoice(requireChoice(state.voices)); return;
      case 'speed': {
        const speed = number(0.5, 3);
        m.setSpeed(speed, !!m.active);
        deps.rememberSpeed(speed);
        return;
      }
      case 'volume': deps.prefs.set(VOLUME_PREF, Math.round(number(0, 100))); return;
      case 'automatic':
        if (typeof value !== 'boolean') throw new Error(deps.message('ztts-player-invalid-value'));
        if (value) deps.follow(reader);
        else deps.manual(reader);
        return;
      case 'favorite': {
        const voice = requireChoice(voicesOf(m.allVoices));
        const next = serializeFavoriteVoices(toggleFavoriteVoice(state.favorites, voice));
        const affected = deps.affectedTabs ? deps.affectedTabs({ 'readAloud.favoriteVoices': next }).length > 0
          : pref('favoritesOnly') === true && deps.anyReading();
        if (affected) throw new Error(deps.message('ztts-player-favorite-guard'));
        write('favoriteVoices', next);
        return;
      }
      case 'retry':
        if (!m.active) deps.start(reader);
        else if (typeof m.retry === 'function') await m.retry();
        return;
      default: throw new Error(deps.message('ztts-player-invalid-value'));
    }
  }
  return { snapshot, command };
}
