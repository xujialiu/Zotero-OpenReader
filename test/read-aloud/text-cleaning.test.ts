import { describe, expect, it, vi } from 'vitest';
import { createRemoteInterface } from '../../src/read-aloud/remote-interface';
import type { SynthesisResult } from '../../src/core/providers/types';
import { findReplacements, type Replacement } from '../../src/core/replacements';
import type { TextCleaningContext } from '../../src/core/text-cleaning';

function setup(options: {
  rows?: () => Replacement[];
  brackets?: boolean;
  pairs?: () => string;
  context?: (voiceId: string) => TextCleaningContext;
} = {}) {
  const synthesize = vi.fn(async (_text: string): Promise<SynthesisResult> => ({ audio: new Blob(['audio']) }));
  const nativeAudio = vi.fn(async (_segment: { text: string } | 'sample', _voice: { id: string }) => ({
    audio: new Blob(['native']), timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 2 }],
  }));
  const cache = new Map<string, SynthesisResult>();
  const remote = createRemoteInterface({
    listCatalog: async () => [],
    getProvider: (id) => ({ id, capabilities: { wordTimestamps: false }, listVoices: async () => [], synthesize }),
    getStripAngleBrackets: () => options.brackets ?? false,
    getBracketPairs: options.pairs,
    getTextCleaningContext: options.context,
    replacements: async (text) => {
      await Promise.resolve();
      return findReplacements(text, options.rows?.() ?? []);
    },
    native: () => ({ getAudio: nativeAudio, getVoices: async () => ({}), getCreditsRemaining: async () => ({}), resetCredits: async () => ({}) }),
    cacheVersion: () => 'test',
    cache: () => ({
      match: async (key) => cache.get(key) ?? null,
      put: async (key, value) => { cache.set(key, value); },
      delete: async (key) => { cache.delete(key); },
    }),
  });
  return { remote, synthesize, nativeAudio };
}

describe('Text cleaning in voice requests (issue #240)', () => {
  it.each(['openai-official', 'mimo', 'compatible', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'])('gives %s the same cleaned text', async (provider) => {
    const { remote, synthesize } = setup();
    await remote.getAudio(Object.freeze({ text: '中 文' }), { id: `${provider}::voice`, locale: 'en-US' });
    expect(synthesize).toHaveBeenCalledWith('中文', expect.objectContaining({ voice: 'voice' }));
  });

  it.each(['standard', 'premium'])('gives a Zotero %s voice cleaned text and retains native metadata and document coordinates', async (tier) => {
    const { remote, nativeAudio } = setup();
    const sourcePosition = Object.freeze({ pageIndex: 2 });
    const result = await remote.getAudio(Object.freeze({ text: '中 文', sourcePosition }), { id: `${tier}-voice` });
    expect(nativeAudio).toHaveBeenCalledWith({ text: '中文', sourcePosition }, { id: `${tier}-voice` });
    expect(result).toMatchObject({ speechText: '中文', timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 3 }] });
  });

  it('shares audio across original offsets, including Prefetch and held requests, without changing cached timings', async () => {
    const { remote, synthesize } = setup();
    const timestamps = [{ start: 0, end: 1, charStart: 1, charEnd: 2 }];
    Object.freeze(timestamps[0]);
    Object.freeze(timestamps);
    synthesize.mockResolvedValue({ audio: new Blob(['audio']), timestamps });
    const voice = { id: 'system::Chinese' };
    const [plain, spaced] = await Promise.all([
      remote.getAudio(Object.freeze({ text: '中文' }), voice),
      remote.getAudio(Object.freeze({ text: '中 文' }), voice),
    ]);
    const held = await remote.getAudio(Object.freeze({ text: '中   文' }), voice, { held: true });
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['中文']);
    expect(plain.timestamps).toEqual([{ start: 0, end: 1, charStart: 1, charEnd: 2 }]);
    expect(spaced.timestamps).toEqual([{ start: 0, end: 1, charStart: 2, charEnd: 3 }]);
    expect(held.timestamps).toEqual([{ start: 0, end: 1, charStart: 4, charEnd: 5 }]);
    expect(await remote.getAudio({ text: '别 的' }, voice, { held: true })).toMatchObject({ error: 'not-held', audio: null });
    expect(timestamps).toEqual([{ start: 0, end: 1, charStart: 1, charEnd: 2 }]);
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['中文']);
  });

  it('protects an explicit reading, then reuses audio when removing the workaround leaves the same speech', async () => {
    let rows: Replacement[] = [{ text: '中 文', readAs: '甲 乙 [轻 声]', mode: 'exact', matchCase: true }];
    const { remote, synthesize } = setup({ rows: () => rows, brackets: true });
    const voice = { id: 'system::Chinese' };
    await remote.getAudio(Object.freeze({ text: '中 文' }), voice);
    rows = [{ text: '中 文', readAs: '中文', mode: 'exact', matchCase: true }];
    await remote.getAudio(Object.freeze({ text: '中 文' }), voice);
    rows = [];
    await remote.getAudio(Object.freeze({ text: '中 文' }), voice);
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['甲 乙 [轻 声]', '中文']);
    await remote.getAudio(Object.freeze({ text: '中 [文]' }), voice);
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['甲 乙 [轻 声]', '中文']);
  });

  it('leaves samples and sentence fallback on the document text unchanged', async () => {
    const { remote, synthesize } = setup({ rows: () => [{ text: 'quick', readAs: '中 文', mode: 'exact', matchCase: true }] });
    const sample = await remote.getAudio('sample', { id: 'system::Chinese' });
    expect(sample.speechText).toBe('The quick brown fox jumps over the lazy dog.');
    const result = await remote.getAudio(Object.freeze({ text: '中 文' }), { id: 'system::Chinese' });
    expect(result.timestamps).toEqual([{ start: 0, end: 86400, charStart: 0, charEnd: 3 }]);
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['The quick brown fox jumps over the lazy dog.', '中文']);
  });

  it('captures scope and bracket metadata before an asynchronous Replacement can outlive its reader, including forget', async () => {
    let dead = false;
    const context = vi.fn((id: string): TextCleaningContext => {
      if (dead) throw new Error('dead reader');
      expect(id).toBe('system::Chinese');
      return { documentType: 'pdf' };
    });
    const pairs = () => {
      if (dead) throw new Error('dead reader');
      return '<> []';
    };
    const { remote } = setup({ context, pairs, brackets: true, rows: () => { dead = true; return []; } });
    expect(await remote.getAudio({ text: '中 [文]' }, { id: 'system::Chinese' })).toMatchObject({ speechText: '中文' });
    dead = false;
    await remote.forget({ text: '中 [文]' }, { id: 'system::Chinese' });
    expect(context).toHaveBeenCalledTimes(2);
  });

  it('records the prepared text even when a user Replacement leaves only a silent pause', async () => {
    const { remote, synthesize } = setup({ rows: () => [{ text: '中 文', readAs: '', mode: 'exact', matchCase: true }] });
    const result = await remote.getAudio({ text: '中 文' }, { id: 'system::Chinese' });
    expect(result).toMatchObject({ speechText: '' });
    expect(result.audio?.size).toBeGreaterThan(0);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('forgets exactly the cleaned audio so a retry asks again', async () => {
    const { remote, synthesize } = setup();
    const segment = Object.freeze({ text: '中 文' });
    const voice = { id: 'system::Chinese' };
    await remote.getAudio(segment, voice);
    await remote.forget(segment, voice);
    await remote.getAudio(segment, voice);
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(['中文', '中文']);
  });

  it('removes Chinese whitespace for a System voice regardless of its locale', async () => {
    const { remote, synthesize } = setup();
    await remote.getAudio(Object.freeze({ text: '这 是 一句 话' }), { id: 'system::Chinese', locale: 'en-US' });
    expect(synthesize).toHaveBeenCalledWith('这是一句话', expect.objectContaining({ voice: 'Chinese' }));
  });
});
