import type { AnyFn } from './proto-patches';

export interface PlayerVoiceListDeps {
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
}

/**
 * One list for the Player's voice dropdown and the voice keys (#106): the
 * selected voice's language alone. Zotero's own `voicesForLanguage` is
 * compatible rather than exclusive, two ways:
 * - with a region asked for it admits the voices with none, and without
 *   one every region (`isLanguageSupported`, reader.js 38110);
 * - it cannot tell zh-CN, zh-HK and zh-TW apart at all (`normalizeLanguage`,
 *   38103), so a Hong Kong voice's list held every Chinese one.
 * Since issue #223 a language lists only the voices of its own locale, as
 * the language dropdown files them (language-dropdown.ts) — generic
 * English too. A wildcard selection, or none, keeps Zotero's list.
 */
export function createPlayerVoiceList(deps: PlayerVoiceListDeps) {
  const entries: { manager: any; own?: PropertyDescriptor; original: AnyFn }[] = [];
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const managerOf = (reader: any) => waive(reader?._internalReader?._readAloudManager);
  const prune = () => {
    for (let i = entries.length - 1; i >= 0; i--) if (deps.isDead?.(entries[i].manager)) entries.splice(i, 1);
  };

  function ofSelectedLanguage(list: any, selectedID: unknown): any {
    let language = '';
    // Reader arrays cannot call sandbox callbacks. Keep their voice instances
    // and array realm: cloning voices would lose their native methods.
    for (let i = 0; i < list.length; i++) {
      if (list[i]?.id === selectedID && typeof list[i].language === 'string') {
        language = list[i].language; break;
      }
    }
    // The selected voice decides, never the requested `_region`, which can be
    // stale: _applyVoice reads this getter right after setting the voice ID,
    // and the voice must be in what it reads.
    if (!language || language === '*') return list;
    const result: any = Reflect.apply(list.slice, list, []);
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i]?.language !== language) {
        Reflect.apply(result.splice, result, [i, 1]);
      }
    }
    return result;
  }

  function attach(reader: unknown): boolean {
    try {
      prune();
      const manager = managerOf(reader);
      if (!manager) return false;
      if (entries.some(e => e.manager === manager)) return true;
      let owner = manager;
      while (owner && !Object.prototype.hasOwnProperty.call(owner, 'voicesForLanguage')) owner = Object.getPrototypeOf(owner);
      const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'voicesForLanguage');
      if (!descriptor?.get) return false;
      const original = descriptor.get;
      const own = Object.getOwnPropertyDescriptor(manager, 'voicesForLanguage');
      const getter = function (this: any) {
        const m = waive(this);
        const list = Reflect.apply(original, m, []);
        try { return ofSelectedLanguage(list, m.selectedVoiceID); }
        catch (e) { deps.error(e); return list; }
      };
      Object.defineProperty(manager, 'voicesForLanguage', {
        configurable: true, enumerable: descriptor.enumerable,
        get: deps.exportFunction ? deps.exportFunction(getter, manager) : getter,
      });
      entries.push({ manager, own, original });
      return true;
    } catch (e) { deps.error(e); return false; }
  }

  function inspect(reader: unknown) {
    const manager = managerOf(reader);
    if (!manager) return null;
    const entry = entries.find(e => e.manager === manager);
    const native = entry ? Reflect.apply(entry.original, manager, []) : manager.voicesForLanguage;
    const offered = manager.voicesForLanguage;
    return { patched: !!entry, compatible: native?.length ?? 0, offered: offered?.length ?? 0,
      selected: manager.selectedVoiceID ?? null };
  }

  function dispose() {
    prune();
    for (const { manager, own } of entries.reverse()) {
      try {
        if (own) Object.defineProperty(manager, 'voicesForLanguage', own);
        else delete manager.voicesForLanguage;
      } catch (e) { deps.error(e); }
    }
    entries.length = 0;
  }
  return { attach, inspect, dispose, patchCounts: () => {
    prune(); return { total: entries.length, live: entries.length };
  } };
}
