import { affectedReading } from '../src/read-aloud/settings-impact';
import { loadSettings } from '../src/core/settings';
import { flattenSettings } from '../src/core/settings-backup';
import { describe, expect, it, vi } from 'vitest';
import { createPlayerController } from '../src/read-aloud/player-controller';
import { PREF_PREFIX } from '../src/core/settings';

function fixture() {
  const values = new Map<string, unknown>();
  const manager = {
    active: false, paused: true, speed: 1.2, lang: 'en', region: 'US', currentVoiceRegion: 'US',
    selectedTier: 'fish', selectedVoiceID: 'fish::one', buffering: false, error: null,
    allVoices: [{ id: 'fish::one', name: 'One', tier: 'fish' }],
    voicesForLanguage: [{ id: 'fish::one', name: 'One', tier: 'fish' }],
    languages: new Set(['en-US']), tiers: new Set(['fish']),
    selectVoice: vi.fn(), selectTier: vi.fn(), setLanguage: vi.fn(), setSpeed: vi.fn(),
  };
  const reader = { _internalReader: { _readAloudManager: manager, _state: { readAloudState: { popupOpen: false } } } };
  const start = vi.fn(), close = vi.fn(), togglePaused = vi.fn(), rememberSpeed = vi.fn(), follow = vi.fn(), navigate = vi.fn();
  const following = new Map<unknown, boolean>();
  const automatic = (reader: unknown) => following.get(reader) ?? true;
  const manual = vi.fn((reader: unknown) => { following.set(reader, false); });
  follow.mockImplementation((reader: unknown) => { following.set(reader, true); });
  const prefs = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value); } };
  const remainingTime = vi.fn(() => ({ status: 'ready' as const, scope: 'document' as const, seconds: 100 }));
  const message = vi.fn((key: string, _args?: Record<string, string | number>) => key);
  const controller = createPlayerController({
    remainingTime,
    affectedTabs: changes => affectedReading(flattenSettings(loadSettings(prefs)), changes, manager.active ? [{ title: 'Paper', voices: [{ id: manager.selectedVoiceID, provider: 'fish' }] }] : []),
    prefs: { get: key => values.get(key), set: (key, value) => { values.set(key, value); } },
    labels: () => ({ fish: 'Fish Audio', standard: 'Zotero Standard', premium: 'Zotero Premium' }), clone: (_reader, value) => value,
    start, close, togglePaused, rememberSpeed, follow, navigate, automatic, manual, anyReading: () => manager.active,
    message,
  });
  return { remainingTime, values, manager, reader, controller, start, close, togglePaused, rememberSpeed, follow, following, manual, navigate, message };
}

describe('player controller', () => {
  it('can favorite another voice during filtered playback without removing the playing voice', async () => {
    const f = fixture();
    f.manager.active = true;
    f.values.set(PREF_PREFIX + 'readAloud.favoritesOnly', true);
    f.values.set(PREF_PREFIX + 'readAloud.favoriteVoices', '["fish::one"]');
    f.manager.allVoices.push({ id: 'fish::two', name: 'Two', tier: 'fish' });
    await f.controller.command(f.reader, 'favorite', 'fish::two');
    expect(JSON.parse(String(f.values.get(PREF_PREFIX + 'readAloud.favoriteVoices')))).toEqual(['fish::one', 'fish::two']);
    await expect(f.controller.command(f.reader, 'favorite', 'fish::one')).rejects.toThrow();
  });
  it('uses the native label getter instead of exposing an encoded voice id', () => {
    const f = fixture();
    Object.assign(f.manager.voicesForLanguage[0], { name: undefined, label: 'Abel — Warm US male (EN)' });
    expect(f.controller.snapshot(f.reader).voices[0].label).toBe('Abel — Warm US male (EN)');
  });
  it('treats a dead reader as closed instead of repeatedly throwing during cleanup', () => {
    const f = fixture();
    const reader = { get _internalReader(): never { throw new Error('dead object'); } };
    expect(f.controller.snapshot(reader)).toMatchObject({ opened: false, active: false, playing: false, voices: [] });
  });
  it('uses listed regional voices and rejects an arbitrary voice without mutating the manager', async () => {
    const f = fixture();
    expect(f.controller.snapshot(f.reader).voices).toEqual([{ value: 'fish::one', label: 'One' }]);
    await expect(f.controller.command(f.reader, 'voice', 'fish::missing')).rejects.toThrow();
    expect(f.manager.selectVoice).not.toHaveBeenCalled();
  });
  it('opens through the existing start path and only toggles an active session', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'play');
    expect(f.start).toHaveBeenCalledWith(f.reader);
    f.manager.active = true;
    await f.controller.command(f.reader, 'play');
    expect(f.togglePaused).toHaveBeenCalledWith(f.reader);
    await f.controller.command(f.reader, 'close');
    expect(f.close).toHaveBeenCalledWith(f.reader);
  });
  it('does not persist speed through an idle manager, which can start playback', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'speed', 1.7);
    expect(f.manager.setSpeed).toHaveBeenCalledWith(1.7, false);
    expect(f.rememberSpeed).toHaveBeenCalledWith(1.7);
    await expect(f.controller.command(f.reader, 'speed', NaN)).rejects.toThrow();
  });
  it('writes the shared favorite and volume preferences and protects a favorite-only active catalog', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'favorite', 'fish::one');
    expect(JSON.parse(String(f.values.get(PREF_PREFIX + 'readAloud.favoriteVoices')))).toEqual(['fish::one']);
    await f.controller.command(f.reader, 'volume', 35);
    expect(f.values.get(PREF_PREFIX + 'readAloud.volume')).toBe(35);
    f.values.set(PREF_PREFIX + 'readAloud.favoritesOnly', true); f.manager.active = true;
    await expect(f.controller.command(f.reader, 'favorite', 'fish::one')).rejects.toThrow();
  });
  it('reports the current reader follow state even when the old global preference is enabled', () => {
    const f = fixture();
    f.values.set(PREF_PREFIX + 'readAloud.autoScrollEnabled', true);
    f.following.set(f.reader, false);
    expect(f.controller.snapshot(f.reader).automatic).toBe(false);
    f.following.set(f.reader, true);
    expect(f.controller.snapshot(f.reader).automatic).toBe(true);
  });
  it('changes only this reader and restores following without starting paused playback', async () => {
    const f = fixture();
    const other = { ...f.reader };
    f.manager.active = true;
    await f.controller.command(f.reader, 'automatic', false);
    expect(f.manual).toHaveBeenCalledWith(f.reader);
    expect(f.values.has(PREF_PREFIX + 'readAloud.autoScrollEnabled')).toBe(false);
    expect(f.controller.snapshot(f.reader).automatic).toBe(false);
    expect(f.controller.snapshot(other).automatic).toBe(true);
    await f.controller.command(f.reader, 'automatic', true);
    expect(f.follow).toHaveBeenLastCalledWith(f.reader);
    expect(f.controller.snapshot(f.reader).automatic).toBe(true);
    expect(f.togglePaused).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it.each(['previousParagraph', 'previousSentence', 'nextSentence', 'nextParagraph'])('routes %s through the shared navigation path without starting playback', async action => {
    const f = fixture(); f.manager.active = true;
    await f.controller.command(f.reader, 'navigate', action);
    expect(f.navigate).toHaveBeenCalledWith(f.reader, action);
    expect(f.togglePaused).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
    await expect(f.controller.command(f.reader, 'navigate', 'arbitrary')).rejects.toThrow();
    expect(f.navigate).toHaveBeenCalledTimes(1);
  });
  it('clones language options into the reader realm and validates provider and locale choices', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'locale', 'en-US');
    expect(f.manager.setLanguage).toHaveBeenCalledWith('en', { region: 'US', persist: true });
    await expect(f.controller.command(f.reader, 'provider', 'missing')).rejects.toThrow();
  });
});

it('shows remaining time by default, and switching it off bypasses estimation immediately', () => {
  const f = fixture();
  expect(f.controller.snapshot(f.reader).remaining).toEqual([{ text: 'ztts-time-summary' }]);
  expect(f.remainingTime).toHaveBeenCalledTimes(1);
  f.values.set(PREF_PREFIX + 'readAloud.remainingTime', false);
  expect(f.controller.snapshot(f.reader).remaining).toEqual([]);
  expect(f.remainingTime).toHaveBeenCalledTimes(1);
});

describe('a Zotero voice’s time left and its account errors (issue #140)', () => {
  /** Zotero's voice: `minutesRemaining` is a getter, credits over the voice's price (reader.js 39256-39263). */
  const zoteroVoice = (id: string, label: string, minutes: () => number | null) =>
    Object.defineProperty({ id, label, tier: 'premium' }, 'minutesRemaining', { get: minutes, enumerable: true });
  function premium() {
    const f = fixture();
    const voices = [
      zoteroVoice('prm-1', 'Premium Voice 1', () => 26),
      zoteroVoice('prm-5', 'Premium Voice 5', () => 260 / 30),
      zoteroVoice('prm-6', 'Premium Voice 6', () => 2.5),
      zoteroVoice('prm-7', 'Premium Voice 7', () => 60 * 24 * 90 + 1),
      zoteroVoice('prm-8', 'Premium Voice 8', () => null),
      zoteroVoice('prm-9', 'Premium Voice 9', () => { throw new Error('dead object'); }),
    ];
    Object.assign(f.manager, { selectedTier: 'premium', selectedVoiceID: 'prm-1', voicesForLanguage: voices, allVoices: voices, tiers: new Set(['premium', 'fish']) });
    return f;
  }

  it('gives each Zotero voice its time left in the owner’s min, low under 3 minutes, nothing when unknown or past 90 days', () => {
    const f = premium();
    expect(f.controller.snapshot(f.reader).voices).toEqual([
      { value: 'prm-1', label: 'Premium Voice 1', time: '26min', low: false },
      { value: 'prm-5', label: 'Premium Voice 5', time: '9min', low: false },
      { value: 'prm-6', label: 'Premium Voice 6', time: '3min', low: true },
      { value: 'prm-7', label: 'Premium Voice 7' },
      { value: 'prm-8', label: 'Premium Voice 8' },
      { value: 'prm-9', label: 'Premium Voice 9' },
    ]);
  });

  it('leaves a plugin voice without a time', () => {
    const f = fixture();
    expect(f.controller.snapshot(f.reader).voices).toEqual([{ value: 'fish::one', label: 'One' }]);
  });

  it('words a Zotero voice’s refusal with credits left as the reminder does, naming the tier', () => {
    const f = premium();
    f.manager.error = 'quota-exceeded' as never;
    expect(f.controller.snapshot(f.reader).error).toBe('ztts-player-zotero-short');
    expect(f.message).toHaveBeenCalledWith('ztts-player-zotero-short', { tier: 'Zotero Premium' });
  });

  it('names Zotero’s daily limit as such', () => {
    const f = premium();
    f.manager.error = 'daily-limit-exceeded' as never;
    expect(f.controller.snapshot(f.reader).error).toBe('ztts-player-daily-limit');
    expect(f.message).toHaveBeenCalledWith('ztts-player-daily-limit', { tier: 'Zotero Premium' });
  });

  it('keeps a plugin provider’s limit, and every other error, as they were', () => {
    const f = fixture();
    f.manager.error = 'quota-exceeded' as never;
    expect(f.controller.snapshot(f.reader).error).toBe('ztts-player-quota-error');
    const g = premium();
    g.manager.error = 'network' as never;
    expect(g.controller.snapshot(g.reader).error).toBe('ztts-player-playback-error');
  });
});
