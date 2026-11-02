import { describe, expect, it } from 'vitest';

describe('the replacements worker (ADR 0024)', () => {
  it('says it is ready, reports each pattern row it starts, then the spans', async () => {
    const posted: any[] = [];
    const scope: any = { postMessage: (message: unknown) => posted.push(message), onmessage: null };
    (globalThis as any).self = scope;
    await import('../../src/workers/replacements-worker');
    expect(posted).toEqual([{ type: 'ready' }]);
    scope.onmessage({ data: { id: 7, text: 'IL-6 rose', skip: [], rows: [
      { text: 'rose', readAs: 'went up', mode: 'exact', matchCase: true },
      { text: 'IL-(\\d+)', readAs: 'interleukin $1', mode: 'regex', matchCase: true },
    ] } });
    expect(posted.slice(1)).toEqual([
      { type: 'row', id: 7, row: 1 },
      { type: 'done', id: 7, spans: [{ from: 0, to: 4, text: 'interleukin 6', row: 1 }, { from: 5, to: 9, text: 'went up', row: 0 }] },
    ]);
    scope.onmessage({ data: { id: 8, text: 'x', skip: [], rows: null } });
    expect(posted[posted.length - 1]).toMatchObject({ type: 'error', id: 8 });
    delete (globalThis as any).self;
  });
});
