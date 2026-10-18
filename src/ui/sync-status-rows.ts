import { sentences, t } from '../core/l10n';
import type { SettingsSyncApplied, SettingsSyncStats } from '../core/settings-sync-transport';
import type { PositionTransportStats } from '../read-aloud/position-transport';
import { switchLabel, type TierNaming } from '../read-aloud/voice-catalog';

/**
 * The two lines of the Sync group (#68), one under each switch: what the
 * last sync of the reading positions and the last sync of the settings did
 * on this computer, in the user's terms — when, how many came in and (for
 * the settings) from which computer, what waits for the reading to stop,
 * and any provider held off here with the check's message. Each line is
 * written from its transport's stats when the pane loads, after every
 * completed sync of that transport while the pane is open, and when its
 * switch moves; hidden while its switch is off. A settings sync that
 * changed settings here also redraws the rows that do not bind their pref —
 * the restore's own redraw (ui/prefs-pane.ts onRestored).
 *
 * The positions switch covers two files, the plugin's own and the Positions
 * File the phone shares (issue #207): its line is written from the plugin's
 * own file, and reports a failure of either.
 *
 * Opening the pane is itself a trigger, and that sync usually finds nothing
 * new — so each line keeps naming the last batch that did bring something
 * here, with its own time, instead of letting "nothing new" bury it
 * (measured 2026-09-10: the applied form lived ~100 ms before the pane's
 * own sync overwrote it).
 */

export const SYNC_STATUS_IDS = {
  positions: 'ztts-sync-positions-status',
  settings: 'ztts-sync-settings-status',
} as const;

interface LineDeps<Stats, Report> {
  /** The switch; off, the line is empty and hidden. */
  enabled(): boolean;
  /** The transport's stats (src/index.ts); null while it is not running. */
  stats(): Stats | null;
  /** A listener for every completed sync of that transport; returns the unsubscribe. */
  watch(onSynced: (report: Report) => void): () => void;
  /** The switch's pref observer; returns the unsubscribe. */
  watchSwitch(onChange: () => void): () => void;
}

/** What the positions line reads of the Positions File's sync: its last outcome. */
export type SyncOutcome = Pick<PositionTransportStats, 'lastOutcome' | 'lastAt' | 'lastError'>;

export interface SyncStatusDeps {
  /** A clock time for the lines, in the user's locale. */
  formatTime(ts: number): string;
  settings: LineDeps<SettingsSyncStats, SettingsSyncApplied | null> & {
    /** A sync changed settings on this computer: the pane's unbound rows redraw. */
    onApplied(): void;
    /** What a held provider's name depends on: the local engine's (issue #193). Absent, the local switch reads "Local". */
    naming?(): TierNaming;
  };
  positions: LineDeps<PositionTransportStats, void> & {
    /** The Positions File's sync (issue #207), whose completed syncs `watch` hears too; null while it is not running. */
    shared(): SyncOutcome | null;
  };
}

/** A sync that failed, or is waiting out the window after a failure. */
const failed = (stats: SyncOutcome | null): stats is SyncOutcome & { lastAt: number } =>
  !!stats && stats.lastAt !== null && (stats.lastOutcome === 'error' || (stats.lastOutcome === 'skipped' && !!stats.lastError));

const fromOf = (report: SettingsSyncApplied) => (report.from.length ? report.from.join(', ') : t('ztts-sync-other-computer'));

/** The settings line's text for these stats, each held provider by its name (issue #193); empty while the switch is off. */
export function settingsStatusText(stats: SettingsSyncStats | null, enabled: boolean, formatTime: (ts: number) => string, naming: TierNaming = {}): string {
  if (!enabled) return '';
  if (!stats || stats.lastAt === null || stats.lastOutcome === null) return t('ztts-sync-status-waiting');
  const time = formatTime(stats.lastAt);
  if (stats.lastOutcome === 'error' || (stats.lastOutcome === 'skipped' && stats.lastError)) {
    return t('ztts-sync-status-failed', { time, detail: stats.lastError ?? '' });
  }
  if (stats.lastOutcome === 'skipped') return t('ztts-sync-status-waiting');
  const adopted = stats.adopted ?? 0;
  const last = stats.lastApplied;
  const lead =
    adopted > 0 && last
      ? t('ztts-sync-status-applied', { time, count: adopted, from: fromOf(last) })
      : last && last.applied.length
        ? t('ztts-sync-status-last', { time, count: last.applied.length, from: fromOf(last), when: formatTime(last.at) })
        : t('ztts-sync-status-none', { time });
  const deferred = stats.deferred ? t('ztts-sync-status-deferred', { count: stats.deferred }) : '';
  const held = Object.entries(stats.held).map(([id, reason]) => t('ztts-sync-status-held', { provider: switchLabel(id, naming), reason }));
  return sentences(lead, deferred, ...held);
}

/**
 * The reading-positions line's text for these stats; empty while the switch
 * is off. A failure of either file is reported, the plugin's own first;
 * everything else is the plugin's own file's (issue #207).
 */
export function positionsStatusText(
  stats: PositionTransportStats | null,
  enabled: boolean,
  formatTime: (ts: number) => string,
  shared: SyncOutcome | null = null,
): string {
  if (!enabled) return '';
  for (const file of [stats, shared]) {
    if (failed(file)) return t('ztts-positions-status-failed', { time: formatTime(file.lastAt), detail: file.lastError ?? '' });
  }
  if (!stats || stats.lastAt === null || stats.lastOutcome === null) return t('ztts-positions-status-waiting');
  const time = formatTime(stats.lastAt);
  if (stats.lastOutcome === 'skipped') return t('ztts-positions-status-waiting');
  const adopted = stats.adopted ?? 0;
  const last = stats.lastAdoption;
  if (adopted > 0) return t('ztts-positions-status-taken', { time, count: adopted });
  if (last) return t('ztts-positions-status-last', { time, when: formatTime(last.at) });
  return t('ztts-positions-status-none', { time });
}

interface LineElement {
  textContent: string;
  hidden?: boolean | string;
}

export function initSyncStatusRows(
  doc: { getElementById(id: string): LineElement | null },
  deps: SyncStatusDeps,
): { refresh(): void; dispose(): void } {
  const positions = doc.getElementById(SYNC_STATUS_IDS.positions);
  const settings = doc.getElementById(SYNC_STATUS_IDS.settings);
  const show = (line: LineElement | null, text: string) => {
    if (!line) return;
    line.textContent = text;
    // An empty description still takes a line's height under the switch
    line.hidden = text === '';
  };
  const refreshPositions = () => show(positions, positionsStatusText(deps.positions.stats(), deps.positions.enabled(), deps.formatTime, deps.positions.shared()));
  const refreshSettings = () => show(settings, settingsStatusText(deps.settings.stats(), deps.settings.enabled(), deps.formatTime, deps.settings.naming?.()));
  const refresh = () => {
    refreshPositions();
    refreshSettings();
  };
  refresh();
  const unwatch = [
    deps.positions.watch(refreshPositions),
    deps.positions.watchSwitch(refreshPositions),
    deps.settings.watch((report) => {
      if (report && report.applied.length) deps.settings.onApplied();
      refreshSettings();
    }),
    deps.settings.watchSwitch(refreshSettings),
  ];
  return {
    refresh,
    dispose: () => {
      for (const off of unwatch) off();
    },
  };
}
