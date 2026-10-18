import { describe, expect, it, vi } from 'vitest';
import { createCompatibleProvider } from '../../../src/core/providers/compatible';
import { createOpenAICompatibleProvider, type OpenAICompatibleConfig } from '../../../src/core/providers/openai-compatible';
import { OPENAI_DEFAULT_VOICES } from '../../../src/core/providers/openai';
import { collectCatalog } from '../../../src/read-aloud/catalog';
import { testConnection } from '../../../src/ui/prefs-pane';

const cfg: OpenAICompatibleConfig = {
  id: 'openai-official',
  label: 'OpenAI',
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com',
  model: 'gpt-4o-mini-tts',
  keyRequired: true,
  route: 'speech',
  defaultVoices: OPENAI_DEFAULT_VOICES,
};
const provider = (fetchImpl: unknown, over: Partial<OpenAICompatibleConfig> = {}) =>
  createOpenAICompatibleProvider({ ...cfg, ...over }, { fetch: fetchImpl as typeof fetch });
const opts = { voice: 'alloy', signal: new AbortController().signal };

// Issue #198: a server down behind a gateway answers the voice list with an
// HTTP error, which must read as unreachable, not as "no voice list here"
describe('listVoices on an HTTP error (#198)', () => {
  it.each([500, 502, 503, 504, 530, 408, 429])('HTTP %i is a listing failure, not the documented voices', async (status) => {
    await expect(provider(vi.fn(async () => new Response('Bad gateway', { status }))).listVoices()).rejects.toMatchObject({
      kind: status === 429 ? 'rate-limit' : 'unknown',
    });
  });

  it.each([404, 405, 501])('HTTP %i still means the server has no voice list: the documented voices', async (status) => {
    const voices = await provider(vi.fn(async () => new Response('', { status }))).listVoices();
    expect(voices.map((v) => v.id)).toEqual([...OPENAI_DEFAULT_VOICES]);
  });

  it.each([502, 530])('the catalog names OpenAI Compatible unreachable at HTTP %i and lists none of OpenAI\'s voices for it', async (status) => {
    const compatible = createCompatibleProvider(
      { baseURL: 'https://tts.example.com', apiKey: '', model: 'tts-1' },
      { fetch: (async () => new Response('', { status })) as unknown as typeof fetch },
    );
    const [entry] = await collectCatalog(['compatible'], () => compatible);
    expect(entry.voices).toEqual([]);
    expect(entry.failure).toMatchObject({ reason: 'unreachable' });
  });
});

// Issue #199: a gateway that wants a browser login redirects every request to
// a 200 HTML page, which must not pass as audio
describe('a speech reply that is not audio (#199)', () => {
  const loginPage = async () =>
    new Response('<html><title>Sign in</title></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  const compatible = () =>
    createCompatibleProvider({ baseURL: 'https://tts.example.com', apiKey: '', model: 'tts-1' }, { fetch: loginPage as unknown as typeof fetch });

  it('Test connection fails instead of reporting that synthesis works', async () => {
    const result = await testConnection(compatible(), { probeSynthesis: true });
    expect(result.ok, result.message).toBe(false);
    expect(result.message).toMatch(/web page/);
  });

  it('a Segment is an error, not an HTML blob handed on as audio', async () => {
    await expect(compatible().synthesize('Hello there.', opts)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it.each(['application/json', 'text/plain; charset=utf-8', 'application/xhtml+xml'])('refuses %s', async (type) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': type } }));
    await expect(provider(fetchImpl).synthesize('Hi', opts)).rejects.toMatchObject({ kind: 'unknown' });
  });

  it.each(['audio/mpeg', 'audio/wav', 'application/octet-stream', ''])('takes "%s" as audio', async (type) => {
    const headers: Record<string, string> = type ? { 'content-type': type } : {};
    const fetchImpl = vi.fn(async () => new Response(new Blob(['ID3-audio']), { status: 200, headers }));
    const result = await provider(fetchImpl).synthesize('Hi', opts);
    expect(await result.audio.text()).toBe('ID3-audio');
  });
});

/** An MPEG-1 Layer III frame header, 128 kbit/s at 44.1 kHz, no padding: 417 bytes a frame. */
const FRAME_HEADER = [0xff, 0xfb, 0x90, 0x00];
const FRAME_BYTES = 417;
function frame(fill: number, tag?: 'Xing' | 'Info'): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(FRAME_BYTES).fill(fill);
  out.set(FRAME_HEADER, 0);
  // The VBR tag sits after the side information: 32 bytes for MPEG-1 stereo
  if (tag) out.set([...tag].map((c) => c.charCodeAt(0)), 4 + 32);
  return out;
}
function id3(size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, 4, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f], 0);
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

// Issue #201: OpenAI refuses an input over 4,096 characters, and Zotero's
// segmentation can hand over a Segment of up to 5,000 bytes
describe('a Segment over 4,096 characters (#201)', () => {
  const long = Array.from({ length: 120 }, (_, i) => `Sentence number ${i} runs on for a while here.`).join(' ');

  it('is asked for in pieces of at most 4,096 characters that make up the text, and played as one', async () => {
    expect(long.length).toBeGreaterThan(4096);
    const inputs: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const input = JSON.parse(init.body).input as string;
      inputs.push(input);
      if (input.length > 4096) return new Response(JSON.stringify({ error: { message: 'string_above_max_length' } }), { status: 400 });
      const n = inputs.length;
      return new Response(new Blob([join(id3(20), frame(0, 'Info'), frame(n), frame(n))]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    });
    const result = await provider(fetchImpl).synthesize(long, opts);
    expect(inputs).toHaveLength(2);
    expect(inputs.every((piece) => piece.length <= 4096)).toBe(true);
    expect(inputs.join('')).toBe(long);
    // Each piece's sentences end where it ends
    expect(inputs[0].trimEnd().endsWith('.')).toBe(true);
    const bytes = new Uint8Array(await result.audio.arrayBuffer());
    // Both pieces' audio frames, without their ID3 tags or VBR info frames
    expect(bytes.length).toBe(4 * FRAME_BYTES);
    expect([bytes[FRAME_BYTES * 0 + 10], bytes[FRAME_BYTES * 1 + 10], bytes[FRAME_BYTES * 2 + 10], bytes[FRAME_BYTES * 3 + 10]]).toEqual([1, 1, 2, 2]);
    expect(result.audio.type).toBe('audio/mpeg');
  });

  it('sends a Segment of up to 4,096 characters whole, its reply untouched', async () => {
    const text = 'x'.repeat(4096);
    const reply = join(id3(5), frame(7));
    const fetchImpl = vi.fn(async () => new Response(new Blob([reply]), { status: 200 }));
    const result = await provider(fetchImpl).synthesize(text, opts);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(reply);
  });

  it('fails the Segment when a piece fails', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => (++calls === 2 ? new Response('', { status: 500 }) : new Response(new Blob([frame(1)]), { status: 200 })));
    await expect(provider(fetchImpl).synthesize(long, opts)).rejects.toMatchObject({ kind: 'unknown' });
  });
});
