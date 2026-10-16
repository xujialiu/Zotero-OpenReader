import { DEFAULT_FISH_MODEL, FISH_MODELS, type FishModelInfo, type FishModelList } from '../core/providers/fish';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

/**
 * The Fish Audio section's Model dropdown (issue #182): the models the
 * plugin knows, then any text-to-speech model only Fish's own list
 * carries, each with what it costs. Unbound, since its entries arrive
 * after the pane is drawn: it writes the pref itself.
 */
export const FISH_MODEL_MENU_ID = 'ztts-fish-model';
export const FISH_MODEL_PREF = PREF_PREFIX + 'fish.model';
/** The same pref, for Zotero.Prefs.registerObserver (names relative to extensions.zotero.). */
export const FISH_MODEL_OBSERVER = 'zotero-tts.fish.model';

type Translate = (id: string, args?: Record<string, string>) => string;

export type FishModelOption = { id: string; label: string };

function priceLabel(id: string, info: FishModelInfo | undefined, listed: { free: boolean } | undefined, t: Translate): string {
  if (info) {
    if (info.price.free) return t('ztts-fish-model-free', { model: id });
    const price = String(info.price.usdPerMillion);
    return info.price.unit === 'byte' ? t('ztts-fish-model-bytes', { model: id, price }) : t('ztts-fish-model-chars', { model: id, price });
  }
  // Fish's list gives a price without its unit: say free or paid, no number
  if (listed) return listed.free ? t('ztts-fish-model-free', { model: id }) : t('ztts-fish-model-paid', { model: id });
  return id;
}

/**
 * The dropdown's entries: the known models in their order, then those only
 * Fish's list carries, then the chosen model when neither offers it. While
 * the list is still on its way (`null`), the known models alone.
 */
export function fishModelOptions(selected: string, list: FishModelList | null, t: Translate): FishModelOption[] {
  const ids = FISH_MODELS.map((model) => model.id);
  if (list?.ok) for (const id of list.models.keys()) if (!ids.includes(id)) ids.push(id);
  if (selected && !ids.includes(selected)) ids.push(selected);
  return ids.map((id) => ({ id, label: priceLabel(id, FISH_MODELS.find((model) => model.id === id), list?.ok ? list.models.get(id) : undefined, t) }));
}

export interface FishModelRowsDeps {
  prefs: PrefsBackend;
  t: Translate;
  /** Fish's list, through the provider's session cache; never throws. */
  loadList(): Promise<FishModelList>;
  /** Whether Fish Audio is enabled: its fields are locked then, and a pick is ignored. */
  fishEnabled(): boolean;
  /** Repaints when the pref changes elsewhere: a restore, the sync. */
  watch?(observer: string, onChange: () => void): () => void;
}

export interface FishModelRows {
  /** Redraw the entries and select the stored model. */
  refresh(): void;
  /** Ask Fish's list and redraw with it. */
  load(): Promise<void>;
  dispose(): void;
}

export function initFishModelRows(doc: { getElementById(id: string): any }, deps: FishModelRowsDeps): FishModelRows {
  const menu = doc.getElementById(FISH_MODEL_MENU_ID);
  let list: FishModelList | null = null;
  let disposed = false;
  const stops: Array<() => void> = [];
  const stored = (): string => {
    const value = deps.prefs.get(FISH_MODEL_PREF);
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_FISH_MODEL;
  };
  const enabled = (): boolean => {
    try {
      return deps.fishEnabled();
    } catch {
      return false;
    }
  };

  /** XUL's own menulist calls build the entries: `appendItem(label, value)` and `removeAllItems()`. */
  function refresh(): void {
    if (disposed || !menu?.appendItem) return;
    const selected = stored();
    menu.removeAllItems();
    for (const option of fishModelOptions(selected, list, deps.t)) menu.appendItem(option.label, option.id);
    menu.value = selected;
  }

  const onCommand = (): void => {
    if (disposed) return;
    const picked = String(menu.value ?? '');
    // A locked section takes no pick, even a synthetic one
    if (enabled() || !picked) {
      refresh();
      return;
    }
    if (picked !== stored()) deps.prefs.set(FISH_MODEL_PREF, picked);
  };
  menu?.addEventListener?.('command', onCommand);
  stops.push(() => menu?.removeEventListener?.('command', onCommand));
  if (deps.watch) stops.push(deps.watch(FISH_MODEL_OBSERVER, refresh));
  refresh();

  return {
    refresh,
    async load() {
      const read = await deps.loadList();
      if (disposed) return;
      list = read;
      refresh();
    },
    dispose() {
      disposed = true;
      for (const stop of stops.splice(0)) stop();
    },
  };
}
