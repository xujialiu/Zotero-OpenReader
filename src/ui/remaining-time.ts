import type { RemainingSnapshot } from '../core/engine/session';
import type { L10nArgs } from '../core/l10n';

/** One compact line, shared by the visible text, tooltip, and accessible label. */
export interface RemainingTimeLine { text: string }

export function remainingTimeLines(value: RemainingSnapshot, t: (id: string, args?: L10nArgs) => string): RemainingTimeLine[] {
  if (value.status === 'estimating') return [{ text: t('ztts-time-estimating') }];
  if (value.status === 'unavailable') return [{ text: t('ztts-time-unavailable') }];
  if (value.status === 'finished') return [{ text: t('ztts-time-finished') }];
  const label = (name: string, seconds: number): string => {
    const time = t('ztts-time-minutes', { minutes: Math.max(1, Math.floor(seconds / 60) + 1) });
    return t('ztts-time-summary', { name, time });
  };
  let text = label(value.scope === 'selection' ? t('ztts-time-selection') : t('ztts-time-document'), value.seconds ?? 0);
  if (value.scope === 'document' && value.sectionTitle && value.sectionSeconds !== undefined) {
    text = t('ztts-time-pair', { document: text, section: label(t('ztts-time-section'), value.sectionSeconds) });
  }
  return [{ text }];
}
