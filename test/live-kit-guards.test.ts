import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const scripts = [
  '01-enable-held-lock.js', '02-test-held-unlocks.js', '04-stale-enable.js',
  '05-stale-test-then-fresh.js', '06-close-window-pending.js',
];

/** Execute the actual guard; stop before the first profile, UI or network access. */
function guarded(script: string, stubBase: string, altBase = 'http://127.0.0.1:8932'): Promise<unknown> {
  const source = readFileSync(new URL(`./zotero-dev/scripts/provider-controls/${script}`, import.meta.url), 'utf8');
  const pastGuard = () => { throw new Error('guard passed; no live state accessed'); };
  return runInNewContext(source, {
    URL,
    Zotero: {
      ZoteroTTSRun: { params: { stubBase, altBase }, state: { pc: { stubBase, altBase } } },
      Prefs: new Proxy({}, { get: pastGuard }),
    },
    Services: new Proxy({}, { get: pastGuard }),
    fetch: pastGuard,
    setTimeout: pastGuard,
  });
}

describe.each(scripts)('provider-controls/%s loopback guard', script => {
  it.each(['http://127.0.0.1:8931', 'http://localhost:8931', 'http://[::1]:8931'])('accepts %s before any live access', async address => {
    await expect(guarded(script, address)).rejects.toThrow('guard passed; no live state accessed');
  });

  it('rejects a remote stub before touching state or sending a request', async () => {
    await expect(guarded(script, 'https://example.com')).rejects.toThrow('stubBase must be loopback');
  });
});

describe.each(['04-stale-enable.js', '05-stale-test-then-fresh.js'])('%s alternate address guard', script => {
  it('rejects a remote alternate address before touching state', async () => {
    await expect(guarded(script, 'http://127.0.0.1:8931', 'https://example.com')).rejects.toThrow('altBase must be loopback');
  });
});
