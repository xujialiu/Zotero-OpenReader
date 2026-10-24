import { sentences, t } from '../core/l10n';
import type { FishModelList } from '../core/providers/fish';
import { loadSettings, PREF_PREFIX, SWITCH_IDS, type PrefsBackend, type SwitchId } from '../core/settings';
import { providerNaming } from '../read-aloud/catalog';
import { switchLabel } from '../read-aloud/voice-catalog';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';
import { isSecretField, setSecretLocked } from './secret-rows';
import { initFishVoiceSources } from './fish-voice-sources';
import { initFishModelRows } from './fish-model-rows';

/**
 * Provider settings own the enabled/checking lock and the nested Fish
 * Model and voice-source controls. Callers refresh and dispose the group;
 * field restrictions and repaint order stay inside this module (issue #230).
 *
 * The switch of each provider section, and of Zotero's two tiers (issue
 * #111, rows of the Zotero section wired the same way, with no fields to
 * lock): one button, "Enable" or "Disable".
 * Enable is a commit point — the provider's connection check (the very one
 * Test connection runs, prefs-pane.ts checkProvider) has to pass before
 * the pref goes on, and while it is on the section's fields are locked. So
 * an enabled provider always carries settings that were checked as they
 * are, and the voice browser lists again on the switch alone: no watching
 * of a dozen prefs, no debounce. The outcome is written where Test
 * connection writes its own; a failed check leaves the provider off, with
 * the message.
 *
 * Disable is checked against all current reading sessions (#121). An
 * unused provider may go off; the provider of a playing or paused voice
 * stays on unless the guard's Close and continue closes those players
 * first (#160). Enable is never checked: it only adds voices.
 *
 * Test connection probes without committing. Every check holds the fields
 * until it finishes; then an off section is editable again, with its Model
 * suggestions. An on section lists voices again after a passing check.
 * Results belong to the settings checked, never to a later edit (#214).
 *
 * A switch that cannot go on yet — Zotero's two tiers while no Zotero
 * account is signed in (issue #130) — has its Enable greyed and the reason
 * on its line; one already on can still be switched off. The answer is
 * asked at every paint, so refresh() follows a sign-in.
 */

export interface CheckOutcome {
  ok: boolean;
  message: string;
}

export interface ProviderRowsDeps extends ReadingGuardDeps {
  prefs: PrefsBackend;
  /** The provider's connection check as Test connection runs it, on the prefs as they are; bounded, never hanging. */
  check(id: SwitchId): Promise<CheckOutcome>;
  /** A provider went on or off, or one that is on was checked again: the voice browser lists again. */
  onVoicesChanged(): void;
  /**
   * A provider's switch was just written, with its new value. The system
   * provider uses it to hide Zotero's own copies of the very voices it has
   * begun publishing, and to keep a choice that named one of them
   * (ui/prefs-pane.ts).
   */
  onSwitched?(id: SwitchId, on: boolean): void;
  /** The existing bounded, cached Fish Model list; reading it requests no synthesis. */
  loadFishModels(): Promise<FishModelList>;
  /** Pref names are relative to extensions.zotero, as in Zotero.Prefs.registerObserver. */
  watch?(name: string, changed: () => void): () => void;
  /** A switch changed outside these rows: refresh the pane's catalog and account information. */
  onExternalSwitch?(id: SwitchId): void;
  /** Why the switch cannot go on right now, or null when it can. Absent, every switch can. */
  blocked?(id: SwitchId): string | null;
  /** A Test connection's or an Enable's check has just finished, passed or failed: the Zotero section reads its credits again (issue #159). */
  onChecked?(id: SwitchId): void;
}

export interface ProviderRows {
  refresh(): void;
  verifyEnabled(): Promise<string>;
  dispose(): void;
}

type CheckedOutcome = CheckOutcome & { stale?: boolean };

/** The section's elements: the groupbox holding the fields, the switch, Test connection, and the line both write to. */
export function providerRowIds(id: SwitchId): { section: string; toggle: string; test: string; result: string } {
  return { section: `ztts-provider-${id}`, toggle: `ztts-enable-${id}`, test: `ztts-test-${id}`, result: `ztts-test-result-${id}` };
}

/** The section's fields: every input and the Server dropdown — the buttons are not among them. */
const FIELDS_SELECTOR = 'input, menulist, checkbox';

export function initProviderRows(
  doc: { getElementById(id: string): any },
  deps: ProviderRowsDeps,
): ProviderRows {
  const pref = (id: SwitchId) => `${PREF_PREFIX}${id}.enabled`;
  const enabled = (id: SwitchId) => deps.prefs.get(pref(id)) === true;
  /** Checks hold the section, including its independently painted nested controls. */
  const busy = new Set<SwitchId>();
  const writing = new Set<SwitchId>();
  const stops: Array<() => void> = [];
  let disposed = false;
  const locked = (id: SwitchId): boolean => disposed || enabled(id) || busy.has(id);
  const setEnabled = (id: SwitchId, on: boolean): void => {
    writing.add(id);
    try {
      deps.prefs.set(pref(id), on);
    } finally {
      writing.delete(id);
    }
  };

  const elements = (id: SwitchId) => {
    const ids = providerRowIds(id);
    return {
      section: doc.getElementById(ids.section),
      toggle: doc.getElementById(ids.toggle),
      test: doc.getElementById(ids.test),
      result: doc.getElementById(ids.result),
    };
  };
  /** The line beside the buttons, written as text: a description's `value` never wraps (issue #31). */
  const say = (id: SwitchId, text: string) => {
    const line = elements(id).result;
    if (line) line.textContent = text;
  };
  const fields = (id: SwitchId): any[] => Array.from(elements(id).section?.querySelectorAll?.(FIELDS_SELECTOR) ?? []);
  /** The reason each blocked switch shows on its line, so it can leave once it no longer holds. */
  const shown = new Map<SwitchId, string>();
  const blocked = (id: SwitchId): string | null => deps.blocked?.(id) ?? null;

  /**
   * The switch and the fields as the pref says: on is "Disable" with the
   * fields locked, off is "Enable" with them open for editing — greyed
   * while the switch cannot go on, with the reason on its line.
   */
  function paint(id: SwitchId): void {
    if (disposed) return;
    const { toggle, test, result } = elements(id);
    const on = enabled(id);
    const checking = busy.has(id);
    const reason = blocked(id);
    toggle?.setAttribute('label', checking ? t('ztts-switch-checking') : on ? t('ztts-switch-disable') : t('ztts-switch-enable'));
    if (toggle) toggle.disabled = checking || (!on && reason !== null);
    if (test) test.disabled = checking;
    if (!checking && reason !== null) {
      say(id, reason);
      shown.set(id, reason);
    } else if (!checking && shown.has(id)) {
      // Only the reason leaves: a line written since it was shown stays
      if (result?.textContent === shown.get(id)) say(id, '');
      shown.delete(id);
    }
    for (const field of fields(id)) {
      field.disabled = locked(id);
      // A secret the user uncovered to edit it would stay in the clear behind
      // the lock, with its eye greyed out and nothing able to cover it again
      // (issue #19). So locking covers it: while a provider is on, its
      // secrets cannot be read at all.
      if (isSecretField(field)) setSecretLocked(field, locked(id));
    }
    // The generic field lock and Fish's Manual voices restriction are one
    // paint, including checks and external switch/account changes.
    if (id === 'fish') fishVoiceSources.refresh();
  }

  function hold(id: SwitchId): void {
    busy.add(id);
    paint(id);
  }

  /**
   * Compare in the caller's continuation, immediately before accepting the
   * result: another pref write can run between this promise and its await.
   * The snapshot includes credentials but never leaves this closure (#214).
   */
  async function run(id: SwitchId): Promise<() => CheckedOutcome> {
    const snapshot = () => JSON.stringify(loadSettings(deps.prefs)[id]);
    const checked = snapshot();
    const reason = blocked(id);
    let outcome: CheckOutcome;
    try {
      outcome = await deps.check(id);
    } catch (e) {
      outcome = { ok: false, message: t('ztts-connection-failed', { detail: e instanceof Error ? e.message : String(e) }) };
    }
    return () => snapshot() === checked && blocked(id) === reason
      ? outcome
      : { ok: false, stale: true, message: t('ztts-provider-settings-changed') };
  }

  async function onToggle(id: SwitchId): Promise<void> {
    if (disposed || busy.has(id)) return;
    if (enabled(id)) {
      if (await refuseWhileReading(deps, { [`${id}.enabled`]: false }) || disposed) return;
      setEnabled(id, false);
      deps.onSwitched?.(id, false);
      // The last check's "Connected…" beside an Enable button would read as
      // if it still held; cleared first, so a reason Enable is greyed for stands
      say(id, '');
      paint(id);
      deps.onVoicesChanged();
      return;
    }
    // Greyed, so only a command sent past the button lands here
    if (blocked(id) !== null) {
      paint(id);
      return;
    }
    // Never asked: turning a provider on only adds voices to the open
    // players' lists, which refresh without touching the reading (issue #160)
    hold(id);
    elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
    say(id, t('ztts-switch-checking'));
    const completed = await run(id);
    if (disposed) return;
    const outcome = completed();
    say(id, outcome.message);
    if (outcome.ok) {
      setEnabled(id, true);
      deps.onSwitched?.(id, true);
    }
    busy.delete(id);
    paint(id);
    deps.onChecked?.(id);
    if (outcome.ok) deps.onVoicesChanged();
  }

  async function onTest(id: SwitchId): Promise<void> {
    if (disposed || busy.has(id)) return;
    hold(id);
    say(id, t('ztts-switch-testing'));
    const completed = await run(id);
    if (disposed) return;
    const outcome = completed();
    say(id, outcome.message);
    busy.delete(id);
    paint(id);
    deps.onChecked?.(id);
    if (outcome.ok && enabled(id)) deps.onVoicesChanged();
  }

  const fishVoiceSources = initFishVoiceSources(doc, {
    prefs: deps.prefs,
    locked: () => locked('fish'),
    watch: deps.watch,
  });
  const fishModelRows = initFishModelRows(doc, {
    prefs: deps.prefs,
    t,
    loadList: deps.loadFishModels,
    locked: () => locked('fish'),
    watch: deps.watch,
  });

  for (const id of SWITCH_IDS) {
    const { toggle, test } = elements(id);
    const toggleCommand = () => onToggle(id);
    const testCommand = () => onTest(id);
    toggle?.addEventListener('command', toggleCommand);
    test?.addEventListener('command', testCommand);
    stops.push(() => {
      toggle?.removeEventListener?.('command', toggleCommand);
      test?.removeEventListener?.('command', testCommand);
    });
    const stop = deps.watch?.(`zotero-tts.${id}.enabled`, () => {
      if (disposed || writing.has(id)) return;
      if (!busy.has(id)) say(id, '');
      paint(id);
      deps.onExternalSwitch?.(id);
    });
    if (stop) stops.push(stop);
    paint(id);
  }

  // The known Model entries are already painted; its bounded list only
  // adds entries and preserves the section's lock when it arrives.
  void fishModelRows.load();

  /** Refresh the whole group after a restore or account change without releasing a checking section. */
  function refresh(): void {
    if (disposed) return;
    for (const id of SWITCH_IDS) if (!busy.has(id)) paint(id);
    fishVoiceSources.refresh();
    fishModelRows.refresh();
  }

  /**
   * The commit point a restore skipped (issue #21). A backup writes the four
   * switches straight to the prefs (core/settings-backup.ts applyBackup), so
   * a restore can leave a provider on carrying settings that have never
   * worked here — a local address from another machine, a key rotated since,
   * an expired gateway token. Every provider the restored prefs say is on is
   * checked as Enable would have checked it, and one that fails goes back
   * off with its message where Enable would have put it.
   *
   * All at once rather than one after another: each check is bounded by its
   * own timeout, and four in a row would be a minute of a pane that looks
   * frozen. Returns one sentence for the restore's message line.
   */
  async function verifyEnabled(): Promise<string> {
    if (disposed) return '';
    const inUse = (id: SwitchId) => !!deps.affectedTabs?.({ [`${id}.enabled`]: false }).length;
    const wanted = SWITCH_IDS.filter((id) => enabled(id) && !busy.has(id) && !inUse(id));
    if (!wanted.length) return '';
    for (const id of wanted) {
      hold(id);
      elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
      say(id, t('ztts-switch-checking'));
    }
    const turnedOff: SwitchId[] = [];
    let stale = false;
    await Promise.all(
      wanted.map(async (id) => {
        const completed = await run(id);
        if (disposed) return;
        const outcome = completed();
        stale ||= !!outcome.stale;
        if (!outcome.ok && !outcome.stale && !inUse(id)) {
          setEnabled(id, false);
          deps.onSwitched?.(id, false);
          turnedOff.push(id);
        }
        say(id, outcome.message);
        busy.delete(id);
        paint(id);
      }),
    );
    if (disposed) return '';
    const changed = stale ? t('ztts-provider-settings-changed') : '';
    if (!turnedOff.length) return changed || t('ztts-providers-checked', { count: wanted.length });
    // The switches moved, so the voice browser lists again — once, after all of them
    deps.onVoicesChanged();
    // As the Player names them (issue #193): the ids are shown nowhere else
    const naming = providerNaming(loadSettings(deps.prefs));
    const named = SWITCH_IDS.filter((id) => turnedOff.includes(id)).map((id) => switchLabel(id, naming)).join(', ');
    return sentences(t('ztts-providers-turned-off', { named, count: turnedOff.length }), changed);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const stop of stops.splice(0)) stop();
    fishVoiceSources.dispose();
    fishModelRows.dispose();
    busy.clear();
  }

  return { refresh, verifyEnabled, dispose };
}
