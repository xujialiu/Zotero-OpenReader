import { withTimeout } from './timeout';

/**
 * A WebDAV client just large enough to keep a few files in one folder: the
 * settings backups — one per machine since #41 — and the shared reading
 * positions (#40). Plain fetch with Basic authentication, which every
 * WebDAV host the plugin is likely to meet (Nextcloud, Synology, Jianguoyun,
 * Koofr, Apache or nginx with a password file) accepts over HTTPS; a server
 * that insists on Digest is not supported. Every request is bounded by a
 * timeout, and its body too, in time and in size (#169): see readText below.
 * A failure aborts the request through an AbortController injected from a
 * chrome window — the plugin sandbox has none — which is what closes its
 * connection; without one (no window up) the request still fails in time,
 * only its connection is left to the network.
 */

export type WebDAVConfig = { url: string; username: string; password: string };

export type WebDAVErrorKind =
  /** The settings are unusable — no URL, or not an http(s) one */
  | 'config'
  /** 401 or 403 */
  | 'auth'
  /** The folder (check) or the file (download) is not there */
  | 'not-found'
  /** The request could not be made, or its reply did not come in time or broke off */
  | 'network'
  /** Any other status, or a reply too large to be one of ours */
  | 'http';

export class WebDAVError extends Error {
  constructor(
    public readonly kind: WebDAVErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WebDAVError';
  }
}

export const WEBDAV_TIMEOUT_MS = 15_000;

/**
 * The most of one reply the client reads (#169, the cap #168 proposed). Ours
 * are a settings file, two positions files whose items cost a few hundred
 * bytes each (docs/spec/SYNC-FORMAT.md) and one folder's listing, so a reply
 * past this is a misbehaving server, and reading it whole would only fill
 * Zotero's memory.
 */
export const WEBDAV_MAX_REPLY_BYTES = 10 * 1024 * 1024;

/** The folder URL with exactly one trailing slash; rejects anything that is not http(s). */
export function normalizeWebDAVURL(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new WebDAVError('config', 'Set the WebDAV URL first.');
  if (!/^https?:\/\//i.test(trimmed)) throw new WebDAVError('config', 'The WebDAV URL must start with http:// or https://.');
  return trimmed.replace(/\/+$/, '') + '/';
}

/** `Basic` credentials: base64 of the UTF-8 bytes of `user:password` (RFC 7617). */
export function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
}

export interface WebDAVFile {
  /** The file's name inside the folder, percent-decoding undone. */
  name: string;
  /** The server's getlastmodified for it, verbatim (RFC 1123), or null. */
  lastModified: string | null;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXML(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** One tag's text inside a block, whatever namespace prefix the server chose. */
function tagText(block: string, local: string): string | null {
  const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * The files of a PROPFIND Depth 1 multistatus, parsed without a DOM — the
 * sandbox has DOMParser but the tests' Node does not, and multistatus is
 * machine-written XML: one <response> per entry, href and getlastmodified
 * as flat text. Namespace prefixes are not assumed (Nextcloud writes d:,
 * Apache D: with lp1: on the props, others none). Collections — the
 * folder's own entry included — are skipped by their trailing slash or a
 * <collection/> resourcetype.
 */
export function parseMultistatus(xml: string): WebDAVFile[] {
  const out: WebDAVFile[] = [];
  for (const [, block] of xml.matchAll(/<(?:[\w.-]+:)?response[\s>]([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi)) {
    const href = tagText(block, 'href');
    if (!href) continue;
    const path = decodeXML(href);
    if (path.endsWith('/') || /<(?:[\w.-]+:)?collection[\s/>]/i.test(block)) continue;
    const segment = path.slice(path.lastIndexOf('/') + 1);
    let name = segment;
    try {
      name = decodeURIComponent(segment);
    } catch {
      // A server that does not percent-encode leaves the segment as is
    }
    if (!name) continue;
    out.push({ name, lastModified: tagText(block, 'getlastmodified') });
  }
  return out;
}

/** What list() asks the server for; allprop replies still parse, this just keeps them small. */
const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><getlastmodified/><resourcetype/></prop></propfind>';

export interface WebDAVClient {
  /** The folder the files live in, normalized. */
  readonly url: string;
  /** Proves the URL and the credentials: the folder answers a PROPFIND. */
  check(): Promise<void>;
  /** Writes a file, creating the folder when the server says it is missing. */
  upload(name: string, text: string): Promise<void>;
  /** Reads a file; `not-found` when the server has none. */
  download(name: string): Promise<string>;
  /** The folder's files with their last-modified dates; `not-found` when the folder itself is missing. */
  list(): Promise<WebDAVFile[]>;
}

export interface WebDAVDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
  /**
   * An AbortController from a chrome window, one per request (#169).
   * Cancelling a reply's stream does not close Gecko's connection (measured
   * 2026-10-04: the socket of a stalled reply stayed open for minutes after
   * the cancel); aborting the request's signal does. Null, or absent, when
   * no window is up: the request is then still bounded, not closed.
   */
  newAbortController?: () => AbortController | null;
}

/** A reply, and the abort that closes its connection. */
interface Reply {
  response: Response;
  abort: () => void;
}

export function createWebDAVClient(cfg: WebDAVConfig, deps: WebDAVDeps): WebDAVClient {
  const url = normalizeWebDAVURL(cfg.url);
  const timeoutMs = deps.timeoutMs ?? WEBDAV_TIMEOUT_MS;
  const auth: Record<string, string> = cfg.username ? { Authorization: basicAuthHeader(cfg.username, cfg.password) } : {};

  function newController(): AbortController | null {
    try {
      return deps.newAbortController?.() ?? null;
    } catch {
      return null;
    }
  }

  async function request(method: string, target: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
    const controller = newController();
    const abort = () => {
      try {
        controller?.abort();
      } catch {
        // Best-effort: the error the caller gets is what matters
      }
    };
    let response: Response;
    try {
      response = await withTimeout(
        deps.fetch(target, {
          method,
          headers: { ...auth, ...init.headers },
          body: init.body,
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        }),
        timeoutMs,
        () => new WebDAVError('network', `No reply from ${url} within ${Math.round(timeoutMs / 1000)} s.`),
        abort,
      );
    } catch (e) {
      if (e instanceof WebDAVError) throw e;
      throw new WebDAVError('network', `Cannot reach ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new WebDAVError('auth', `The server rejected the username or password (HTTP ${response.status}).`, response.status);
    }
    return { response, abort };
  }

  const failed = (what: string, response: Response) => new WebDAVError('http', `${what} failed: HTTP ${response.status}.`, response.status);

  /**
   * A reply's body as text (#169). The timeout in request() ends when the
   * headers arrive, and a server that then stops sending would leave the
   * read pending for good — and with it the single-flight sync waiting on
   * it, for the rest of the session. So every chunk must come within the
   * timeout: the gap is bounded, not the whole body, and a reply that keeps
   * arriving, however slowly, still finishes. A failure aborts the request,
   * which closes the connection rather than leaving it open behind the
   * rejection, and cancels the stream, the one release left when no
   * controller could be made.
   */
  async function readText({ response, abort }: Reply): Promise<string> {
    const stalled = () => new WebDAVError('network', `The reply from ${url} stalled: nothing arrived for ${Math.round(timeoutMs / 1000)} s.`);
    const tooLarge = () => new WebDAVError('http', `The reply from ${url} is larger than ${WEBDAV_MAX_REPLY_BYTES / 1024 / 1024} MB; no file of ours is that big.`);
    const body = response.body;
    if (!body) return withTimeout(response.text(), timeoutMs, stalled, abort);
    if (Number(response.headers.get('content-length')) > WEBDAV_MAX_REPLY_BYTES) {
      abort();
      body.cancel().catch(() => {});
      throw tooLarge();
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await withTimeout(reader.read(), timeoutMs, stalled);
        if (done) return text + decoder.decode();
        total += value.byteLength;
        if (total > WEBDAV_MAX_REPLY_BYTES) throw tooLarge();
        text += decoder.decode(value, { stream: true });
      }
    } catch (e) {
      abort();
      reader.cancel().catch(() => {});
      if (e instanceof WebDAVError) throw e;
      throw new WebDAVError('network', `The reply from ${url} broke off: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    url,

    async check() {
      const { response } = await request('PROPFIND', url, { headers: { Depth: '0' } });
      if (response.status === 404) {
        throw new WebDAVError('not-found', `The folder ${url} does not exist. It is created on the first upload.`, 404);
      }
      if (!response.ok) throw failed('PROPFIND', response);
    },

    async upload(name, text) {
      const target = url + name;
      const put = async () => (await request('PUT', target, { headers: { 'Content-Type': 'application/json' }, body: text })).response;
      let response = await put();
      // RFC 4918 answers 409 to a PUT whose parent collection is missing;
      // some servers say 404. Make the folder and write once more. A 405
      // from MKCOL means the folder exists after all.
      if (response.status === 404 || response.status === 409) {
        const { response: made } = await request('MKCOL', url);
        if (!made.ok && made.status !== 405) throw failed(`Creating the folder ${url}`, made);
        response = await put();
      }
      if (!response.ok) throw failed('Upload', response);
    },

    async download(name) {
      const target = url + name;
      const reply = await request('GET', target);
      const { response } = reply;
      if (response.status === 404) throw new WebDAVError('not-found', `No backup on the server yet (${target} not found).`, 404);
      if (!response.ok) throw failed('Download', response);
      return readText(reply);
    },

    async list() {
      const reply = await request('PROPFIND', url, { headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: PROPFIND_BODY });
      const { response } = reply;
      if (response.status === 404) {
        throw new WebDAVError('not-found', `The folder ${url} does not exist. It is created on the first upload.`, 404);
      }
      if (!response.ok) throw failed('PROPFIND', response);
      return parseMultistatus(await readText(reply));
    },
  };
}
