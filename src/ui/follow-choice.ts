import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

interface Choice extends EventTarget { value: string }

/** XUL radio values are strings; keep the saved default a boolean. */
export function initFollowChoice(
  doc: { getElementById(id: string): Choice | null },
  prefs: PrefsBackend,
  watch: (name: string, changed: () => void) => () => void,
): { dispose(): void } {
  const group = doc.getElementById('ztts-default-auto-scroll');
  if (!group) return { dispose() {} };
  const key = PREF_PREFIX + 'readAloud.defaultAutoScroll';
  const refresh = () => { group.value = prefs.get(key) === false ? 'manual' : 'auto'; };
  const change = () => {
    if (group.value !== 'auto' && group.value !== 'manual') return;
    try { prefs.set(key, group.value === 'auto'); }
    finally { refresh(); }
  };
  group.addEventListener('command', change);
  const stop = watch('zotero-tts.readAloud.defaultAutoScroll', refresh);
  refresh();
  return { dispose() { group.removeEventListener('command', change); stop(); } };
}
