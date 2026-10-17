import { describe, expect, it } from 'vitest';
import { createDocumentVoices } from '../../src/core/document-voices';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { createReadAloudMemorySync, READ_ALOUD_VOICES_OBSERVER } from '../../src/read-aloud/memory-sync';
import { createProviderTiers } from '../../src/read-aloud/provider-tiers';
import { pluginVoiceTier } from '../../src/read-aloud/voice-catalog';
import { loadZoteroReadAloud } from './engine/zotero';

/**
 * A pick in the Player while the Document voice is unavailable (issue #183).
 * The unavailable-voice guard leaves the manager inactive with no voice; the
 * user then does what the notice says and picks a voice or an Entry. Zotero
 * persists the pick through `_setReadAloudVoice`, whose inactive branch runs
 * the restore and `activate()` inside the pick — and the restore read the
 * Document voice from before the pick, so Zotero fell back to its first voice.
 */

const KEY = 'user/ABCDEFGH';
const AOEDE = 'local::af_aoede'; // the Document voice; the Kokoro server is down, so the list lacks it
const AVA = 'standard-ava'; // a Zotero Standard voice, paid with credits
const ANDREW = 'standard-andrew';
const ARIA = 'azure::en-US-AriaNeural'; // the first plugin voice, where Zotero's fallback lands
const JENNY = 'azure::en-US-JennyNeural';
const KATJA = 'azure::de-DE-KatjaNeural';

const config = (locales: Record<string, string[]>) => ({
  voices: Object.fromEntries(Object.values(locales).flat().map((id) => [id, { label: id }])),
  locales,
  segmentGranularity: 'sentence',
});

/**
 * One reader tab with its Player open: Zotero 10.0.3's own ReadAloudManager
 * (the verbatim excerpt the Engine's tests run), the reader-side methods
 * around it as reader.js has them (`_setReadAloudVoice` with the xpcom pref
 * write, `_syncPersistedVoicesToManager`, the auto-activation of
 * `_onReadAloudEngineStateChanged`), Zotero.Prefs' synchronous observers, and
 * the real memory sync and provider tiers attached in index.ts's order.
 */
async function openPlayer(listed: { zotero: string[]; plugin: Record<string, string[]> }, saved: string | null) {
  const { ReadAloudManager } = loadZoteroReadAloud();
  const store: Record<string, unknown> = {};
  const observers: { name: string; handler: () => void }[] = [];
  const prefs: PrefsBackend = {
    get: (key) => store[key],
    set: (key, value) => {
      if (store[key] === value) return;
      store[key] = value;
      for (const { name, handler } of [...observers]) if (`extensions.zotero.${name}` === key) handler();
    },
  };
  const pref = (): Record<string, any> => JSON.parse((store[READ_ALOUD_VOICES_PREF] as string | undefined) ?? '{}');
  const internal: any = {
    _state: { readAloudVoices: new Map(Object.entries(pref())) },
    _syncPersistedVoicesToManager() {
      const manager = this._readAloudManager;
      const persisted = this._state.readAloudVoices.get(manager.lang);
      manager.applyPersistedVoices(persisted || {});
      if (persisted?.speed) manager.setSpeed(persisted.speed);
    },
    _setReadAloudVoice({ lang, region, voice, speed, tier }: any) {
      const tierVoices = { ...pref()[lang]?.tierVoices };
      if (tier) {
        delete tierVoices[tier];
        tierVoices[tier] = voice;
      }
      prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...pref(), [lang]: { region, voice, speed, tierVoices } }));
      const inState = { ...this._state.readAloudVoices.get(lang)?.tierVoices };
      if (tier) {
        delete inState[tier];
        inState[tier] = voice;
      }
      this._state.readAloudVoices = new Map([...this._state.readAloudVoices, [lang, { region, voice, speed, tierVoices: inState }]]);
      if (!this._readAloudManager.active) {
        this._readAloudManager.setLanguage(lang);
        this._syncPersistedVoicesToManager();
        if (this._readAloudManager.selectedVoiceID) this._readAloudManager.activate();
      }
    },
    _onReadAloudEngineStateChanged() {
      const manager = this._readAloudManager;
      if (manager.selectedVoiceID && !manager.active) manager.activate();
    },
  };
  const manager = new ReadAloudManager({
    remoteInterface: {
      getVoices: async () => ({ voices: { standard: [config({ 'en-US': listed.zotero })], local: [config(listed.plugin)] } }),
    },
    onStateChange: () => internal._onReadAloudEngineStateChanged(),
    onRequestSegments: () => {},
    onComputeRepositionIndex: () => null,
    onSetVoice: (data: unknown) => internal._setReadAloudVoice(data),
  });
  internal._readAloudManager = manager;
  const reader: any = {
    _internalReader: internal,
    _handleReadAloudVoicesPrefChange: () => {
      internal._state.readAloudVoices = new Map(Object.entries(pref()));
    },
  };
  const errors: unknown[] = [];
  const announced: string[] = [];
  const sync = createReadAloudMemorySync({
    prefs,
    documentKey: () => KEY,
    sameVoice: () => true,
    globalSpeed: () => true,
    registerObserver: (name, handler) => {
      const entry = { name, handler };
      observers.push(entry);
      return entry;
    },
    unregisterObserver: () => {},
    readers: () => [reader],
    localEngine: () => 'Kokoro',
    announce: (_reader, message) => announced.push(message),
    error: (e) => errors.push(e),
  });
  // The reader registers its own pref observer when it opens, after the plugin's
  observers.push({ name: READ_ALOUD_VOICES_OBSERVER, handler: reader._handleReadAloudVoicesPrefChange });
  const documents = createDocumentVoices(prefs);
  if (saved) documents.choose(KEY, { id: saved, lang: 'en' });

  // The Player opens: the memory sync, then the provider tiers (whose selectTier hook wraps the sync's), as index.ts attaches them;
  // Zotero loads the list, and its auto-activation meets the unavailable-voice guard
  sync.attach(reader);
  createProviderTiers({
    voiceTiers: () => (id) => pluginVoiceTier(id, 'Kokoro'),
    labels: () => ({}),
    defaultVoice: () => null,
    error: (e) => errors.push(e),
  }).attach(reader);
  manager.setLanguage('en');
  internal._syncPersistedVoicesToManager();
  await manager.loadVoices(true);
  await Promise.resolve();
  await Promise.resolve();
  return { manager, errors, announced, entry: () => pref()[manager.lang], record: () => documents.get(KEY) };
}

const ENGLISH = { 'en-US': [ARIA, JENNY] };

describe('a pick in the Player while the Document voice is unavailable (issue #183)', () => {
  it('opens with nothing started, nothing selected and the saved voice intact', async () => {
    const t = await openPlayer({ zotero: [AVA, ANDREW], plugin: ENGLISH }, AOEDE);
    expect(t.manager.active).toBe(false);
    expect(t.manager.selectedVoiceID).toBe(null);
    expect(t.record()?.voice.id).toBe(AOEDE);
    expect(t.announced.length).toBeGreaterThan(0);
  });

  it('an Entry picked with Zotero Standard listed starts in that Entry, not on a Zotero voice', async () => {
    const t = await openPlayer({ zotero: [AVA, ANDREW], plugin: ENGLISH }, AOEDE);
    t.manager.selectTier('azure');
    expect(t.manager.selectedTier).toBe('azure');
    expect(t.manager.selectedVoiceID).toMatch(/^azure::/);
    expect(t.manager.active).toBe(true);
    expect(t.record()).toMatchObject({ voice: { id: t.manager.selectedVoiceID, lang: 'en' }, manual: true });
    expect(t.errors).toEqual([]);
  });

  it('a voice picked with Zotero voices not listed is the voice reading starts on, saved as the Document voice', async () => {
    const t = await openPlayer({ zotero: [], plugin: ENGLISH }, AOEDE);
    t.manager.selectVoice(JENNY);
    expect(t.manager.selectedVoiceID).toBe(JENNY);
    expect(t.manager.active).toBe(true);
    expect(t.entry().voice).toBe(JENNY);
    expect(t.record()).toMatchObject({ voice: { id: JENNY, lang: 'en' }, manual: true });
    expect(t.errors).toEqual([]);
  });

  it('a language picked is kept with the voice Zotero resolves for it', async () => {
    const t = await openPlayer({ zotero: [], plugin: { 'en-US': [ARIA, JENNY], 'de-DE': [KATJA] } }, AOEDE);
    t.manager.setLanguage('de', { persist: true });
    expect(t.manager.lang).toBe('de');
    expect(t.manager.selectedVoiceID).toBe(KATJA);
    expect(t.record()).toMatchObject({ voice: { id: KATJA, lang: 'de' }, manual: true });
    expect(t.errors).toEqual([]);
  });

  it('a second pick, on the session the first one started, is kept too', async () => {
    const t = await openPlayer({ zotero: [], plugin: ENGLISH }, AOEDE);
    t.manager.selectVoice(JENNY);
    t.manager.selectVoice(ARIA);
    expect(t.manager.selectedVoiceID).toBe(ARIA);
    expect(t.record()?.voice.id).toBe(ARIA);
  });

  it('control: with no Document voice saved, the same picks are kept', async () => {
    const a = await openPlayer({ zotero: [AVA, ANDREW], plugin: ENGLISH }, null);
    a.manager.selectTier('azure');
    expect(a.manager.selectedTier).toBe('azure');
    expect(a.record()?.voice.id).toMatch(/^azure::/);
    const b = await openPlayer({ zotero: [], plugin: ENGLISH }, null);
    b.manager.selectVoice(JENNY);
    expect(b.manager.selectedVoiceID).toBe(JENNY);
    expect(b.record()?.voice.id).toBe(JENNY);
  });
});
