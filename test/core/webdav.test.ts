import { describe, expect, it, vi } from 'vitest';
import { basicAuthHeader, createWebDAVClient, normalizeWebDAVURL, parseMultistatus, WEBDAV_MAX_REPLY_BYTES, WebDAVError } from '../../src/core/webdav';

const cfg = { url: 'https://dav.example.com/zotero-tts', username: 'ann', password: 'pw' };

function client(fetchImpl: unknown, overrides: Partial<typeof cfg> = {}, timeoutMs?: number) {
  return createWebDAVClient({ ...cfg, ...overrides }, { fetch: fetchImpl as typeof fetch, timeoutMs });
}

/** The i-th request the client made: its URL and init. */
function call(fetchImpl: unknown, i = 0) {
  const [url, init] = (fetchImpl as { mock: { calls: unknown[][] } }).mock.calls[i];
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } };
}

const status = (code: number) => new Response(null, { status: code });

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as WebDAVError).kind;
  }
  return undefined;
}

describe('normalizeWebDAVURL', () => {
  it('trims and ends the folder with exactly one slash', () => {
    expect(normalizeWebDAVURL('  https://dav.example.com/zotero-tts  ')).toBe('https://dav.example.com/zotero-tts/');
    expect(normalizeWebDAVURL('https://dav.example.com/zotero-tts///')).toBe('https://dav.example.com/zotero-tts/');
    expect(normalizeWebDAVURL('http://nas.local:5005/dav/')).toBe('http://nas.local:5005/dav/');
  });

  it('rejects an empty or non-http URL as a configuration error', () => {
    expect(kindOf(() => normalizeWebDAVURL(''))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('   '))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('dav.example.com/zotero-tts'))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('ftp://dav.example.com/zotero-tts'))).toBe('config');
    expect(() => normalizeWebDAVURL('')).toThrow(WebDAVError);
  });
});

describe('basicAuthHeader', () => {
  it('encodes user:password as base64 of the UTF-8 bytes', () => {
    expect(basicAuthHeader('ann', 'pw')).toBe('Basic ' + Buffer.from('ann:pw', 'utf8').toString('base64'));
    expect(basicAuthHeader('ann', 'pässwörd')).toBe('Basic ' + Buffer.from('ann:pässwörd', 'utf8').toString('base64'));
  });
});

describe('check', () => {
  it('sends PROPFIND with Depth 0 and the credentials to the folder', async () => {
    const fetchImpl = vi.fn(async () => status(207));
    await client(fetchImpl).check();
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/');
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('0');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
    expect(init.cache).toBe('no-store');
  });

  it('sends no Authorization header without a username', async () => {
    const fetchImpl = vi.fn(async () => status(207));
    await client(fetchImpl, { username: '', password: '' }).check();
    expect(call(fetchImpl).init.headers).not.toHaveProperty('Authorization');
  });

  it('reports 401 and 403 as rejected credentials', async () => {
    await expect(client(vi.fn(async () => status(401))).check()).rejects.toMatchObject({ kind: 'auth', status: 401 });
    await expect(client(vi.fn(async () => status(403))).check()).rejects.toMatchObject({ kind: 'auth', status: 403 });
  });

  it('reports a folder that does not exist yet', async () => {
    await expect(client(vi.fn(async () => status(404))).check()).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringContaining('https://dav.example.com/zotero-tts/'),
    });
  });

  it('reports any other status with its code', async () => {
    await expect(client(vi.fn(async () => status(500))).check()).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      message: expect.stringContaining('500'),
    });
  });

  it('reports a request that could not be made as a network error, with the reason', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(client(fetchImpl).check()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('NetworkError'),
    });
  });

  // The plugin sandbox has no AbortController, so a stalled request cannot
  // be cancelled — but it must still surface as an error, never hang
  it('gives up after the timeout', async () => {
    const never = vi.fn(() => new Promise<Response>(() => {}));
    await expect(client(never, {}, 20).check()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('No reply') });
  });
});

describe('upload', () => {
  it('PUTs the text as JSON at the file URL', async () => {
    const fetchImpl = vi.fn(async () => status(201));
    await client(fetchImpl).upload('zotero-tts-settings.json', '{"a":1}');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/zotero-tts-settings.json');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
  });

  it('accepts 200 and 204 as well as 201', async () => {
    await expect(client(vi.fn(async () => status(200))).upload('f', 'x')).resolves.toBeUndefined();
    await expect(client(vi.fn(async () => status(204))).upload('f', 'x')).resolves.toBeUndefined();
  });

  // RFC 4918 answers 409 to a PUT whose parent collection is missing; some
  // servers say 404. Either way: make the folder, then write again.
  it('creates the folder and writes again when the server says the parent is missing', async () => {
    for (const missing of [409, 404]) {
      const fetchImpl = vi.fn().mockResolvedValueOnce(status(missing)).mockResolvedValueOnce(status(201)).mockResolvedValueOnce(status(201));
      await client(fetchImpl).upload('f.json', 'x');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(call(fetchImpl, 1).init.method).toBe('MKCOL');
      expect(call(fetchImpl, 1).url).toBe('https://dav.example.com/zotero-tts/');
      expect(call(fetchImpl, 2).init.method).toBe('PUT');
      expect(call(fetchImpl, 2).init.body).toBe('x');
    }
  });

  it('treats a folder that turns out to exist (MKCOL 405) as created', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(404)).mockResolvedValueOnce(status(405)).mockResolvedValueOnce(status(204));
    await expect(client(fetchImpl).upload('f.json', 'x')).resolves.toBeUndefined();
  });

  it('fails when the folder cannot be created', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(409)).mockResolvedValueOnce(status(409));
    await expect(client(fetchImpl).upload('f.json', 'x')).rejects.toMatchObject({ kind: 'http', status: 409 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports rejected credentials and other failures', async () => {
    await expect(client(vi.fn(async () => status(401))).upload('f', 'x')).rejects.toMatchObject({ kind: 'auth' });
    await expect(client(vi.fn(async () => status(507))).upload('f', 'x')).rejects.toMatchObject({ kind: 'http', status: 507 });
  });
});

describe('download', () => {
  it('GETs the file and returns its text', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"a":1}', { status: 200 }));
    await expect(client(fetchImpl).download('zotero-tts-settings.json')).resolves.toBe('{"a":1}');
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/zotero-tts-settings.json');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
    expect(init.cache).toBe('no-store');
  });

  it('reports a server without the file as not-found, naming the file', async () => {
    await expect(client(vi.fn(async () => status(404))).download('zotero-tts-settings.json')).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringContaining('zotero-tts-settings.json'),
    });
  });

  it('reports rejected credentials and other failures', async () => {
    await expect(client(vi.fn(async () => status(403))).download('f')).rejects.toMatchObject({ kind: 'auth' });
    await expect(client(vi.fn(async () => status(502))).download('f')).rejects.toMatchObject({ kind: 'http', status: 502 });
  });
});

describe('createWebDAVClient', () => {
  it('rejects a bad URL up front, before any request', () => {
    const fetchImpl = vi.fn();
    expect(kindOf(() => client(fetchImpl, { url: '' }))).toBe('config');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exposes the normalized folder URL', () => {
    expect(client(vi.fn()).url).toBe('https://dav.example.com/zotero-tts/');
  });
});

describe('parseMultistatus', () => {
  it('reads a Nextcloud reply: d: prefixes, the folder itself skipped by its collection type', () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns">
 <d:response>
  <d:href>/remote.php/dav/files/ann/zotero-tts/</d:href>
  <d:propstat><d:prop><d:getlastmodified>Mon, 31 Aug 2026 22:01:02 GMT</d:getlastmodified><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/files/ann/zotero-tts/zotero-tts-settings_office-pc.json</d:href>
  <d:propstat><d:prop><d:getlastmodified>Mon, 31 Aug 2026 22:03:04 GMT</d:getlastmodified><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
</d:multistatus>`;
    expect(parseMultistatus(xml)).toEqual([{ name: 'zotero-tts-settings_office-pc.json', lastModified: 'Mon, 31 Aug 2026 22:03:04 GMT' }]);
  });

  it('reads an Apache reply: D: responses with lp1: props', () => {
    const xml = `<D:multistatus xmlns:D="DAV:" xmlns:lp1="DAV:">
 <D:response>
  <D:href>/dav/zotero-tts/</D:href>
  <D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat>
 </D:response>
 <D:response>
  <D:href>/dav/zotero-tts/zotero-tts-positions.json</D:href>
  <D:propstat><D:prop><lp1:resourcetype/><lp1:getlastmodified>Tue, 01 Sep 2026 00:00:00 GMT</lp1:getlastmodified></D:prop></D:propstat>
 </D:response>
</D:multistatus>`;
    expect(parseMultistatus(xml)).toEqual([{ name: 'zotero-tts-positions.json', lastModified: 'Tue, 01 Sep 2026 00:00:00 GMT' }]);
  });

  it('reads unprefixed tags, absolute-URL hrefs, percent-encoded paths and XML entities', () => {
    const xml = `<multistatus xmlns="DAV:">
 <response>
  <href>https://dav.example.com/%E6%9C%BA%E6%A2%B0%E7%A1%AC%E7%9B%98/zotero-tts/a&amp;b.json</href>
  <propstat><prop><resourcetype/></prop></propstat>
 </response>
</multistatus>`;
    expect(parseMultistatus(xml)).toEqual([{ name: 'a&b.json', lastModified: null }]);
  });

  it('skips collections by their trailing slash even without a resourcetype', () => {
    const xml = `<multistatus xmlns="DAV:">
 <response><href>/dav/zotero-tts/</href><propstat><prop/></propstat></response>
 <response><href>/dav/zotero-tts/sub/</href><propstat><prop/></propstat></response>
 <response><href>/dav/zotero-tts/file.json</href><propstat><prop/></propstat></response>
</multistatus>`;
    expect(parseMultistatus(xml)).toEqual([{ name: 'file.json', lastModified: null }]);
  });

  it('returns nothing for text that is no multistatus at all', () => {
    expect(parseMultistatus('<html>maintenance</html>')).toEqual([]);
    expect(parseMultistatus('')).toEqual([]);
  });
});

describe('list', () => {
  const multistatus = `<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/zotero-tts/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/zotero-tts/zotero-tts-settings_a.json</d:href><d:propstat><d:prop><d:getlastmodified>Mon, 31 Aug 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
</d:multistatus>`;

  it('asks the folder with Depth 1 and returns its files', async () => {
    const fetchImpl = vi.fn(async () => new Response(multistatus, { status: 207 }));
    const files = await client(fetchImpl).list();
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/');
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('1');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
    expect(files).toEqual([{ name: 'zotero-tts-settings_a.json', lastModified: 'Mon, 31 Aug 2026 10:00:00 GMT' }]);
  });

  it('reports a missing folder as not-found, and other failures by kind', async () => {
    await expect(client(vi.fn(async () => status(404))).list()).rejects.toMatchObject({ kind: 'not-found' });
    await expect(client(vi.fn(async () => status(401))).list()).rejects.toMatchObject({ kind: 'auth' });
    await expect(client(vi.fn(async () => status(500))).list()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

// The timeout around fetch() ends when the headers arrive; the body that
// follows is read under its own bounds, in time and in size (#169)
describe("the reply's body", () => {
  const enc = new TextEncoder();
  const ok = (body: ReadableStream<Uint8Array> | null, headers?: Record<string, string>) => vi.fn(async () => new Response(body, { status: 200, headers }));

  /** A body that sends `chunks` and then stays open without another byte: a server stalled mid-reply. */
  function stalledBody(chunks: string[]) {
    const state = { cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const s of chunks) c.enqueue(enc.encode(s));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { body, state };
  }

  it('fails a download whose server stops sending mid-reply, and closes the stream', async () => {
    const { body, state } = stalledBody(['{"a":']);
    await expect(client(ok(body), {}, 20).download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
    expect(state.cancelled).toBe(true);
  });

  it('fails a listing whose server stops sending mid-reply, and closes the stream', async () => {
    const { body, state } = stalledBody(['<d:multistatus xmlns:d="DAV:">']);
    const fetchImpl = vi.fn(async () => new Response(body, { status: 207 }));
    await expect(client(fetchImpl, {}, 20).list()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
    expect(state.cancelled).toBe(true);
  });

  it('bounds the gap between chunks, not the whole reply: a slow but steady one finishes', async () => {
    // 30 chunks 5 ms apart take 150 ms or more, against a 100 ms timeout
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        await new Promise((r) => setTimeout(r, 5));
        if (sent < 30) c.enqueue(enc.encode(String(sent++ % 10)));
        else c.close();
      },
    });
    await expect(client(ok(body), {}, 100).download('f')).resolves.toBe('012345678901234567890123456789');
  });

  it('refuses a reply that grows past the cap, and closes the stream', async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    const state = { cancelled: false, sent: 0 };
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        state.sent += chunk.byteLength;
        c.enqueue(chunk);
      },
      cancel() {
        state.cancelled = true;
      },
    });
    await expect(client(ok(body)).download('f')).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('10 MB') });
    expect(state.cancelled).toBe(true);
    expect(state.sent).toBeLessThanOrEqual(WEBDAV_MAX_REPLY_BYTES + 3 * chunk.byteLength);
  });

  it('refuses a declared Content-Length over the cap without reading the body', async () => {
    // A read would stall on this body and fail as network instead
    const { body, state } = stalledBody([]);
    const fetchImpl = ok(body, { 'Content-Length': String(WEBDAV_MAX_REPLY_BYTES + 1) });
    await expect(client(fetchImpl, {}, 20).download('f')).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('10 MB') });
    expect(state.cancelled).toBe(true);
  });

  it('reports a stream that breaks mid-reply as a network error, with the reason', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('{"a":'));
      },
      pull(c) {
        c.error(new TypeError('NetworkError when reading the body.'));
      },
    });
    await expect(client(ok(body)).download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('NetworkError') });
  });

  it('decodes a multi-byte character split across chunks', async () => {
    const bytes = enc.encode('{"a":"café ☕"}');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    await expect(client(ok(body)).download('f')).resolves.toBe('{"a":"café ☕"}');
  });

  it('bounds a reply without a body stream as well', async () => {
    const response = { status: 200, ok: true, headers: new Headers(), body: null, text: () => new Promise<string>(() => {}) };
    await expect(client(vi.fn(async () => response), {}, 20).download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
  });
});

// Cancelling the body's stream leaves Gecko's connection open (the live run
// of 2026-10-04 on 1.16.5-beta): only an abort of the request's own signal
// closes it, so every failure aborts a controller injected from a chrome
// window, the plugin sandbox having none (#169)
describe('closing the connection', () => {
  const enc = new TextEncoder();

  /** A client whose requests each get a fresh controller, kept in `controllers`. */
  function withControllers(fetchImpl: unknown, timeoutMs?: number) {
    const controllers: AbortController[] = [];
    const newAbortController = () => {
      const c = new AbortController();
      controllers.push(c);
      return c;
    };
    return { client: createWebDAVClient(cfg, { fetch: fetchImpl as typeof fetch, timeoutMs, newAbortController }), controllers };
  }

  /** A fetch answering `body` with 200 that, like Gecko's, errors the body when its signal aborts. */
  function answering(makeBody: () => ReadableStream<Uint8Array> | null, headers?: Record<string, string>, code = 200) {
    return vi.fn(async (_url: string, init: RequestInit) => {
      const body = makeBody();
      if (body) {
        const tee = new TransformStream<Uint8Array, Uint8Array>();
        void body.pipeTo(tee.writable, { signal: init.signal ?? undefined }).catch(() => {});
        return new Response(tee.readable, { status: code, headers });
      }
      return new Response(null, { status: code, headers });
    });
  }

  /** A body that sends `chunks` and then nothing more. */
  const stalled = (chunks: string[]) => () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const s of chunks) c.enqueue(enc.encode(s));
      },
    });

  it('hands each request its own signal', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 200 }));
    const { client: c, controllers } = withControllers(fetchImpl);
    await c.download('a');
    await c.download('b');
    expect(controllers).toHaveLength(2);
    expect(call(fetchImpl, 0).init.signal).toBe(controllers[0].signal);
    expect(call(fetchImpl, 1).init.signal).toBe(controllers[1].signal);
  });

  it('aborts a request whose headers do not come within the timeout', async () => {
    // Like Gecko's fetch, this one rejects once its signal aborts: the late rejection must be handled
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const { client: c, controllers } = withControllers(fetchImpl, 20);
    await expect(c.download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('No reply') });
    expect(controllers[0].signal.aborted).toBe(true);
  });

  it('aborts a download and a listing whose server stops sending mid-reply', async () => {
    const download = withControllers(answering(stalled(['{"a":'])), 20);
    await expect(download.client.download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
    expect(download.controllers[0].signal.aborted).toBe(true);

    const list = withControllers(answering(stalled(['<d:multistatus xmlns:d="DAV:">']), undefined, 207), 20);
    await expect(list.client.list()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
    expect(list.controllers[0].signal.aborted).toBe(true);
  });

  it('aborts a reply over the cap, declared or grown while reading', async () => {
    const declared = withControllers(answering(stalled(['{']), { 'Content-Length': String(WEBDAV_MAX_REPLY_BYTES + 1) }), 20);
    await expect(declared.client.download('f')).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('10 MB') });
    expect(declared.controllers[0].signal.aborted).toBe(true);

    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    const endless = () => new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(chunk) });
    const grown = withControllers(answering(endless));
    await expect(grown.client.download('f')).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('10 MB') });
    expect(grown.controllers[0].signal.aborted).toBe(true);
  });

  it('aborts a reply that breaks mid-body', async () => {
    const broken = () =>
      new ReadableStream<Uint8Array>({
        start: (c) => c.enqueue(enc.encode('{"a":')),
        pull: (c) => c.error(new TypeError('NetworkError when reading the body.')),
      });
    const { client: c, controllers } = withControllers(answering(broken));
    await expect(c.download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('NetworkError') });
    expect(controllers[0].signal.aborted).toBe(true);
  });

  it('aborts nothing that succeeds', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PROPFIND') return new Response('<d:multistatus xmlns:d="DAV:"></d:multistatus>', { status: 207 });
      if (init.method === 'PUT') return new Response(null, { status: 201 });
      return new Response('{"a":1}', { status: 200 });
    });
    const { client: c, controllers } = withControllers(fetchImpl);
    await c.check();
    await c.upload('f', '{}');
    await expect(c.download('f')).resolves.toBe('{"a":1}');
    await expect(c.list()).resolves.toEqual([]);
    expect(controllers).toHaveLength(4);
    expect(controllers.every((x) => !x.signal.aborted)).toBe(true);
  });

  it('still fails in time when no controller can be made, sending no signal', async () => {
    for (const newAbortController of [() => null, () => { throw new Error('no window'); }]) {
      const fetchImpl = vi.fn(async () => new Response(stalled(['{'])(), { status: 200 }));
      const c = createWebDAVClient(cfg, { fetch: fetchImpl as unknown as typeof fetch, timeoutMs: 20, newAbortController });
      await expect(c.download('f')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('stalled') });
      expect(call(fetchImpl).init.signal).toBeUndefined();
    }
  });
});
