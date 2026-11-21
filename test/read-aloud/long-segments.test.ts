import { describe, expect, it, vi } from 'vitest';
import { createSegmentPreparation } from '../../src/read-aloud/segment-preparation';
import { EngineSession } from '../../src/core/engine/session';
import { EventLog, FakeAudio, FakeFetch, VirtualClock, voice } from '../core/engine/harness';

type Segment = { text: string; anchor: string | null; granularity: string; position: number[]; sourcePosition?: unknown; paragraphSourcePosition?: unknown };
type Source = { chain: { text: string }; rawStart: number; rawEnd: number };
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
class Collection {
  segments: Segment[] = [];
  _sources = new WeakMap<Segment, Source>();
  addSegment(chain: Source['chain'], rawStart: number, rawEnd: number, granularity: string) {
    const text = normalize(chain.text.slice(rawStart, rawEnd));
    if (!text) return false;
    const segment = { text, anchor: null, granularity, position: [rawStart, rawEnd] };
    this.segments.push(segment);
    this._sources.set(segment, { chain, rawStart, rawEnd });
    return true;
  }
  getSegmentTextSpans(s: Segment) { return s.position; }
}

function setup(raw: string) {
  class Reader {
    _readAloudManager = { active: true, segments: null, segmentGranularity: 'sentence' };
    _readAloudSegments = new Collection();
    _sdt = { mapper: { textNodeSpansToSourcePosition: (spans: number[]) => ({ spans }) } };
    _requestReadAloudSegments() {}
    _materializeSourcePositions(list: Segment[]) {
      for (const s of list) {
        s.sourcePosition = { spans: s.position };
        s.paragraphSourcePosition = { spans: [0, raw.length] };
      }
    }
  }
  const reader = new Reader();
  const patch = createSegmentPreparation({ error: vi.fn() });
  patch.attach({ _internalReader: reader });
  const source = reader._readAloudSegments;
  source.addSegment({ text: raw }, 0, raw.length, 'sentence');
  source.segments[0].anchor = 'paragraphStart';
  return { reader, source, list: source.segments, patch, prepare: () => reader._materializeSourcePositions(source.segments) };
}

const table = Array.from({ length: 120 }, (_, i) => `Cell ${i} (25%)`).join('  \n ');
describe('long Segments in the reader', () => {
  it('plays the first table piece while later requests are held and continues at its source position without a sentence pause', async () => {
    const t = setup(table);
    t.prepare();
    const clock = new VirtualClock(), audio = new FakeAudio(clock), fetch = new FakeFetch();
    fetch.hold = true;
    const session = new EngineSession({ clock, audio, fetch: fetch.fetch, emit: new EventLog().emit,
      pauses: () => ({ sentence: { enabled: true, ms: 700 }, paragraph: { enabled: true, ms: 900 } }) });
    session.bind({ voice: voice('fish::mul/default'), segments: t.list, backwardStopIndex: 0, forwardStopIndex: null });
    session.setPaused(false);
    await clock.advance(0);
    const first = fetch.texts()[0];
    expect(first.length).toBeLessThanOrEqual(240);
    fetch.respond(first, { audio: { name: 'first', duration: 1 } });
    await clock.advance(0);
    expect(audio.current?.clip.name).toBe('first');
    expect(fetch.texts()).toContain(t.list[1].text);
    fetch.respond(t.list[1].text, { audio: { name: 'second', duration: 1 } });
    await clock.advance(1001);
    expect(audio.current?.clip.name).toBe('second');
    expect(session.currentSegment).toBe(t.list[1]);
    expect(t.list.map(s => s.text).join(' ')).toBe(normalize(table));
    for (const s of t.list) {
      expect(normalize(table.slice(...s.position))).toBe(s.text);
      expect(s.sourcePosition).toEqual({ spans: s.position });
      expect(s.paragraphSourcePosition).toEqual({ spans: [0, table.length] });
    }
    expect(t.list.filter(s => s.anchor === 'paragraphStart')).toHaveLength(1);
    session.skipAhead('paragraph');
    expect(session.position).toBe(t.list.length - 1);
  });

  it('retries only the failed piece and skips to the next paragraph', async () => {
    const t = setup(table);
    t.source.addSegment({ text: 'After the table.' }, 0, 16, 'sentence');
    const after = t.list[1];
    after.anchor = 'paragraphStart';
    t.prepare();
    const clock = new VirtualClock(), fetch = new FakeFetch(), audio = new FakeAudio(clock);
    fetch.hold = true;
    const session = new EngineSession({ clock, audio, fetch: fetch.fetch, emit: new EventLog().emit,
      pauses: () => ({ sentence: { enabled: false, ms: 0 }, paragraph: { enabled: false, ms: 0 } }) });
    session.bind({ voice: voice(), segments: t.list, backwardStopIndex: 1, forwardStopIndex: null });
    session.setPaused(false);
    await clock.advance(0);
    fetch.respond(t.list[1].text, { audio: null, error: 'network' });
    await clock.advance(0);
    expect(session.error).toBe('network');
    session.retry();
    await clock.advance(0);
    expect(fetch.texts()).toEqual([t.list[1].text, t.list[1].text]);
    fetch.respond(t.list[1].text);
    await clock.advance(0);
    expect(session.currentSegment).toBe(t.list[1]);
    session.skipAhead('paragraph');
    expect(session.currentSegment).toBe(after);
  });

  it('preserves the original if a later range cannot be built', () => {
    const t = setup(table), original = t.list[0];
    const add = vi.spyOn(t.source, 'addSegment');
    add.mockImplementationOnce(Collection.prototype.addSegment).mockReturnValueOnce(false);
    t.prepare();
    expect(add).toHaveBeenCalledTimes(2);
    expect(t.list).toEqual([original]);
  });

  it('keeps a short sentence intact and splits unspaced Unicode at code-point boundaries', () => {
    const short = setup('A simple sentence.'), original = short.list[0];
    short.prepare();
    expect(short.list[0]).toBe(original);
    const text = '字' + '𠀀'.repeat(399);
    const t = setup(text);
    t.prepare();
    expect(t.list.length).toBeGreaterThan(1);
    expect(t.list.map(s => s.text).join('')).toBe(text);
    expect(t.list.every(s => !/[\uD800-\uDFFF]/u.test(s.text))).toBe(true);
  });
});
