import {
  DEFAULTS,
  loadSettings,
  PREF_PREFIX,
  PREFETCH_REQUESTS_MAX,
  PREFETCH_REQUESTS_MIN,
  PREFETCH_SENTENCES_MAX,
  PREFETCH_SENTENCES_MIN,
  type PrefsBackend,
} from '../core/settings';

/**
 * The prefetch's two numbers (issue #166, ADR 0013): sentences ahead and
 * requests at once, used while *Custom prefetch* is on.
 *
 * The fields are not bound to their prefs: while the switch is off they
 * show the defaults the reading uses, grayed, and the numbers the user set
 * stay in the prefs for when it is on again. An entry is written clamped
 * into its range, and the field then shows what was kept. The switch itself
 * is a bound checkbox; the rows watch it and the two numbers, which a
 * restore or the settings sync also write.
 */

export const PREFETCH_IDS = { sentences: 'ztts-prefetch-sentences', requests: 'ztts-prefetch-requests' } as const;

const CUSTOM_PREF = `${PREF_PREFIX}readAloud.prefetchCustom`;
const SENTENCES_PREF = `${PREF_PREFIX}readAloud.prefetchSentences`;
const REQUESTS_PREF = `${PREF_PREFIX}readAloud.prefetchRequests`;

/** The three prefs, as `Zotero.Prefs.registerObserver` names them (relative to `extensions.zotero.`). */
export const PREFETCH_OBSERVERS: readonly string[] = [CUSTOM_PREF, SENTENCES_PREF, REQUESTS_PREF].map((pref) => pref.slice('extensions.zotero.'.length));

export interface PrefetchRowsDeps {
  prefs: PrefsBackend;
  /** `Zotero.Prefs.registerObserver` on PREFETCH_OBSERVERS; returns the unregister. Omitted, the rows only follow `refresh()`. */
  watch?(onChange: () => void): () => void;
}

interface NumberField {
  value: string;
  disabled: boolean;
  addEventListener(type: 'change', fn: () => void): void;
}

export function initPrefetchRows(doc: { getElementById(id: string): any }, deps: PrefetchRowsDeps): { refresh(): void; dispose(): void } {
  const fields = [
    { field: doc.getElementById(PREFETCH_IDS.sentences) as NumberField | null, pref: SENTENCES_PREF, min: PREFETCH_SENTENCES_MIN, max: PREFETCH_SENTENCES_MAX },
    { field: doc.getElementById(PREFETCH_IDS.requests) as NumberField | null, pref: REQUESTS_PREF, min: PREFETCH_REQUESTS_MIN, max: PREFETCH_REQUESTS_MAX },
  ];

  function paint(): void {
    const { prefetchCustom, prefetchSentences, prefetchRequests } = loadSettings(deps.prefs).readAloud;
    const shown = prefetchCustom ? [prefetchSentences, prefetchRequests] : [DEFAULTS.readAloud.prefetchSentences, DEFAULTS.readAloud.prefetchRequests];
    fields.forEach(({ field }, i) => {
      if (!field) return;
      field.value = String(shown[i]);
      field.disabled = !prefetchCustom;
    });
  }

  for (const { field, pref, min, max } of fields) {
    field?.addEventListener('change', () => {
      const entered = Number.parseFloat(field.value);
      if (loadSettings(deps.prefs).readAloud.prefetchCustom && Number.isFinite(entered)) {
        const kept = Math.min(max, Math.max(min, Math.round(entered)));
        // The observer repaints; a value already there notifies nobody
        if (deps.prefs.get(pref) !== kept) deps.prefs.set(pref, kept);
      }
      paint();
    });
  }

  const stop = deps.watch?.(paint);
  paint();
  return { refresh: paint, dispose: () => stop?.() };
}
