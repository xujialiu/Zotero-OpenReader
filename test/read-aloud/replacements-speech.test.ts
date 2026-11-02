import { describe, expect, it, vi } from 'vitest';
import { findReplacements, type Replacement } from '../../src/core/replacements';
import { createRemoteInterface } from '../../src/read-aloud/remote-interface';

const exact = (text: string, readAs: string): Replacement => ({ text, readAs, mode: 'exact', matchCase: true });

function setup(rows: () => Replacement[], options: { brackets?: boolean } = {}) {
  const calls: string[] = [];
  const synthesize = vi.fn(async (text: string) => {
    calls.push(text);
    const words = [...text.matchAll(/\S+/g)].map((m, i) => ({ start: i, end: i + 0.5, charStart: m.index!, charEnd: m.index! + m[0].length }));
    return { audio: new Blob(['audio:' + text]), timestamps: words };
  });
  const nativeAudio = vi.fn(async (segment: { text: string }) => ({ audio: new Blob(['zotero']), timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: segment.text.length }] }));
  const cache = new Map();
  const replacements = vi.fn(async (text: string) => findReplacements(text, rows()));
  const remote = createRemoteInterface({
    listCatalog: async () => [],
    getProvider: () => ({ id: 'openai-official', synthesize } as any),
    getStripAngleBrackets: () => options.brackets ?? false,
    getBracketPairs: () => '<> []',
    cacheVersion: () => 'v1',
    cache: () => ({ match: async (key: string) => cache.get(key), put: async (key: string, value: unknown) => { cache.set(key, value); }, delete: async (key: string) => { cache.delete(key); } }),
    native: () => ({ getAudio: nativeAudio } as any),
    replacements,
  });
  return { remote, calls, synthesize, nativeAudio, replacements, cache };
}

const voice = { id: 'openai-official::alloy' };
const words = (text: string, timestamps: any[]) => timestamps.map((t) => text.slice(t.charStart, t.charEnd));

describe('replacements in the speech text (issue #237)', () => {
  it('gives a plugin voice the replaced text and highlights the document\'s', async () => {
    const s = setup(() => [exact('IL-6', 'interleukin six')]);
    const text = 'IL-6 levels rose.';
    const result = await s.remote.getAudio(Object.freeze({ text }), voice);
    expect(s.calls).toEqual(['interleukin six levels rose.']);
    expect(words(text, result.timestamps as any[])).toEqual(['IL-6', 'IL-6', 'levels', 'rose.']);
  });

  it('gives a Zotero voice the replaced text too', async () => {
    const s = setup(() => [exact('IL-6', 'interleukin six')]);
    const result = await s.remote.getAudio(Object.freeze({ text: 'IL-6 rose' }), { id: 'premium-voice' });
    expect(s.nativeAudio).toHaveBeenCalledWith({ text: 'interleukin six rose' }, { id: 'premium-voice' });
    expect((result.timestamps as any[])[0]).toMatchObject({ charStart: 0, charEnd: 9 });
  });

  it('removes brackets from the document\'s text but never from Read as', async () => {
    const s = setup(() => [exact('IL-6', 'interleukin six [soft]')], { brackets: true });
    await s.remote.getAudio(Object.freeze({ text: '[IL-6] rises' }), voice);
    expect(s.calls).toEqual(['interleukin six [soft] rises']);
  });

  it('asks again when an edit changes a sentence\'s text, and replays the audio of one it does not change', async () => {
    let rows = [exact('IL-6', 'interleukin six')];
    const s = setup(() => rows);
    await s.remote.getAudio(Object.freeze({ text: 'IL-6 rose' }), voice);
    await s.remote.getAudio(Object.freeze({ text: 'plain words' }), voice);
    rows = [exact('IL-6', 'interleukin 6')];
    await s.remote.getAudio(Object.freeze({ text: 'IL-6 rose' }), voice);
    await s.remote.getAudio(Object.freeze({ text: 'plain words' }), voice);
    expect(s.calls).toEqual(['interleukin six rose', 'plain words', 'interleukin 6 rose']);
  });

  it('leaves the settings\' sample alone', async () => {
    const s = setup(() => [exact('quick', 'slow')]);
    await s.remote.getAudio('sample', voice);
    expect(s.replacements).not.toHaveBeenCalled();
  });

  it('plays a short pause for a sentence an empty Read as leaves silent', async () => {
    const s = setup(() => [exact('***', '')]);
    const result = await s.remote.getAudio(Object.freeze({ text: '***' }), voice);
    expect(s.calls).toEqual([]);
    expect(result.audio).toBeTruthy();
    expect(result.timestamps).toEqual([{ start: 0, end: 0, charStart: 0, charEnd: 3 }].map((t) => expect.objectContaining({ charStart: t.charStart, charEnd: t.charEnd })));
  });

  it('forgets the audio cached under the replaced text', async () => {
    const s = setup(() => [exact('IL-6', 'interleukin six')]);
    await s.remote.getAudio(Object.freeze({ text: 'IL-6 rose' }), voice);
    expect(s.cache.size).toBe(1);
    await s.remote.forget(Object.freeze({ text: 'IL-6 rose' }), voice);
    expect(s.cache.size).toBe(0);
  });

  it('reads nothing of the segment after waiting for the replacements: the tab may have closed (issue #165)', async () => {
    let dead = false;
    const target = { text: 'IL-6 rose', position: { pageIndex: 0 } };
    const segment = new Proxy(target, {
      get(object, key) {
        if (dead) throw new TypeError("can't access dead object");
        return (object as any)[key];
      },
      ownKeys(object) {
        if (dead) throw new TypeError("can't access dead object");
        return Reflect.ownKeys(object);
      },
    });
    const s = setup(() => [exact('IL-6', 'interleukin six')]);
    s.replacements.mockImplementation(async (text: string) => {
      await Promise.resolve();
      dead = true;
      return findReplacements(text, [exact('IL-6', 'interleukin six')]);
    });
    const plugin = await s.remote.getAudio(segment, voice);
    expect(plugin.audio).toBeTruthy();
    dead = false;
    const zotero = await s.remote.getAudio(segment, { id: 'premium-voice' });
    expect(zotero.audio).toBeTruthy();
    expect(s.nativeAudio).toHaveBeenCalledWith(expect.objectContaining({ text: 'interleukin six rose' }), { id: 'premium-voice' });
  });
});
