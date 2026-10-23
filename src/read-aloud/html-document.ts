import { withTimeout } from '../core/timeout';

export type DocumentPack =
  | { ok: true; bytes: ArrayBuffer; packVersion: number; schemaMajorVersion: number }
  | { ok: false; reason: string };
export type GetDocumentPack = (itemID: number, options?: unknown) => Promise<DocumentPack>;
export interface HtmlDocumentDeps {
  host: { getPack: GetDocumentPack };
  isHTML(itemID: number): boolean;
  read(itemID: number): Promise<{ text: string; hash: string }>;
  normalize(text: string): string;
  extract(html: string, hash: string, options: unknown): Promise<DocumentPack>;
  blockCount(pack: Extract<DocumentPack, { ok: true }>): Promise<number>;
  error(itemID: number, error: unknown): void;
  exportFunction?(fn: GetDocumentPack): GetDocumentPack;
  timeoutMs?: number;
  maxCacheBytes?: number;
}

interface Prepared { pack: Extract<DocumentPack, { ok: true }>; blocks: number }
interface Observation { itemID: number; status: 'native' | 'preparing' | 'compatibility' | 'failed'; blocks?: number; cacheHit?: boolean }
const unavailable: DocumentPack = { ok: false, reason: 'unavailable' };
const failed: DocumentPack = { ok: false, reason: 'failed' };

/**
 * Temporary Zotero 10 compatibility (#228). Keep native nonempty analysis;
 * only a rejected/empty local HTML document takes the normalized-buffer path.
 * No attachment, source file, or native disk cache is written here.
 */
export function installHtmlDocuments(deps: HtmlDocumentDeps) {
  const original = deps.host.getPack;
  const timeout = deps.timeoutMs ?? 30_000;
  const maxBytes = deps.maxCacheBytes ?? 16 * 1024 * 1024;
  const cache = new Map<string, Prepared>();
  const pending = new Map<string, Promise<Prepared>>();
  const observations = new Map<number, Observation>();
  const newest = new Map<number, number>();
  let cacheBytes = 0;
  let sequence = 0;
  let installed = true;

  function remember(key: string, value: Prepared): void {
    const size = value.pack.bytes.byteLength;
    if (size > maxBytes) return;
    cache.set(key, value);
    cacheBytes += size;
    while (cacheBytes > maxBytes || cache.size > 8) {
      const oldest = cache.entries().next().value;
      if (!oldest) break;
      cacheBytes -= oldest[1].pack.bytes.byteLength;
      cache.delete(oldest[0]);
    }
  }

  const hook: GetDocumentPack = (itemID, options) => {
    if (!installed || !deps.isHTML(itemID)) return Reflect.apply(original, deps.host, [itemID, options]);
    const token = ++sequence;
    const deadline = Date.now() + timeout;
    let cancelled = false;
    newest.set(itemID, token);
    const current = () => installed && !cancelled;
    const report = (row: Omit<Observation, 'itemID'>, afterTimeout = false) => {
      if (!installed || (cancelled && !afterTimeout) || newest.get(itemID) !== token) return;
      observations.delete(itemID);
      observations.set(itemID, { itemID, ...row });
      while (observations.size > 32) {
        const oldest = observations.keys().next().value;
        if (oldest === undefined) break;
        observations.delete(oldest);
        newest.delete(oldest);
      }
    };
    report({ status: 'preparing' });

    async function load(): Promise<DocumentPack> {
      const native = await Reflect.apply(original, deps.host, [itemID, options]);
      if (!current()) return unavailable;
      if (native.ok) {
        const blocks = await deps.blockCount(native);
        if (!current()) return unavailable;
        if (blocks > 0) { report({ status: 'native', blocks }); return native; }
      } else if (native.reason !== 'unavailable') {
        report({ status: 'failed' });
        return native;
      }
      const source = await deps.read(itemID);
      if (!current()) return unavailable;
      const key = `${itemID}:${source.hash}`;
      let value = cache.get(key);
      const cacheHit = !!value;
      if (value) { cache.delete(key); cache.set(key, value); }
      else {
        let job = pending.get(key);
        if (!job) {
          const prepare = async (): Promise<Prepared> => {
            const html = deps.normalize(source.text);
            const pack = await deps.extract(html, source.hash, options);
            if (!pack.ok) throw new Error('HTML Document analysis failed');
            const blocks = await deps.blockCount(pack);
            if (!blocks) throw new Error('HTML Document analysis returned no readable text');
            return { pack, blocks };
          };
          // Cache only the bounded promise's result. A worker that answers after
          // the deadline must not populate the cache through its continuation.
          job = withTimeout(prepare(), Math.max(1, deadline - Date.now()), () => new Error('HTML preparation timed out'))
            .then(prepared => { if (current()) remember(key, prepared); return prepared; })
            .finally(() => { if (pending.get(key) === job) pending.delete(key); });
          pending.set(key, job);
        }
        value = await job;
      }
      if (!current()) return unavailable;
      report({ status: 'compatibility', blocks: value.blocks, cacheHit });
      // Zotero promises caller-owned bytes. Neither a transfer nor a mutation
      // by one consumer may detach/corrupt the cached pack or another caller's.
      return { ...value.pack, bytes: value.pack.bytes.slice(0) };
    }

    return withTimeout(load(), timeout, () => new Error('HTML preparation timed out'), () => { cancelled = true; })
      .catch(error => {
        if (installed && newest.get(itemID) === token) {
          report({ status: 'failed' }, true);
          try { deps.error(itemID, error); } catch { /* Reporting must not reject Zotero's getPack contract. */ }
        }
        return installed ? failed : unavailable;
      })
      .finally(() => { cancelled = true; });
  };
  const exported = deps.exportFunction ? deps.exportFunction(hook) : hook;
  deps.host.getPack = exported;

  return {
    inspect: (): Observation[] => [...observations.values()].map(row => ({ ...row })),
    dispose(): void {
      if (!installed) return;
      installed = false;
      if (deps.host.getPack === exported) deps.host.getPack = original;
      cache.clear(); pending.clear(); observations.clear(); newest.clear(); cacheBytes = 0;
    },
  };
}
