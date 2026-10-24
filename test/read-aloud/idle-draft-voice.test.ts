import { describe, expect, it } from 'vitest';
import { createDocumentVoices } from '../../src/core/document-voices';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { createEngine } from '../../src/read-aloud/engine';
import { createVoicePick } from '../../src/read-aloud/engine/voice-pick';
import { createReadAloudMemorySync, READ_ALOUD_VOICES_OBSERVER } from '../../src/read-aloud/memory-sync';
import { createPlayerController } from '../../src/read-aloud/player-controller';
import { createProviderTiers } from '../../src/read-aloud/provider-tiers';
import { pluginVoiceTier } from '../../src/read-aloud/voice-catalog';
import { VirtualClock } from '../core/engine/harness';
import { fakeAudio, FakeAudioContext, loadZoteroReadAloud, readerWindow, voicesResponse } from './engine/zotero';

const KEY = 'user/ABCDEFGH';
const ALLOY = 'openai-official::alloy';
const ARIA = 'azure::en-US-AriaNeural';
const JENNY = 'azure::en-US-JennyNeural';
const MANDARIN = 'azure::zh-CN-XiaoxiaoNeural';
const CANTONESE = 'azure::zh-HK-HiuMaanNeural';
const CANTONESE_SECOND = 'azure::zh-HK-HiuGaaiNeural';

/** The actual Player draft ingress, with native persistence/restore reentry and real choice hooks. */
async function openIdlePlayer(globalSpeed = true) {
  const clock = new VirtualClock();
  FakeAudioContext.made = [];
  const window = readerWindow(clock);
  const { ReadAloudManager } = loadZoteroReadAloud();
  const values = new Map<string, unknown>();
  const observers: { name: string; handler: () => void }[] = [];
  const prefs: PrefsBackend = {
    get: key => values.get(key),
    set: (key, value) => {
      if (values.get(key) === value) return;
      values.set(key, value);
      for (const observer of [...observers]) if (`extensions.zotero.${observer.name}` === key) observer.handler();
    },
  };
  const entries = (): Record<string, any> => JSON.parse(String(values.get(READ_ALOUD_VOICES_PREF) ?? '{}'));
  let manager: any;
  const internal: any = {
    _state: { readAloudVoices: new Map(), readAloudState: { popupOpen: false } },
    _syncPersistedVoicesToManager() {
      const entry = this._state.readAloudVoices.get(manager.lang) ?? {};
      manager.applyPersistedVoices(entry);
      if (entry.speed) manager.setSpeed(entry.speed);
    },
    // Zotero's xpcom pref write followed by the reader's inactive branch (#183).
    _setReadAloudVoice({ lang, region, voice, speed, tier }: any) {
      const tierVoices = { ...entries()[lang]?.tierVoices };
      if (tier) { delete tierVoices[tier]; tierVoices[tier] = voice; }
      prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...entries(), [lang]: { region, voice, speed, tierVoices } }));
      this._state.readAloudVoices = new Map(Object.entries(entries()));
      if (!manager.active) {
        manager.setLanguage(lang);
        this._syncPersistedVoicesToManager();
        if (manager.selectedVoiceID) manager.activate();
      }
    },
  };
  const segments = [{ text: 'One two three.' }];
  manager = new ReadAloudManager({
    remoteInterface: { getVoices: async () => ({ voices: { local: [
      ...voicesResponse([ALLOY, ARIA, JENNY]).local,
      { voices: { [MANDARIN]: { label: 'Mandarin' } }, locales: { 'zh-CN': [MANDARIN] }, segmentGranularity: 'sentence' },
      { voices: { [CANTONESE]: { label: 'Cantonese' }, [CANTONESE_SECOND]: { label: 'Second Cantonese' } }, locales: { 'zh-HK': [CANTONESE, CANTONESE_SECOND] }, segmentGranularity: 'sentence' },
    ] } }) },
    onStateChange: () => {
      if (internal._state.readAloudState.popupOpen && manager?.selectedVoiceID && !manager.active) manager.activate();
    },
    onRequestSegments: () => manager.setSegments(segments, 0, null),
    onComputeRepositionIndex: () => null,
    onSetVoice: (entry: unknown) => internal._setReadAloudVoice(entry),
  });
  internal._readAloudManager = manager;
  const reader = { _internalReader: internal, _iframeWindow: window };
  const errors: unknown[] = [];
  let pick: ReturnType<typeof createVoicePick> | null = null;
  const records = createDocumentVoices(prefs);
  records.choose(KEY, { id: 'local::missing', lang: 'en' });
  const memory = createReadAloudMemorySync({
    prefs, documentKey: () => KEY, sameVoice: () => true, globalSpeed: () => globalSpeed,
    isVoicePreview: reader => pick?.isPreviewing(reader) ?? false,
    deferVoiceChange: (reader, id, restore) => pick?.defer(reader, id, restore) ?? false,
    registerObserver: (name, handler) => { const row = { name, handler }; observers.push(row); return row; },
    unregisterObserver: token => { const i = observers.indexOf(token as (typeof observers)[number]); if (i >= 0) observers.splice(i, 1); },
    readers: () => [reader], refreshVoices: () => { internal._state.readAloudVoices = new Map(Object.entries(entries())); },
    error: error => errors.push(error),
  });
  observers.push({ name: READ_ALOUD_VOICES_OBSERVER, handler: () => { internal._state.readAloudVoices = new Map(Object.entries(entries())); } });
  memory.attach(reader);
  const tiers = createProviderTiers({
    voiceTiers: () => id => pluginVoiceTier(id), labels: () => ({}), defaultVoice: () => null,
    error: error => errors.push(error),
  });
  tiers.attach(reader);
  const engine = createEngine({
    exportFunction: fn => fn, waiveXrays: value => value, isDead: () => false,
    cloneInto: value => value, toLocal: value => new Float32Array(value),
    audioSource: () => ({ getAudio: async () => ({ audio: fakeAudio(3) }) }),
    isPluginVoice: id => id.includes('::'),
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    volume: () => 0, notice: () => {}, error: error => errors.push(error), clock,
  });
  engine.attach(reader);
  pick = createVoicePick({ engine, notice: () => {}, error: error => errors.push(error) });
  pick.attach(reader);
  await manager.loadVoices(true);
  manager.setLanguage('en');
  internal._state.readAloudState.popupOpen = true;
  manager.activate();
  const player = createPlayerController({
    prefs, labels: () => ({}), clone: (_reader, value) => value,
    choose: (reader, choice) => pick!.choose(reader, choice), draft: reader => pick!.draft(reader),
    needsVoice: reader => pick!.needsVoice(reader), pendingVoice: reader => pick!.pendingVoice(reader),
    start: () => manager.play(), close: () => manager.deactivate(), togglePaused: () => manager.togglePaused(),
    rememberSpeed: () => {}, follow: () => {}, navigate: () => {}, automatic: () => true, manual: () => {},
    anyReading: () => manager.active, message: key => key,
  });
  return {
    reader, manager, player, records, errors, entries,
    dispose() { pick?.dispose(); engine.dispose(); memory.dispose(); tiers.dispose(); },
  };
}

describe('a Voice committed from an idle Player draft (#232)', () => {
  it('keeps the exact chosen Chinese-region voice when native language normalization drops the region', async () => {
    const t = await openIdlePlayer();
    await t.player.command(t.reader, 'provider', 'azure');
    await t.player.command(t.reader, 'locale', 'zh-HK');
    await t.player.command(t.reader, 'voice', CANTONESE_SECOND);
    expect(t.manager.selectedVoiceID).toBe(CANTONESE_SECOND);
    expect(t.player.snapshot(t.reader)).toMatchObject({ locale: 'zh-HK', voice: CANTONESE_SECOND });
    expect(t.entries().zh.voice).toBe(CANTONESE_SECOND);
    expect(t.records.get(KEY)).toMatchObject({ voice: { id: CANTONESE_SECOND, lang: 'zh' }, manual: true });
    expect(t.errors).toEqual([]);
    t.dispose();
  });

  it.each([true, false])('keeps a nonfirst regional voice through native language reset and persistence (Global speed: %s)', async globalSpeed => {
    const t = await openIdlePlayer(globalSpeed);
    expect(t.manager.active).toBe(false);
    await t.player.command(t.reader, 'provider', 'azure');
    await t.player.command(t.reader, 'locale', 'en-US');
    expect(t.player.snapshot(t.reader)).toMatchObject({ voice: '', chooseVoice: true });
    expect(t.records.get(KEY)?.voice.id).toBe('local::missing');

    await t.player.command(t.reader, 'voice', JENNY);

    expect(t.manager.selectedVoiceID).toBe(JENNY);
    expect(t.player.snapshot(t.reader).voice).toBe(JENNY);
    expect(t.entries().en.voice).toBe(JENNY);
    expect(t.records.get(KEY)).toMatchObject({ voice: { id: JENNY, lang: 'en' }, manual: true });
    expect(t.errors).toEqual([]);
    t.dispose();
  });
});
