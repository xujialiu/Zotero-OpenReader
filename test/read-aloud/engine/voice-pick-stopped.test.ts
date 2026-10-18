import { describe, expect, it, vi } from 'vitest';
import { createVoicePick } from '../../../src/read-aloud/engine/voice-pick';
import { createEngine } from '../../../src/read-aloud/engine';
import { VirtualClock } from '../../core/engine/harness';
import { fakeAudio, FakeAudioContext, loadZoteroReadAloud, readerWindow, voicesResponse } from './zotero';

const ALLOY = 'openai-official::alloy';
const NOVA = 'openai-official::nova';

/**
 * Issue #194: one reader tab with Zotero 10.0.3's own manager (verbatim
 * excerpt), the real Engine and the real voice pick. `failAlloy` makes
 * ALLOY's audio for that text fail; NOVA always answers.
 */
async function setup(texts: string[], failAlloy?: string) {
  const clock = new VirtualClock();
  FakeAudioContext.made = [];
  const window = readerWindow(clock);
  const { ReadAloudManager } = loadZoteroReadAloud();
  const remote = {
    getVoices: async () => ({ voices: voicesResponse([ALLOY, NOVA]) }),
  };
  const manager = new ReadAloudManager({
    remoteInterface: remote,
    onStateChange: () => {},
    onRequestSegments: () => {},
  });
  const reader = { _internalReader: { _readAloudManager: manager, _syncPersistedVoicesToManager() {} }, _iframeWindow: window };
  const source = {
    getAudio: vi.fn(async (segment: { text: string }, voice: { id: string }, options?: { held?: boolean }) => {
      if (options?.held) return { audio: null, error: 'not-held' };
      if (voice.id === ALLOY && segment.text === failAlloy) return { audio: null, error: 'network' };
      return { audio: fakeAudio(segment.text.length * 0.05), voice: voice.id };
    }),
  };
  const errors: unknown[] = [];
  const engine = createEngine({
    exportFunction: (fn) => fn,
    waiveXrays: (value) => value,
    isDead: () => false,
    cloneInto: (value) => value,
    toLocal: (value) => new Float32Array(value),
    audioSource: () => source,
    isPluginVoice: (id) => id.includes('::'),
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 200 } }),
    volume: () => 100,
    notice: () => {},
    error: (e) => errors.push(e),
    clock,
  });
  engine.attach(reader);
  await manager.loadVoices(true);
  manager.setLanguage('en');
  const notices: string[] = [];
  const pick = createVoicePick({ engine, notice: (_reader, kind) => notices.push(kind), error: (e) => errors.push(e) });
  const segments = texts.map((text, i) => ({ text, anchor: i === 0 ? 'paragraphStart' : null }));
  manager.activate();
  manager.setSegments(segments, 0, null);
  pick.attach(reader);
  return { clock, manager, notices, errors, source, session: () => engine.session(reader)! };
}

describe('a voice picked while the player shows the play arrow after an error or the end of the document (#194)', () => {
  it.each([
    { name: 'a failed sentence', texts: ['One two three.', 'Four five.'], failAlloy: 'Four five.', expectPaused: 'error' },
    { name: 'the end of the document', texts: ['One.', 'Two.'], failAlloy: undefined, expectPaused: 'complete' },
  ])('is ready, is not failed after two minutes, and Play reads in it: $name', async ({ texts, failAlloy, expectPaused }) => {
    const t = await setup(texts, failAlloy);
    await t.clock.advance(5000);
    // Zotero's manager paused itself (Error and Complete handlers); the player shows the play arrow
    expect(t.manager.paused).toBe(true);
    if (expectPaused === 'error') expect(t.manager.error).toBe('network');

    t.manager.selectVoice(NOVA);
    await t.clock.advance(3000);
    // #119: a paused switch's notice goes once Play can use the prepared voice
    expect(t.notices.at(-1)).toMatch(/^(ready|selected)$/);

    await t.clock.advance(130_000);
    expect(t.notices).not.toContain('failed');
    expect(t.errors.map((e) => String((e as Error).message))).not.toContain('OpenReader: no prepared handoff boundary was reached');

    // Play carries on in the picked voice
    t.manager.play();
    await t.clock.advance(3000);
    expect(t.session().voice?.id).toBe(NOVA);
  }, 60_000);

  it('control: the same stopped reading with the session itself paused is ready and never fails', async () => {
    const t = await setup(['One two three.', 'Four five.'], 'Four five.');
    await t.clock.advance(5000);
    expect(t.manager.error).toBe('network');
    t.manager.pause();
    expect(t.session().paused).toBe(true);
    t.manager.selectVoice(NOVA);
    await t.clock.advance(3000);
    expect(t.notices.at(-1)).toBe('ready');
    await t.clock.advance(130_000);
    expect(t.notices).not.toContain('failed');
  }, 60_000);
});
