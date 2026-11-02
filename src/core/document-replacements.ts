import {
  parseDocumentReplacements,
  parseReplacements,
  serializeDocumentReplacements,
  serializeReplacements,
  type DocumentReplacements,
  type Replacement,
} from './replacements';
import { PREF_PREFIX, type PrefsBackend } from './settings';

/**
 * Where the replacements live (issue #237). The global list is one setting,
 * `readAloud.replacements`, carried whole by the backup and the sync. Each
 * document's list is a record of its own under `documentReplacements.`,
 * keyed like the Document voice (`user/KEY`, `group-N/KEY`), with the time
 * it was set: the sync takes the newer record, an emptied list included.
 */

export const GLOBAL_REPLACEMENTS_KEY = 'readAloud.replacements';
export const DOCUMENT_REPLACEMENTS_BRANCH = 'documentReplacements.';
/** The pulse a document's save writes, as Zotero.Prefs.registerObserver wants it: records have dynamic keys. */
export const DOCUMENT_REPLACEMENTS_CHANGED = 'zotero-tts.documentReplacementsChanged';

export function readGlobalReplacements(prefs: PrefsBackend): Replacement[] {
  return parseReplacements(prefs.get(PREF_PREFIX + GLOBAL_REPLACEMENTS_KEY));
}

export function writeGlobalReplacements(prefs: PrefsBackend, rows: readonly Replacement[]): void {
  prefs.set(PREF_PREFIX + GLOBAL_REPLACEMENTS_KEY, serializeReplacements(rows));
}

export function isDocumentReplacementsKey(key: string): boolean {
  return /^documentReplacements\.(?:user|group-[1-9]\d*)\/[A-Z0-9]{8}$/.test(key);
}

/** Every document's record, keyed as the backup and the sync carry them. */
export function documentReplacementSettings(prefs: PrefsBackend): Record<string, string> {
  const values: Record<string, string> = {};
  for (const full of prefs.keys?.(PREF_PREFIX + DOCUMENT_REPLACEMENTS_BRANCH) ?? []) {
    const key = full.slice(PREF_PREFIX.length);
    const record = parseDocumentReplacements(prefs.get(full));
    if (isDocumentReplacementsKey(key) && record) values[key] = serializeDocumentReplacements(record);
  }
  return values;
}

/** Positive means a wins: the newer record, then a fixed order of the content so two computers converge on a tie. */
export function compareDocumentReplacements(a: DocumentReplacements, b: DocumentReplacements): number {
  const left = serializeReplacements(a.rows), right = serializeReplacements(b.rows);
  return a.ts - b.ts || (left < right ? -1 : left > right ? 1 : 0);
}

export function createDocumentReplacements(prefs: PrefsBackend, now = Date.now) {
  function key(document: string): string {
    const name = DOCUMENT_REPLACEMENTS_BRANCH + document;
    if (!isDocumentReplacementsKey(name)) throw new Error('Invalid document identity');
    return PREF_PREFIX + name;
  }
  function get(document: string): DocumentReplacements | null {
    return parseDocumentReplacements(prefs.get(key(document)));
  }
  return {
    get,
    rows(document: string | null): Replacement[] {
      return document ? get(document)?.rows ?? [] : [];
    },
    save(document: string, rows: readonly Replacement[]): DocumentReplacements {
      const record = { rows: [...rows], ts: Math.max(now(), (get(document)?.ts ?? 0) + 1) };
      prefs.set(key(document), serializeDocumentReplacements(record));
      const pulse = PREF_PREFIX + 'documentReplacementsChanged';
      prefs.set(pulse, String(Number(prefs.get(pulse) || 0) + 1));
      return record;
    },
  };
}
