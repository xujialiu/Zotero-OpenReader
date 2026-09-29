import { describe, expect, it } from 'vitest';
import { formatTimeLeft, formatOverUnlimited, isLowTime, LOW_MINUTES, UNLIMITED_MINUTES } from '../../src/core/time-left';

/** Stands in for Intl.DurationFormat, which Node 22 lacks and Zotero 10 (Firefox 140) has. */
class FakeDurationFormat {
  static seen: Array<{ locale: unknown; options: Record<string, unknown> }> = [];
  constructor(locale: unknown, private options: Record<string, unknown>) {
    FakeDurationFormat.seen.push({ locale, options });
  }
  format(d: { days: number; hours: number; minutes: number }): string {
    const parts: string[] = [];
    if (d.days || this.options.daysDisplay === 'always') parts.push(`${d.days}天`);
    if (d.hours || this.options.hoursDisplay === 'always') parts.push(`${d.hours}小时`);
    if (d.minutes || this.options.minutesDisplay === 'always') parts.push(`${d.minutes}分钟`);
    return parts.join('');
  }
}

describe('formatTimeLeft (issue #140): Zotero’s own formatTimeRemaining, reader.js 38417-38440', () => {
  it('keeps Zotero’s lines: 90 days past which it is unlimited, 3 minutes under which it is low', () => {
    expect(UNLIMITED_MINUTES).toBe(60 * 24 * 90);
    expect(LOW_MINUTES).toBe(3);
  });

  it('rounds up, as zotero.org does: 260 credits at 30 a minute is 9m', () => {
    expect(formatTimeLeft(260 / 30, null)).toBe('9m');
    expect(formatTimeLeft(26, null)).toBe('26m');
    expect(formatTimeLeft(114, null)).toBe('1h 54m');
    expect(formatTimeLeft(60 * 24 * 20 + 185, null)).toBe('20d 3h 5m');
  });

  it('writes nothing left, or less, as 0m', () => {
    expect(formatTimeLeft(0, null)).toBe('0m');
    expect(formatTimeLeft(-4, null)).toBe('0m');
  });

  it('says nothing when the time is unknown or past 90 days', () => {
    expect(formatTimeLeft(null, null)).toBeNull();
    expect(formatTimeLeft(undefined, null)).toBeNull();
    expect(formatTimeLeft(Number.NaN, null)).toBeNull();
    expect(formatTimeLeft(UNLIMITED_MINUTES + 1, null)).toBeNull();
    expect(formatTimeLeft(UNLIMITED_MINUTES, null)).toBe('90d 0h 0m');
  });

  it('goes through Intl.DurationFormat, narrow, in the app’s locale, as Zotero does', () => {
    FakeDurationFormat.seen = [];
    expect(formatTimeLeft(114, FakeDurationFormat)).toBe('1小时54分钟');
    expect(formatTimeLeft(9, FakeDurationFormat)).toBe('9分钟');
    expect(FakeDurationFormat.seen[0]).toEqual({
      locale: undefined,
      options: { style: 'narrow', daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' },
    });
  });

  it('builds one formatter, not one per voice per snapshot', () => {
    class Counted extends FakeDurationFormat {}
    const before = FakeDurationFormat.seen.length;
    for (let i = 0; i < 50; i++) formatTimeLeft(i, Counted);
    expect(FakeDurationFormat.seen.length - before).toBe(1);
  });

  it('writes the 90 days a range tops out at in days alone', () => {
    expect(formatOverUnlimited(null)).toBe('90d');
    expect(formatOverUnlimited(FakeDurationFormat)).toBe('90天');
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
