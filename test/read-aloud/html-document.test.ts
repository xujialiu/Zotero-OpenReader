import { afterEach, describe, expect, it, vi } from 'vitest';
import { installHtmlDocuments, type DocumentPack, type GetDocumentPack, type HtmlDocumentDeps } from '../../src/read-aloud/html-document';

// The pack's first byte stands for its top-level block count. The integration
// adapter reads that count with Zotero's bundled pack reader, not this model.
const pack = (blocks: number): DocumentPack => ({ ok: true, bytes: Uint8Array.of(blocks).buffer, packVersion: 1, schemaMajorVersion: 1 });
const count = (p: DocumentPack) => p.ok ? new Uint8Array(p.bytes)[0] : -1;
const bodyless = '<html><head><title>Local article</title><p>A sentence to read.</p>';
const canonical = '<html><head><title>Local article</title></head><body><p>A sentence to read.</p></body></html>';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.useRealTimers(); });

function setup(native: DocumentPack = { ok: false, reason: 'unavailable' }, overrides: Partial<HtmlDocumentDeps> = {}) {
  const nativeGet = vi.fn<GetDocumentPack>(async () => native);
  const host = { getPack: nativeGet as GetDocumentPack };
  const source = { text: bodyless, hash: 'source-a' };
  const deps: HtmlDocumentDeps = {
    host,
    isHTML: id => id !== 99,
    read: vi.fn(async () => ({ ...source })),
    normalize: vi.fn(() => canonical),
    extract: vi.fn(async () => pack(1)),
    blockCount: vi.fn(async p => count(p)),
    error: vi.fn(),
    ...overrides,
  };
  const compatibility = installHtmlDocuments(deps);
  disposers.push(() => compatibility.dispose());
  return { host, deps, source, compatibility, nativeGet };
}

describe('HTML Document analysis compatibility (#228)', () => {
  it('prepares an imported HTML file rejected by Zotero without converting the attachment', async () => {
    const h = setup();
    const result = await h.host.getPack(1);
    expect(result.ok).toBe(true);
    expect(count(result)).toBe(1);
    expect(h.deps.normalize).toHaveBeenCalledWith(bodyless);
    expect(h.deps.extract).toHaveBeenCalledWith(canonical, 'source-a', undefined);
    expect(h.source.text).toBe(bodyless);
  });

  it('replaces an empty native snapshot pack using a detached normalized copy', async () => {
    const h = setup(pack(0));
    expect(count(await h.host.getPack(1))).toBe(1);
    expect(h.deps.normalize).toHaveBeenCalledOnce();
  });

  it('passes successful native HTML through without reading or normalizing the file', async () => {
    const native = pack(5), h = setup(native);
    expect(await h.host.getPack(1)).toBe(native);
    expect(h.deps.read).not.toHaveBeenCalled();
    expect(h.deps.extract).not.toHaveBeenCalled();
  });

  it.each(['PDF', 'EPUB', 'linked URL'])('does not intercept a %s', async () => {
    const native = pack(0), h = setup(native);
    expect(await h.host.getPack(99)).toBe(native);
    expect(h.deps.blockCount).not.toHaveBeenCalled();
    expect(h.deps.read).not.toHaveBeenCalled();
  });

  it('preserves the native receiver, priority, and progress options', async () => {
    const options = { isPriority: true, onProgress: vi.fn() };
    const h = setup();
    await h.host.getPack(1, options);
    expect(h.nativeGet.mock.contexts[0]).toBe(h.host);
    expect(h.nativeGet).toHaveBeenCalledWith(1, options);
    expect(h.deps.extract).toHaveBeenCalledWith(canonical, 'source-a', options);
  });

  it('does not treat a failed native extraction as the unsupported-HTML gate', async () => {
    const native: DocumentPack = { ok: false, reason: 'failed' }, h = setup(native);
    expect(await h.host.getPack(1)).toBe(native);
    expect(h.deps.read).not.toHaveBeenCalled();
  });

  it('shares concurrent extraction but gives each caller its own bytes', async () => {
    const gate = deferred<DocumentPack>();
    const h = setup(undefined, { extract: vi.fn(() => gate.promise) });
    const a = h.host.getPack(1), b = h.host.getPack(1);
    await vi.waitFor(() => expect(h.deps.extract).toHaveBeenCalledOnce());
    gate.resolve(pack(2));
    const [ra, rb] = await Promise.all([a, b]);
    expect(count(ra)).toBe(2); expect(count(rb)).toBe(2);
    if (!ra.ok || !rb.ok) throw new Error('missing pack');
    expect(ra.bytes).not.toBe(rb.bytes);
    new Uint8Array(ra.bytes)[0] = 0;
    expect(count(await h.host.getPack(1))).toBe(2);
    expect(h.deps.extract).toHaveBeenCalledOnce();
  });

  it('invalidates cached compatibility when the source bytes change', async () => {
    const h = setup();
    await h.host.getPack(1);
    h.source.hash = 'source-b'; h.source.text = '<body><p>Changed.</p></body>';
    await h.host.getPack(1);
    expect(h.deps.extract).toHaveBeenCalledTimes(2);
    expect(h.deps.normalize).toHaveBeenLastCalledWith(h.source.text);
  });

  it('does not join an older in-flight extraction after the source changes', async () => {
    const gate = deferred<DocumentPack>();
    const h = setup(undefined, { extract: vi.fn(async (_html, hash) => hash === 'source-a' ? gate.promise : pack(3)) });
    const old = h.host.getPack(1);
    await vi.waitFor(() => expect(h.deps.extract).toHaveBeenCalledOnce());
    h.source.hash = 'source-b';
    expect(count(await h.host.getPack(1))).toBe(3);
    gate.resolve(pack(1)); await old;
    expect(count(await h.host.getPack(1))).toBe(3);
    expect(h.deps.extract).toHaveBeenCalledTimes(2);
  });

  it('bounds the memory cache rather than retaining every document', async () => {
    const h = setup(undefined, { maxCacheBytes: 1 });
    await h.host.getPack(1); await h.host.getPack(2); await h.host.getPack(1);
    expect(h.deps.extract).toHaveBeenCalledTimes(3);
  });

  it('reports empty normalized output and permits a later retry', async () => {
    const extract = vi.fn().mockResolvedValueOnce(pack(0)).mockResolvedValueOnce(pack(1));
    const h = setup(undefined, { extract });
    expect((await h.host.getPack(1)).ok).toBe(false);
    expect(h.deps.error).toHaveBeenCalledOnce();
    expect(count(await h.host.getPack(1))).toBe(1);
  });

  it('reports a preparation exception without caching the failure', async () => {
    const h = setup(undefined, { normalize: vi.fn().mockImplementationOnce(() => { throw new Error('parse failed'); }).mockReturnValue(canonical) });
    expect((await h.host.getPack(1)).ok).toBe(false);
    expect(h.deps.error).toHaveBeenCalledOnce();
    expect(count(await h.host.getPack(1))).toBe(1);
  });

  it('bounds a stalled extraction, then discards its late result', async () => {
    vi.useFakeTimers();
    const gate = deferred<DocumentPack>();
    const extract = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(pack(2));
    const h = setup(undefined, { extract, timeoutMs: 100 });
    const pending = h.host.getPack(1);
    await vi.advanceTimersByTimeAsync(101);
    expect((await pending).ok).toBe(false);
    gate.resolve(pack(1)); await vi.advanceTimersByTimeAsync(0);
    expect(count(await h.host.getPack(1))).toBe(2);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled native HTML request too', async () => {
    vi.useFakeTimers();
    const host = { getPack: vi.fn<GetDocumentPack>(() => new Promise(() => {})) };
    const h = setup(undefined, { host, timeoutMs: 100 });
    const pending = host.getPack(1);
    await vi.advanceTimersByTimeAsync(101);
    expect((await pending).ok).toBe(false);
    expect(h.deps.error).toHaveBeenCalledOnce();
  });

  it('restores the native entry point and discards an in-flight result on dispose', async () => {
    const gate = deferred<DocumentPack>();
    const h = setup(undefined, { extract: vi.fn(() => gate.promise) });
    const pending = h.host.getPack(1);
    await vi.waitFor(() => expect(h.deps.extract).toHaveBeenCalledOnce());
    h.compatibility.dispose();
    expect(h.host.getPack).toBe(h.nativeGet);
    gate.resolve(pack(1));
    expect((await pending).ok).toBe(false);
    expect(h.compatibility.inspect()).toEqual([]);
    expect(h.deps.error).not.toHaveBeenCalled();
  });

  it('does not overwrite another owner of the entry point during teardown', () => {
    const h = setup();
    const other = vi.fn<GetDocumentPack>(async () => pack(1));
    h.host.getPack = other; h.compatibility.dispose();
    expect(h.host.getPack).toBe(other);
  });

  it('exports the hook and reports compatibility use without document text', async () => {
    const exported = vi.fn((fn: GetDocumentPack) => fn);
    const h = setup(undefined, { exportFunction: exported });
    await h.host.getPack(1); await h.host.getPack(1);
    expect(exported).toHaveBeenCalledOnce();
    expect(h.compatibility.inspect()).toEqual([expect.objectContaining({ itemID: 1, status: 'compatibility', blocks: 1, cacheHit: true })]);
    expect(JSON.stringify(h.compatibility.inspect())).not.toContain('sentence');
  });
});
