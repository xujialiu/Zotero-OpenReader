import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/read-aloud/engine';
import { createLiveVoiceList } from '../../src/read-aloud/live-voice-list';
import { createPlayerController } from '../../src/read-aloud/player-controller';
import { createRemoteInterface } from '../../src/read-aloud/remote-interface';
import { collectCatalog, type CatalogEntry } from '../../src/read-aloud/catalog';
import { SynthesisError } from '../../src/core/providers/errors';
import { writeDefaultVoice } from '../../src/core/document-voices';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import { createReadAloudMemorySync } from '../../src/read-aloud/memory-sync';
import { createReadingStart, listingProblem, type StartProblem } from '../../src/read-aloud/reading-start';
import type { VoiceChoice } from '../../src/read-aloud/read-aloud-memory';
import type { VoiceCatalogSnapshot } from '../../src/read-aloud/voice-catalog';
import { VirtualClock } from '../core/engine/harness';
import { fakeAudio, FakeAudioContext, loadZoteroReadAloud, readerWindow } from './engine/zotero';

const system: CatalogEntry = { provider: 'system', voices: [{ id: 'sam', label: 'Sam', locale: 'en-US' }] };
const azure: CatalogEntry = { provider: 'azure', voices: [{ id: 'ava', label: 'Ava', locale: 'en-US' }] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function world(timeoutMs?: number) {
  const clock = new VirtualClock();
  const bindings = new Map<unknown, { choice(): VoiceChoice | null; catalog(): VoiceCatalogSnapshot | null; report(p: StartProblem): void }>();
  const start = createReadingStart({
    clock, timeoutMs, ownsCatalog: reader => bindings.has(reader), readers: () => [...bindings.keys()],
    choice: reader => bindings.get(reader)?.choice() ?? null, catalog: reader => bindings.get(reader)?.catalog() ?? null,
    report: (reader, problem) => bindings.get(reader)?.report(problem),
    error: error => { throw error; },
  });
  return { clock, bindings, start };
}

function fixture(options: { slowAzure?: boolean; favorites?: string[]; keepNativeVoice?: boolean; saved?: string; expireAfter?: number } = {}, setup = world(options.expireAfter)) {
  const { clock, bindings, start } = setup;
  const win = readerWindow(clock);
  const { ReadAloudManager } = loadZoteroReadAloud();
  const pendingZotero = deferred<unknown>();
  const pendingAzure = deferred<CatalogEntry>();
  const requests: string[] = [];
  const positions: number[] = [];
  const problems: StartProblem[] = [];
  const errors: unknown[] = [];
  let selection: number | null = null;
  const nativeVoice = 'zotero-b';
  const values = new Map<string, unknown>([[READ_ALOUD_VOICES_PREF, JSON.stringify({ en: { voice: nativeVoice, speed: 1.2, tierVoices: { standard: nativeVoice } } })]]);
  const prefs = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value); } };
  const nativePrefs = () => JSON.parse(String(prefs.get(READ_ALOUD_VOICES_PREF)));
  const nativeList = { voices: { standard: [{ voices: { 'zotero-a': { label: 'Zotero A' }, [nativeVoice]: { label: 'Zotero B' } },
    locales: { en: ['zotero-a', nativeVoice] }, segmentGranularity: 'sentence' }] } };
  const remote = createRemoteInterface({
    listCatalog(onListed) {
      return collectCatalog(options.slowAzure ? ['system', 'azure'] : ['system'], id => ({
        id, capabilities: { wordTimestamps: false },
        async listVoices() {
          const entry = id === 'system' ? system : await pendingAzure.promise;
          if (entry.failure) throw new SynthesisError('network', entry.failure.detail);
          return entry.voices;
        },
        async synthesize() { throw new Error('This fixture supplies audio at the reader boundary'); },
      }), undefined, { onListed });
    },
    catalogProviders: () => options.slowAzure ? (['system', 'azure'] as const) : (['system'] as const),
    getFavoriteVoices: () => options.favorites ?? null,
    getProvider: () => { throw new Error('This fixture supplies audio at the reader boundary'); },
    cacheVersion: () => 'fixture',
    native: () => ({
      getVoices: () => pendingZotero.promise,
      getAudio: async () => null,
      getCreditsRemaining: async () => ({}),
      resetCredits: async () => ({}),
    }),
  });
  const manager = new ReadAloudManager({
    remoteInterface: remote,
    onStateChange: () => {
      if (options.keepNativeVoice && internal._state.readAloudState.popupOpen && manager.selectedVoiceID && !manager.active) manager.activate();
    }, onSetVoice: ({ lang, region, voice, speed, tier }: Record<string, string>) => {
      const existing = nativePrefs();
      prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...existing, [lang]: { region, voice, speed,
        tierVoices: { ...existing[lang]?.tierVoices, [tier]: voice } } }));
    },
    onRequestSegments: () => {
      const position = internal._captureReadAloudStart() ?? 0;
      positions.push(position);
      manager.setSegments(['One.', 'Two.', 'Three.'].map(text => ({ text, anchor: 'paragraphStart' })), position, null);
    },
  });
  const internal = { _readAloudManager: manager, _state: { readAloudState: { popupOpen: true } },
    _syncPersistedVoicesToManager() { manager.applyPersistedVoices(nativePrefs()[manager.lang] ?? {}); },
    _captureReadAloudStart: () => selection ?? manager.consumeTargetPosition(),
    startReadAloudAtPosition(position: number | null = null) {
      manager.setTargetPosition(position ?? selection);
      this._state.readAloudState.popupOpen = true;
      void manager.loadVoices(true);
      this._syncPersistedVoicesToManager();
    },
    toggleReadAloudPopup(open?: boolean) {
      const next = open ?? !this._state.readAloudState.popupOpen;
      if (!next) manager.deactivate();
      this._state.readAloudState.popupOpen = next;
    },
  };
  const reader = { _iframeWindow: win, _internalReader: internal };
  manager.setLanguage('en');
  const deps = {
    exportFunction: <T>(fn: T) => fn,
    waiveXrays: <T>(value: T) => value,
    cloneInto: <T>(value: T) => structuredClone(value),
    isDead: () => false,
    error: (error: unknown) => errors.push(error),
  };
  const engine = createEngine({
    ...deps, clock, toLocal: value => new Float32Array(value),
    audioSource: () => ({ getAudio: async (_, voice: { id: string }) => {
      requests.push(voice.id);
      return { audio: fakeAudio(2) };
    } }),
    isPluginVoice: id => id.includes('::'),
    pauses: () => ({ sentence: { enabled: false, ms: 0 }, paragraph: { enabled: false, ms: 0 } }),
    volume: () => 100, notice: () => {},
  });
  engine.attach(reader);
  const memoryDeps = {
    prefs, ownsCatalog: () => true, documentKey: () => 'user/FIXTURE1',
    mayActivate: start.mayActivate,
    sameVoice: () => false, globalSpeed: () => false,
    registerObserver: () => null, unregisterObserver: () => {}, readers: () => [reader],
    error: deps.error,
  };
  const memory = options.keepNativeVoice ? createReadAloudMemorySync(memoryDeps) : null;
  if (memory) {
    writeDefaultVoice(prefs, { id: options.saved ?? 'system::sam', lang: 'en' });
    memory.attach(reader);
    internal._syncPersistedVoicesToManager();
  }
  const discovery = {
    ...deps, readers: () => [reader], stage: () => ({}),
    voiceTiers: () => (id: string) => id.split('::')[0],
    protectedVoices: () => manager.selectedVoiceID ? [manager.selectedVoiceID] : [],
    ownsInterface: () => true,
    source: () => remote,
    engine: () => engine,
    catalogChanged: start.catalogChanged,
  };
  const lists = createLiveVoiceList(discovery);
  lists.attach(reader);
  if (memory) bindings.set(reader, { choice: () => memory.choice(reader), catalog: () => lists.catalog(reader),
    report: problem => problems.push(problem) });
  start.attach(reader);
  const player = createPlayerController({
    prefs, labels: () => ({ system: 'System', azure: 'Azure' }),
    clone: (_, value) => value,
    start: () => options.keepNativeVoice ? internal.startReadAloudAtPosition() : manager.activate(),
    close: () => internal.toggleReadAloudPopup(false),
    catalogProblem: r => listingProblem(lists.catalog(r), 'azure')?.kind === 'unreachable' ? 'Cannot reach Azure' : null,
    togglePaused: () => manager.togglePaused(), rememberSpeed: () => {}, follow: () => {},
    navigate: () => {}, automatic: () => false, manual: () => {}, anyReading: () => manager.active,
    message: key => key,
  });
  const opening = manager.loadVoices(true);
  return {
    player: () => player.snapshot(reader), clock, requests, errors, positions, problems,
    selectPosition(p: number) { selection = p; },
    async stop() { await player.command(reader, 'close'); },
    async play(voice?: string) {
      if (voice) await player.command(reader, 'voice', voice);
      await player.command(reader, 'play');
      await clock.advance(1);
    },
    async close() {
      pendingZotero.resolve(nativeList);
      pendingAzure.resolve(azure);
      await opening;
      await clock.advance(0);
      lists.prepareHandBack();
      lists.dispose();
      start.detach(reader);
      bindings.delete(reader);
      memory?.dispose();
      engine.dispose();
    },
    async zoteroChoice() {
      await this.close();
      manager.deactivate();
      manager._options.remoteInterface = { getVoices: async () => nativeList };
      await manager.loadVoices(true);
      internal._syncPersistedVoicesToManager();
      return manager.selectedVoiceID;
    },
    pendingAzure, pendingZotero,
    zoteroReplies(credits: number) {
      pendingZotero.resolve({ standardCreditsRemaining: credits, voices: { standard: [{
        ...nativeList.voices.standard[0], creditsPerMinute: 2, cacheVersion: 'fixture-zotero',
      }] } });
    },
  };
}

describe('using voices while other Providers are still loading (#261)', () => {
  it('starts a ready System voice from the Player before the Zotero list arrives', async () => {
    FakeAudioContext.made = [];
    const f = fixture();
    try {
      await f.clock.advance(0);
      expect(f.player().voices.map(v => v.value)).toContain('system::sam');
      await f.play('system::sam');
      expect(f.requests[0]).toBe('system::sam');
      expect(FakeAudioContext.made.flatMap(c => c.sources)).toHaveLength(1);
      f.pendingZotero.resolve({ voices: {} });
      await f.clock.advance(1);
      expect(f.player().voice).toBe('system::sam');
      expect(FakeAudioContext.made.flatMap(c => c.sources)).toHaveLength(1);
      expect(f.errors).toEqual([]);
    } finally { await f.close(); }
  });

  it('leaves the native Read Aloud voice alone when the Player restores and picks its own voice', async () => {
    const f = fixture({ keepNativeVoice: true });
    try {
      await f.clock.advance(0);
      await f.play('system::sam');
      expect(await f.zoteroChoice()).toBe('zotero-b');
    } finally { await f.close(); }
  });

  it('does not start a saved voice merely because a catalog update offered it', async () => {
    const f = fixture({ keepNativeVoice: true });
    try {
      await f.clock.advance(0);
      expect(f.player().voices.map(v => v.value)).toContain('system::sam');
      expect(f.requests).toEqual([]);
    } finally { await f.close(); }
  });

  it('honors one Play at the position chosen before waiting for the exact saved voice', async () => {
    const f = fixture({ keepNativeVoice: true, slowAzure: true, saved: 'azure::ava' });
    try {
      await f.clock.advance(0);
      f.selectPosition(1);
      await f.play();
      expect(f.requests).toEqual([]);
      f.selectPosition(2);
      f.pendingAzure.resolve(azure);
      await f.clock.advance(1);
      expect(f.positions).toEqual([1]);
      expect(f.requests[0]).toBe('azure::ava');
      expect(f.requests).not.toContain('system::sam');
      expect(f.problems).toEqual([]);
    } finally { await f.close(); }
  });

  it.each([0, 4])('honors Zotero credits when admitting a saved Zotero voice: %s', async credits => {
    const f = fixture({ keepNativeVoice: true, saved: 'zotero-b' });
    try {
      await f.play();
      expect(f.requests).toEqual([]);
      f.zoteroReplies(credits);
      await f.clock.advance(1);
      expect(f.player().voices.find(voice => voice.value === 'zotero-b')?.low).toBe(true);
      expect(f.requests[0]).toBe(credits ? 'zotero-b' : undefined);
    } finally { await f.close(); }
  });

  it.each(['timeout', 'stop'] as const)('does not start a late voice after %s', async how => {
    const f = fixture({ keepNativeVoice: true, slowAzure: true, saved: 'azure::ava', expireAfter: 20 });
    try {
      await f.play();
      if (how === 'stop') await f.stop();
      else await f.clock.advance(20);
      f.pendingAzure.resolve(azure);
      await f.clock.advance(1);
      expect(f.requests).toEqual([]);
      expect(f.problems).toEqual(how === 'timeout' ? [{ kind: 'timeout', source: 'azure' }] : []);
    } finally { await f.close(); }
  });

  it.each([false, true])('only another Play supersedes a wait, not opening the other Player: %s', async otherPlays => {
    const setup = world();
    const a = fixture({ keepNativeVoice: true, slowAzure: true, saved: 'azure::ava' }, setup);
    const b = fixture({ keepNativeVoice: true }, setup);
    try {
      await a.play();
      // Discovering and viewing the other Player requests no audio and does not cancel A.
      expect(b.player().playing).toBe(false);
      expect(a.problems).toEqual([]);
      if (otherPlays) await b.play();
      a.pendingAzure.resolve(azure);
      await setup.clock.advance(1);
      expect(b.player().playing).toBe(otherPlays);
      expect(a.requests[0]).toBe(otherPlays ? undefined : 'azure::ava');
    } finally { await Promise.all([a.close(), b.close()]); }
  });

  it('immediately pauses the old reading on a new Play, and does not resume it when the new listing fails', async () => {
    const setup = world();
    const a = fixture({ keepNativeVoice: true }, setup);
    const b = fixture({ keepNativeVoice: true, slowAzure: true, saved: 'azure::ava' }, setup);
    try {
      await setup.clock.advance(0);
      await a.play();
      expect(a.player().playing).toBe(true);
      await b.play();
      expect(a.player()).toMatchObject({ active: true, playing: false });
      b.pendingAzure.resolve({ provider: 'azure', voices: [], failure: { reason: 'unreachable', detail: 'Connection refused' } });
      await setup.clock.advance(1);
      expect(b.problems).toEqual([{ kind: 'unreachable', source: 'azure' }]);
      expect(b.requests).toEqual([]);
      expect(a.player().playing).toBe(false);
    } finally { await Promise.all([a.close(), b.close()]); }
  });

  it.each([true, false])('keeps only favorites during the wait; a failed listing is not a confirmed empty list: %s', async failed => {
    const f = fixture({ slowAzure: true, favorites: ['azure::ava'] });
    try {
      await f.clock.advance(0);
      expect(f.player().providers).toEqual([]);
      f.pendingAzure.resolve({ provider: 'azure', voices: [], ...(failed ? { failure: { reason: 'unreachable', detail: 'Connection refused' } } : {}) });
      await f.clock.advance(0);
      expect(f.player().providers.map(v => v.value)).toEqual(failed ? [] : ['system']);
      expect(f.player().error).toBe(failed ? 'Cannot reach Azure' : null);
      expect(f.requests).toEqual([]);
    } finally { await f.close(); }
  });
});
