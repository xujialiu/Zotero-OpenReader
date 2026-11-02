import { sameReplacement, serializeReplacements, type Replacement } from '../core/replacements';

/**
 * The replacements dialog's table (issue #237), without the window: the
 * document's rows above the global ones (ADR 0023), a drag only within a
 * row's own list, a new row at the end of its list, and a global row greyed
 * where a document row with the same text, mode and case takes its place.
 * Opened from the settings, there is no document: the global rows alone.
 */

export type ReplacementScope = 'document' | 'global';

export interface TableRow {
  row: Replacement;
  scope: ReplacementScope;
}

export function createReplacementsModel(input: { document: readonly Replacement[] | null; global: readonly Replacement[] }) {
  const mode: ReplacementScope = input.document ? 'document' : 'global';
  const lists: Record<ReplacementScope, Replacement[]> = { document: [...(input.document ?? [])], global: [...input.global] };
  const original = { document: serializeReplacements(lists.document), global: serializeReplacements(lists.global) };

  function rows(): TableRow[] {
    return [...lists.document.map((row) => ({ row, scope: 'document' as const })), ...lists.global.map((row) => ({ row, scope: 'global' as const }))];
  }

  /** The list and the place in it of table row `index`. */
  function locate(index: number): { scope: ReplacementScope; at: number } {
    if (index < 0 || index >= lists.document.length + lists.global.length) throw new RangeError('No such row');
    return index < lists.document.length ? { scope: 'document', at: index } : { scope: 'global', at: index - lists.document.length };
  }

  const offset = (scope: ReplacementScope) => (scope === 'document' ? 0 : lists.document.length);

  function allowed(scope: ReplacementScope): void {
    if (scope === 'document' && mode !== 'document') throw new Error('No document is open');
  }

  return {
    mode,
    rows,
    /** Add at the end of its list; answers the table row it landed on. */
    add(row: Replacement, scope: ReplacementScope): number {
      allowed(scope);
      lists[scope].push(row);
      return offset(scope) + lists[scope].length - 1;
    },
    /** Edit in place; a row moved to the other list goes to its end. Answers its table row. */
    update(index: number, row: Replacement, scope: ReplacementScope): number {
      allowed(scope);
      const from = locate(index);
      if (from.scope === scope) {
        lists[scope][from.at] = row;
        return index;
      }
      lists[from.scope].splice(from.at, 1);
      lists[scope].push(row);
      return offset(scope) + lists[scope].length - 1;
    },
    remove(indices: Iterable<number>): void {
      const places = [...new Set(indices)].map(locate).sort((a, b) => b.at - a.at);
      for (const place of places) lists[place.scope].splice(place.at, 1);
    },
    /** Drag table row `from` to `to`, kept within its own list. Answers where it landed. */
    move(from: number, to: number): number {
      const place = locate(from);
      const list = lists[place.scope];
      const target = Math.max(0, Math.min(list.length - 1, to - offset(place.scope)));
      const [row] = list.splice(place.at, 1);
      list.splice(target, 0, row);
      return offset(place.scope) + target;
    },
    /** A global row that a document row with the same text, mode and case keeps from applying (ADR 0023). */
    overridden(index: number): boolean {
      const place = locate(index);
      if (place.scope !== 'global') return false;
      const row = lists.global[place.at];
      return lists.document.some((mine) => sameReplacement(mine, row));
    },
    /** The table row of the same row already in `scope`'s list, other than `except`; null when there is none. */
    duplicate(row: Replacement, scope: ReplacementScope, except?: number): number | null {
      const list = lists[scope];
      for (let i = 0; i < list.length; i++) {
        const index = offset(scope) + i;
        if (index !== except && sameReplacement(list[i], row)) return index;
      }
      return null;
    },
    result(): { document: Replacement[] | null; global: Replacement[] } {
      return { document: mode === 'document' ? [...lists.document] : null, global: [...lists.global] };
    },
    changed(): { document: boolean; global: boolean } {
      return {
        document: mode === 'document' && serializeReplacements(lists.document) !== original.document,
        global: serializeReplacements(lists.global) !== original.global,
      };
    },
  };
}

export type ReplacementsModel = ReturnType<typeof createReplacementsModel>;
