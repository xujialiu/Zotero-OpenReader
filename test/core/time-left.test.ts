import { describe, expect, it } from 'vitest';
import { formatTimeLeft, formatOverUnlimited, isLowTime, LOW_MINUTES, UNLIMITED_MINUTES } from '../../src/core/time-left';

describe('formatTimeLeft (issue #140): Zotero’s own rounding, the owner’s min', () => {
  it('keeps Zotero’s lines: 90 days past which it is unlimited, 3 minutes under which it is low', () => {
    expect(UNLIMITED_MINUTES).toBe(60 * 24 * 90);
    expect(LOW_MINUTES).toBe(3);
  });

  it('rounds up, as zotero.org does: 260 credits at 30 a minute is 9min', () => {
    expect(formatTimeLeft(260 / 30)).toBe('9min');
    expect(formatTimeLeft(26)).toBe('26min');
    expect(formatTimeLeft(114)).toBe('1h 54min');
    expect(formatTimeLeft(120)).toBe('2h 0min');
    expect(formatTimeLeft(60 * 24 * 20 + 185)).toBe('20d 3h 5min');
  });

  it('writes nothing left, or less, as 0min', () => {
    expect(formatTimeLeft(0)).toBe('0min');
    expect(formatTimeLeft(-4)).toBe('0min');
  });

  it('says nothing when the time is unknown or past 90 days', () => {
    expect(formatTimeLeft(null)).toBeNull();
    expect(formatTimeLeft(undefined)).toBeNull();
    expect(formatTimeLeft(Number.NaN)).toBeNull();
    expect(formatTimeLeft(UNLIMITED_MINUTES + 1)).toBeNull();
    expect(formatTimeLeft(UNLIMITED_MINUTES)).toBe('90d 0h 0min');
  });

  it('writes the 90 days a range tops out at in days alone', () => {
    expect(formatOverUnlimited()).toBe('90d');
  });
});

describe('isLowTime', () => {
  it('is low under 3 minutes, and when nothing is left', () => {
    expect(isLowTime(2.9)).toBe(true);
    expect(isLowTime(0)).toBe(true);
    expect(isLowTime(3)).toBe(false);
    expect(isLowTime(null)).toBe(false);
  });
});
