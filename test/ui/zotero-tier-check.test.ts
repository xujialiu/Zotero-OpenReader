import { describe, expect, it, vi } from 'vitest';
import type { ZoteroVoice } from '../../src/read-aloud/zotero-voices';
import { checkZoteroTier } from '../../src/ui/zotero-tier-check';

const VOICES: ZoteroVoice[] = [
  { id: 'std-ava', label: 'Ava', locale: 'en-US', tier: 'standard' },
  { id: 'std-ava', label: 'Ava', locale: 'de-DE', tier: 'standard' },
  { id: 'std-andrew', label: 'Andrew', locale: 'en-US', tier: 'standard' },
  { id: 'prm-aria', label: 'Aria', locale: 'en-US', tier: 'premium' },
];

function deps(over: { signedIn?: boolean; voices?: ZoteroVoice[] } = {}) {
  const listVoices = vi.fn(async () => over.voices ?? VOICES);
  return { signedIn: () => over.signedIn ?? true, service: { listVoices }, listVoices };
}

describe('checkZoteroTier', () => {
  it('fails without a signed-in Zotero account, before asking Zotero anything', async () => {
    const d = deps({ signedIn: false });
    expect(await checkZoteroTier('standard', d)).toEqual({ ok: false, message: 'Not signed in to a Zotero account.' });
    expect(d.listVoices).not.toHaveBeenCalled();
  });

  it('fails when Zotero lists no voice of the tier', async () => {
    const d = deps({ voices: VOICES.filter((v) => v.tier === 'standard') });
    expect(await checkZoteroTier('premium', d)).toEqual({ ok: false, message: 'Zotero lists no Premium voices.' });
  });

  // The credits have a line of their own under the tier's name (issue #159)
  it('passes with the voice count — one per voice, not per locale — and leaves the credits to their own line', async () => {
    expect(await checkZoteroTier('standard', deps())).toEqual({ ok: true, message: 'Signed in: 2 Standard voices.' });
    expect(await checkZoteroTier('premium', deps())).toEqual({ ok: true, message: 'Signed in: 1 Premium voices.' });
  });

  it('lets a listing that fails reject, as a provider’s check does', async () => {
    const d = deps();
    d.listVoices.mockRejectedValueOnce(new Error("Zotero's own voices are unavailable (network)"));
    await expect(checkZoteroTier('standard', d)).rejects.toThrow('unavailable');
  });
});
