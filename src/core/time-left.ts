/**
 * A Zotero voice's time left (issue #140), written the way Zotero's own
 * player wrote it (`formatTimeRemaining`, `resource/reader/reader.js`
 * 38417-38440 in 10.0.3-beta.3): minutes rounded up, split into days,
 * hours and minutes, and formatted narrow in the app's language — 1h 54m,
 * and in Chinese 1小时54分钟. zotero.org rounds the same way: 260 credits
 * at 30 a minute read "9 minutes" there on 2026-09-29.
 */

/** More minutes than this is unlimited, or as good as: Zotero shows no time past it. */
export const UNLIMITED_MINUTES = 60 * 24 * 90;

/** Under this many minutes the time is low and turns red: Zotero's `URGENT_THRESHOLD_MINUTES` (reader.js 82160). */
export const LOW_MINUTES = 3;

type Duration = { days: number; hours: number; minutes: number };
/** `Intl.DurationFormat`, which Zotero 10 (Firefox 140) has and Node 22 does not. */
export type DurationFormatConstructor = new (
  locale: string | undefined,
  options: Record<string, string>,
) => { format(duration: Duration): string };

const nativeFormat = (): DurationFormatConstructor | null =>
  ((Intl as unknown as { DurationFormat?: DurationFormatConstructor }).DurationFormat ?? null);

/**
 * One formatter per constructor and options: the Player's snapshot formats
 * every voice of the language four times a second, and building an Intl
 * formatter each time is the per-voice cost #125 was about.
 */
const formatters = new WeakMap<DurationFormatConstructor, Map<string, { format(duration: Duration): string }>>();
function formatter(Format: DurationFormatConstructor, options: Record<string, string>) {
  let byOptions = formatters.get(Format);
  if (!byOptions) formatters.set(Format, (byOptions = new Map()));
  const key = JSON.stringify(options);
  let made = byOptions.get(key);
  if (!made) byOptions.set(key, (made = new Format(undefined, { style: 'narrow', ...options })));
  return made;
}

function format(duration: Duration, options: Record<string, string>, Format: DurationFormatConstructor | null): string {
  if (Format) return formatter(Format, options).format(duration);
  // Zotero's own fallback where the platform has no DurationFormat
  const { days, hours, minutes } = duration;
  if (days > 0) return options.minutesDisplay === 'auto' && !hours && !minutes ? `${days}d` : `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * The time as Zotero writes it; null when it is unknown or past 90 days.
 * Nothing left, or less, is 0m.
 */
export function formatTimeLeft(
  minutes: number | null | undefined,
  Format: DurationFormatConstructor | null = nativeFormat(),
): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes > UNLIMITED_MINUTES) return null;
  let rest = Math.max(0, Math.ceil(minutes));
  const days = Math.floor(rest / (60 * 24));
  const hours = Math.floor((rest % (60 * 24)) / 60);
  rest %= 60;
  return format({ days, hours, minutes: rest }, { daysDisplay: 'auto', hoursDisplay: 'auto', minutesDisplay: 'always' }, Format);
}

/** The 90 days a range of times tops out at, in days alone: the settings add a + to it. */
export function formatOverUnlimited(Format: DurationFormatConstructor | null = nativeFormat()): string {
  return format({ days: UNLIMITED_MINUTES / (60 * 24), hours: 0, minutes: 0 }, { daysDisplay: 'always', hoursDisplay: 'auto', minutesDisplay: 'auto' }, Format);
}

/** Under 3 minutes, or nothing left: the time is drawn red. */
export function isLowTime(minutes: number | null | undefined): boolean {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes < LOW_MINUTES;
}
