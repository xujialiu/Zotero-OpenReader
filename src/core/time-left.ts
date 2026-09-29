import { t } from './l10n';

/**
 * A Zotero voice's time left (issue #140), rounded the way Zotero's own
 * player rounded it (`formatTimeRemaining`, `resource/reader/reader.js`
 * 38417-38440 in 10.0.3-beta.3): minutes rounded up, split into days,
 * hours and minutes. zotero.org rounds the same way: 260 credits at 30 a
 * minute read "9 minutes" there on 2026-09-29. Written in the owner's
 * form, `1h 54min` (zh-CN `1小时54分钟`), through the plugin's own
 * messages rather than Zotero's narrow `Intl.DurationFormat` (`1h 54m`).
 */

/** More minutes than this is unlimited, or as good as: Zotero shows no time past it. */
export const UNLIMITED_MINUTES = 60 * 24 * 90;

/** Under this many minutes the time is low: red, and the settings offer Add more time (Zotero's `URGENT_THRESHOLD_MINUTES`, reader.js 82160). */
export const LOW_MINUTES = 3;

/** The time as the plugin writes it; null when it is unknown or past 90 days. Nothing left, or less, is 0min. */
export function formatTimeLeft(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes > UNLIMITED_MINUTES) return null;
  let rest = Math.max(0, Math.ceil(minutes));
  const days = Math.floor(rest / (60 * 24));
  const hours = Math.floor((rest % (60 * 24)) / 60);
  rest %= 60;
  if (days > 0) return t('ztts-duration-dhm', { days, hours, minutes: rest });
  if (hours > 0) return t('ztts-duration-hm', { hours, minutes: rest });
  return t('ztts-duration-m', { minutes: rest });
}

/** The 90 days a range of times tops out at, in days alone: the settings add a + to it. */
export function formatOverUnlimited(): string {
  return t('ztts-duration-d', { days: UNLIMITED_MINUTES / (60 * 24) });
}

/** Under 3 minutes, or nothing left. */
export function isLowTime(minutes: number | null | undefined): boolean {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes < LOW_MINUTES;
}
