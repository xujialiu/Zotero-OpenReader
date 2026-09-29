import { describe, expect, it, vi } from 'vitest';
import type { ZoteroCredits, ZoteroVoice } from '../../src/read-aloud/zotero-voices';
import { checkZoteroTier } from '../../src/ui/zotero-tier-check';

const VOICES: ZoteroVoice[] = [
  { id: 'std-ava', label: 'Ava', locale: 'en-US', tier: 'standard' },
  { id: 'std-ava', label: 'Ava', locale: 'de-DE', tier: 'standard' },
  { id: 'std-andrew', label: 'Andrew', locale: 'en-US', tier: 'standard' },
  { id: 'prm-aria', label: 'Aria', locale: 'en-US', tier: 'premium' },
];

function deps(over: { signedIn?: boolean; voices?: ZoteroVoice[]; credits?: ZoteroCredits } = {}) {
  const listVoices = vi.fn(async () => over.voices ?? VOICES);
  const credits = vi.fn(async (): Promise<ZoteroCredits> => over.credits ?? { standard: 114, premium: 260 });
  return { signedIn: () => over.signedIn ?? true, service: { listVoices, credits }, listVoices, credits };
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

  // Issue #140: a tier switched off because its time ran out is not switched back on before time is bought
  it('fails a tier whose credits are used up, and only that tier', async () => {
    const d = deps({ credits: { standard: 114, premium: 0 } });
    expect(await checkZoteroTier('premium', d)).toEqual({ ok: false, message: 'No remaining time on Premium. Add more time first.' });
    expect(await checkZoteroTier('standard', d)).toEqual({ ok: true, message: 'Signed in: 2 Standard voices.' });
  });

  it('passes when Zotero gives no figure, or the credits cannot be read: only a known 0 fails', async () => {
    expect(await checkZoteroTier('premium', deps({ credits: { standard: null, premium: null } }))).toMatchObject({ ok: true });
    const d = deps();
    d.credits.mockRejectedValueOnce(new Error('credits did not answer'));
    expect(await checkZoteroTier('premium', d)).toMatchObject({ ok: true });
  });

  it('lets a listing that fails reject, as a provider’s check does', async () => {
    const d = deps();
    d.listVoices.mockRejectedValueOnce(new Error("Zotero's own voices are unavailable (network)"));
    await expect(checkZoteroTier('standard', d)).rejects.toThrow('unavailable');
  });
});
