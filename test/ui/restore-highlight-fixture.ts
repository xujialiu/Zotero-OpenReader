import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { initHighlightRows } from '../../src/ui/highlight-rows';

/** Zotero notifies an open settings pane inside each changed preference write. */
export function openHighlightPane(prefs: PrefsBackend) {
  const watchers = new Map<string, () => void>();
  const set = prefs.set.bind(prefs);
  prefs.set = (key, value) => {
    if (prefs.get(key) === value) return;
    set(key, value);
    watchers.get(key)?.();
  };
  return initHighlightRows({ getElementById: () => null }, prefs, {
    watch(name, changed) {
      const key = 'extensions.zotero.' + name;
      watchers.set(key, changed);
      return () => watchers.delete(key);
    },
  });
}

export const sentence = PREF_PREFIX + 'highlight.sentence';
export const word = PREF_PREFIX + 'highlight.word';
